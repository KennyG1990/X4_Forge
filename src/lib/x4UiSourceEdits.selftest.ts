import { strict as assert } from 'node:assert';
import type { ModWorkspace, PassthroughFile } from '../types';
import {
  buildX4UiCallModel,
  type X4UiCallModel,
} from './x4UiCallModel';
import {
  projectX4UiPreviewPipeline,
  type X4UiPreviewPipelineInput,
  type X4UiPreviewSelection,
} from './x4UiPreviewPipeline';
import { createX4UiEditorSessionOwner } from './x4UiEditorSession';
import {
  canonicalizeX4UiLayoutModel,
  createX4UiLayoutTargetCatalog,
  getIssuedX4UiLayoutExpandedCallMetadata,
  isExactX4UiLayoutColorValue,
  isIssuedX4UiLayoutEvidencePair,
  isIssuedX4UiLayoutEvidencePairForModel,
  projectX4UiLayoutProgram,
  reprojectX4UiLayoutProgramWithIssuedColorAuthority,
  validateX4UiLayoutEvidencePair,
  type X4UiLayoutEvidenceAuthority,
  type X4UiLayoutOperation,
  type X4UiLayoutProgram,
  type X4UiLayoutProjectionProfile,
  type X4UiLayoutTarget,
} from './x4UiLayoutProgram';
import {
  HELPER_SOURCE_SHA256,
  WIDGET_SOURCE_SHA256,
  X4_LAYOUT_PROVENANCE,
  getRowHeight,
} from './x4UiLayoutKernel';
import {
  X4_UI_CORPUS_FILE_URL,
  X4_UI_CORPUS_MANIFEST_URL,
  X4_UI_CORPUS_STATUS_URL,
  X4_UI_CORPUS_9_00_CONTRACT,
  X4_UI_CORPUS_COLORS_XML_PATH,
  X4_UI_CORPUS_COLORS_XML_SHA256,
  X4_UI_CORPUS_COLORS_XML_SIZE,
  X4_UI_CORPUS_COLORS_XSD_PATH,
  X4_UI_CORPUS_COLORS_XSD_SHA256,
  X4_UI_CORPUS_COLORS_XSD_SIZE,
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
import {
  buildX4UiWorkspaceSource,
  createX4UiWorkspaceMenu,
  type X4UiWorkspaceSource,
} from './x4UiWorkspaceSource';
import {
  applyX4UiSourceEdit,
  applyX4UiSourceEditRequest,
  applyX4UiSourceWidgetInsertion,
  applyX4UiSourceRowInsertion,
  applyX4UiSourceRowMove,
  applyX4UiSourceStructuralEdit,
  buildX4UiSourceEditCatalog,
  catalogX4UiSourceEdits,
  commitX4UiSourceEdit,
  compareX4UiSourceStructuralLedgerCorrespondence,
  discoverX4UiSourceEdits,
  encodeX4UiSourceEditReplacement,
  normalizeX4UiSourceEditLayoutModel,
  type X4UiSourceEditDeleteEntry,
  type X4UiSourceEditEmptyCellEntry,
  type X4UiSourceEditRowInsertionEntry,
  type X4UiSourceEditRowInsertionRequest,
  type X4UiSourceEditRowMoveEntry,
  type X4UiSourceEditRowMoveRequest,
  type X4UiSourceEditInsertionEntry,
  type X4UiSourceEditWidgetInsertionRequest,
  type X4UiSourceEditReplaceEntry,
  type X4UiSourceEditStructuralEntry,
  type X4UiEditableSourceEditEntry,
  type X4UiSourceEditCatalog,
  type X4UiSourceEditResult,
} from './x4UiSourceEdits';
import * as sourceEditMoveSurface from './x4UiSourceEdits';

interface Check {
  readonly name: string;
  readonly pass: boolean;
  readonly detail?: string;
}

interface SourceEditFixtureContext {
  readonly workspace: ModWorkspace;
  readonly source: X4UiWorkspaceSource;
  readonly program: X4UiLayoutProgram;
  readonly evidenceAuthority: X4UiLayoutEvidenceAuthority;
}

interface PublicCallOutcome<T> {
  readonly threw: boolean;
  readonly value?: T;
  readonly error?: string;
}

const checks: Check[] = [];

const check = (name: string, pass: boolean, detail?: string): void => {
  checks.push({ name, pass, detail });
  assert.equal(pass, true, `${name}${detail ? `: ${detail}` : ''}`);
};

const isSelftestCallModelValue = (value: unknown): boolean => {
  const record = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
  const location = record?.location;
  const locationRecord = location !== null && typeof location === 'object' && !Array.isArray(location)
    ? location as Record<string, unknown>
    : undefined;
  return (record?.status === 'static' || record?.status === 'dynamic' || record?.status === 'unknown')
    && typeof record.type === 'string'
    && typeof record.expression === 'string'
    && locationRecord !== undefined
    && typeof locationRecord.file === 'string';
};

const withoutSelftestCallModelNumericExpressions = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withoutSelftestCallModelNumericExpressions);
  if (value === null || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  const isCallModelValue = isSelftestCallModelValue(value);
  for (const [key, child] of Object.entries(record)) {
    if (isCallModelValue && key === 'numericExpression') continue;
    result[key] = withoutSelftestCallModelNumericExpressions(child);
  }
  return result;
};

function responseHeaders(contentType: string): { get(name: string): string | null } {
  return { get: name => name.toLowerCase() === 'content-type' ? contentType : null };
}

function jsonResponse(body: unknown, status = 200): X4UiCorpusFetchResponse {
  return {
    status,
    headers: responseHeaders('application/json; charset=utf-8'),
    json: async () => body,
  };
}

function bytesResponse(bytes: Uint8Array, status = 200, contentType = 'application/octet-stream'): X4UiCorpusFetchResponse {
  const copied = bytes.slice();
  return {
    status,
    headers: responseHeaders(contentType),
    arrayBuffer: async () => copied.buffer,
  };
}

function makeCanonicalAbc(advance: number): Uint8Array {
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
}

function makeCanonicalDds(): Uint8Array {
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

function hexDigest(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return bytes.buffer;
}

async function withCanonicalPlatformHash<T>(expectedHashes: readonly string[], run: () => Promise<T>): Promise<T> {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const originalValue = (globalThis as unknown as { crypto?: unknown }).crypto;
  let hashIndex = 0;
  const fakeCrypto = {
    subtle: {
      digest: async (..._args: readonly unknown[]): Promise<ArrayBuffer> => {
        const expected = expectedHashes[hashIndex++];
        if (expected === undefined) throw new Error('source edits canonical selftest hash count mismatch');
        return hexDigest(expected);
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
    check('canonical source-edits loader restores platform Web Crypto',
      (globalThis as unknown as { crypto?: unknown }).crypto === originalValue);
  }
}

function pathFromQuery(url: string, key: string): string {
  const query = url.slice(url.indexOf('?') + 1).split('&');
  const pair = query.find(part => part.startsWith(`${key}=`));
  if (!pair) throw new Error(`missing query ${key}`);
  return decodeURIComponent(pair.slice(key.length + 1));
}

function manifestStatus(root: string, generation: string): Record<string, unknown> {
  return {
    available: true,
    state: 'ready',
    root,
    current: { generation, root, generatedAt: '2026-08-12T00:00:00.000Z' },
  };
}

async function loadCanonicalSourceEditsSelftestCorpus(): Promise<X4UiCorpusCanonicalSuccess> {
  const root = 'source-edits-canonical-selftest-root';
  const generation = 'source-edits-canonical-selftest-generation';
  const generatedAt = '2026-08-12T00:00:00.000Z';
  const contract = X4_UI_CORPUS_9_00_CONTRACT;
  const buffers = new Map<string, Uint8Array>([
    [contract.helper.relativePath, new TextEncoder().encode('-- source edits canonical selftest helper\n')],
    [contract.widget.relativePath, new TextEncoder().encode('-- source edits canonical selftest widget\n')],
    [contract.regular.descriptor.relativePath, makeCanonicalAbc(8)],
    [contract.regular.atlas.relativePath, makeCanonicalDds()],
    [contract.bold.descriptor.relativePath, makeCanonicalAbc(8)],
    [contract.bold.atlas.relativePath, makeCanonicalDds()],
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
  const transport = async (url: string): Promise<X4UiCorpusFetchResponse> => {
    if (url === X4_UI_CORPUS_STATUS_URL) return jsonResponse(status);
    if (url.startsWith(`${X4_UI_CORPUS_MANIFEST_URL}?`)) {
      const path = pathFromQuery(url, 'q');
      const bytes = buffers.get(path);
      if (!bytes) throw new Error(`unknown canonical manifest path ${path}`);
      return jsonResponse({
        status: manifestStatus(root, generation),
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
      if (!bytes) throw new Error(`unknown canonical file path ${path}`);
      return bytesResponse(bytes, 200, path.endsWith('.lua') ? 'text/plain' : 'application/octet-stream');
    }
    throw new Error(`unexpected canonical source-edits selftest URL ${url}`);
  };
  const result = await withCanonicalPlatformHash(expectedHashes,
    () => loadCanonicalX4UiCorpusAssets({ transport }));
  if (result.ok === false) throw new Error(`canonical source-edits selftest loader failed: ${result.error.message}`);
  return result;
}

const uiXml = '<addon><environment type="menus"><file name="ui/edit.lua"/></environment></addon>';

const baseLua = [
  'local menu = { name = "Edit", layer = 1 }',
  'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
  'local table = frame:addTable(1, { width = 80, scaling = false })',
  'local row = table:addRow(false, { scaling = false })',
  'row[1]:createText(\'old\\n"quote"\', { width = 20, scaling = true })',
  'frame:display()',
  '',
].join('\n');

const b119EditBoxLua = [
  'local menu = { name = "B119SourceEdit", layer = 1 }',
  'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
  'local table = frame:addTable(1, { width = 80, scaling = false })',
  'table:setDefaultCellProperties("editbox", { height = 4, scaling = true })',
  'table:setDefaultComplexCellProperties("editbox", "hotkey", { hotkey = "DEFAULT", displayIcon = true })',
  'local row = table:addRow(false, {})',
  'local edit = row[1]:createEditBox({ height = 0, scaling = true })',
  'edit:setHotkey("DIRECT", { displayIcon = false })',
  'frame:display()',
  '',
].join('\n');

const exactPipelineLua = `-- Pipeline Test UI — X4 UI extension entry point
-- Packaged at: extensions/pipeline_test/ui/pipeline_test.lua
-- Registered by: extensions/pipeline_test/ui.xml (<environment type="menus">)
-- Generated from the visual designer by X4 Forge. Uses the corpus-backed
-- standalone-menu lifecycle: lazy Helper -> deferred registration -> OpenMenu
-- -> onShowMenu -> createFrameHandle/fTable -> frame:display().

local widgets = {
    { type = "window", id = "w_win", label = "Pipeline Test Panel", x = 120, y = 120, width = 280, height = 120 },
    { type = "header", id = "w_header", label = "B119 Pipeline Test", x = 140, y = 140, width = 380, height = 32 },
    { type = "button", id = "w_btn", label = "My First Button", x = 150, y = 170, width = 220, height = 40 },
    { type = "text", id = "w_status", label = "Status: source-first Forge preview", x = 140, y = 182, width = 380, height = 32 },
    { type = "button", id = "w_btn_secondary", label = "Second Button", x = 390, y = 230, width = 160, height = 40 },
    { type = "input", id = "w_input", label = "Operator note", x = 140, y = 286, width = 410, height = 44 },
}

local Helper = rawget(_G, "Helper")
local function refreshHelper()
  if not Helper then Helper = rawget(_G, "Helper") end
  return Helper
end

local menu = {
  name = "pipeline_test_menu",
  layer = 4,
  active = false,
  widgets = widgets,
  transcript = "",
}

local function log(message)
  if DebugError then DebugError("[pipeline_test] " .. tostring(message)) end
end

function menu.ensureRegistered()
  refreshHelper()
  _G.Menus = _G.Menus or {}
  local found = false
  for i, existing in ipairs(_G.Menus) do
    if existing.name == menu.name then _G.Menus[i] = menu; found = true; break end
  end
  if not found then table.insert(_G.Menus, menu) end
  if Helper and Helper.registerMenu and not menu._registered then
    local ok = pcall(Helper.registerMenu, menu)
    menu._registered = ok
  end
  return menu._registered == true
end

function menu.open(context)
  menu.context = type(context) == "table" and context or {}
  if not menu.ensureRegistered() then
    if SetScript then SetScript("onUpdate", menu.retryOpen) end
    return false
  end
  if OpenMenu then OpenMenu(menu.name, nil, nil, true)
  elseif menu.onShowMenu then menu.onShowMenu() end
  return true
end

function menu.retryOpen()
  if not menu.ensureRegistered() then return end
  if RemoveScript then RemoveScript("onUpdate", menu.retryOpen) end
  menu.open(menu.context)
end

function menu.onShowMenu()
  refreshHelper()
  menu.active = true
  menu.createFrame()
end

function menu.emit(widgetId, payload)
  if AddUITriggeredEvent then AddUITriggeredEvent(menu.name, widgetId, payload or {}) end
end

function menu.createFrame()
  refreshHelper()
  if not Helper then log("Helper unavailable; frame not built"); return end
  if menu.frame and Helper.clearDataForRefresh then Helper.clearDataForRefresh(menu, menu.layer) end
  local width = Helper.scaleX(530)
  local height = Helper.scaleY(436)
  local x = ((Helper.viewWidth or 1920) - width) / 2
  local y = ((Helper.viewHeight or 1080) - height) / 2
  menu.frame = Helper.createFrameHandle(menu, { x = x, y = y, width = width, height = height, layer = menu.layer, standardButtons = { close = true } })
  local ftable = menu.frame:addTable(2, { tabOrder = 1, width = width, highlightMode = "off", reserveScrollBar = false })
  ftable:setColWidthPercent(1, 55)
  ftable:setColWidthPercent(2, 45)
  local row
  row = ftable:addRow(false, {})
  row[1]:setColSpan(2):createText("Pipeline Test Panel", Helper.headerRowCenteredProperties)
  row = ftable:addRow(false, {})
  row[1]:setColSpan(2):createText("B119 Pipeline Test", Helper.headerRowCenteredProperties)
  row = ftable:addRow(true, {})
  row[1]:setColSpan(2):createButton({ active = true }):setText("My First Button", { halign = "center" })
  row[1].handlers.onClick = function() menu.emit("w_btn", { widget = "w_btn" }) end
  row = ftable:addRow(false, {})
  row[1]:setColSpan(2):createText("Status: source-first Forge preview", { wordwrap = true })
  row = ftable:addRow(true, {})
  row[1]:setColSpan(2):createButton({ active = true }):setText("Second Button", { halign = "center" })
  row[1].handlers.onClick = function() menu.emit("w_btn_secondary", { widget = "w_btn_secondary" }) end
  row = ftable:addRow(true, {})
  row[1]:setColSpan(2):createEditBox({ defaultText = "Type a note...", maxChars = 255, height = 44 })
  row[1].handlers.onEditBoxDeactivated = function(_, text) menu.emit("w_input", { text = text }) end
  menu.frame:display()
end

function menu.cleanup()
  menu.frame = nil
  menu.active = false
end

function menu.onCloseElement(dueToClose)
  refreshHelper()
  if Helper and Helper.closeMenu then Helper.closeMenu(menu, dueToClose) end
  menu.cleanup()
end

function menu.close()
  menu.onCloseElement("close")
end

-- Deliberate opening path for MD/companion Lua: <raise_lua_event name="'pipeline_test_menu.open'"/>.
if RegisterEvent then RegisterEvent("pipeline_test_menu.open", function(_, context) menu.open(context) end) end
_G["pipeline_test_menu"] = menu

-- The beginner template opts into one visible first result. Ordinary authored menus do not auto-open.
local function autoOpenWhenReady()
  refreshHelper()
  if not Helper then return end
  if RemoveScript then RemoveScript("onUpdate", autoOpenWhenReady) end
  menu.open({ source = "x4_forge_template" })
end
if SetScript then SetScript("onUpdate", autoOpenWhenReady) end


return menu
`;

const exactPipelineXml = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<addon name="pipeline_test">',
  '  <environment type="menus">',
  '    <file name="ui/pipeline_test.lua" />',
  '  </environment>',
  '</addon>',
  '',
].join('\n');

const automaticHeightReviewPath = 'ui/review.lua';

const automaticHeightReviewXml = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<addon name="review">',
  '  <environment type="menus">',
  `    <file name="${automaticHeightReviewPath}" />`,
  '  </environment>',
  '</addon>',
  '',
].join('\n');

const automaticHeightReviewLua = [
  'local menu = { name = "Review", layer = 1 }',
  'local frame = Helper.createFrameHandle(menu, { width = 400, height = 250 })',
  'local ftable = frame:addTable(2, { width = 380, scaling = false, reserveScrollBar = false })',
  'local row = ftable:addRow(false, {})',
  'row[1]:createText("Review text", { fontsize = 12 })',
  'row[2]:createButton({}):setText("Button caption")',
  'local row2 = ftable:addRow(false, {})',
  'row2[1]:createText("Second row", {})',
  'frame:display()',
  '',
].join('\n');

const selectedFunctionLua = [
  'local menu = { name = "SelectedFunction", layer = 1 }',
  'OpenMenu("unrelated")',
  'function menu.before()',
  '  local frame = Helper.createFrameHandle(menu, { width = 10, height = 10 })',
  '  frame:addTable(1, { width = 10 })',
  'end',
  'function menu.createFrame()',
  '  local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
  '  local table = frame:addTable(1, { width = 80, scaling = false })',
  '  local row = table:addRow(false, {})',
  '  row[1]:createText("target", {})',
  '  frame:display()',
  'end',
  'function menu.after()',
  '  local frame = Helper.createFrameHandle(menu, { width = 20, height = 20 })',
  '  frame:display()',
  'end',
  '',
].join('\n');

const selectedFunctionXml = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<addon name="selected_function">',
  '  <environment type="menus">',
  '    <file name="ui/selected_function.lua" />',
  '  </environment>',
  '</addon>',
  '',
].join('\n');

const aliasSourceLayoutLua = [
  'local Helper = rawget(_G, "Helper")',
  'local menu = { name = "AliasOutside", layer = 1 }',
  'local unrelatedText = "UNRELATED"',
  'OpenMenu(unrelatedText)',
  'function menu.display()',
  '  local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
  '  local table = frame:addTable(1, { width = 100 })',
  '  local row = table:addRow(false, {})',
  '  row[1]:createText("ALIAS", { height = 10 })',
  '  frame:display()',
  'end',
  '',
].join('\n');

const passthrough = (path: string, content?: string, extra: Partial<PassthroughFile> = {}): PassthroughFile => ({
  path,
  ...(content === undefined ? {} : { content }),
  ...extra,
});

const workspace = (lua: string, extra: Partial<ModWorkspace> = {}): ModWorkspace => ({
  id: 'source-edits-selftest',
  name: 'Source edits selftest',
  version: '1.0.0',
  author: 'Forge',
  description: 'B119 Batch 7B source edit fixture',
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
    passthrough('README.md', '# unchanged\n', { reason: 'unknown_domain' }),
    passthrough('ui.xml', uiXml, { reason: 'partial', bytes: uiXml.length }),
    passthrough('ui/edit.lua', lua, { reason: 'partial', bytes: lua.length }),
  ],
  ...extra,
} as ModWorkspace);

const pin = (value: number, lineStart: number, lineEnd = lineStart) => ({
  value,
  source: {
    sourcePath: X4_LAYOUT_PROVENANCE.helperSourcePath,
    lineStart,
    lineEnd,
  },
});

const profileFor = (model: ReturnType<typeof buildX4UiCallModel>): X4UiLayoutProjectionProfile => {
  const targetCatalog = createX4UiLayoutTargetCatalog(model);
  return {
    id: 'source-edits-profile',
    provenance: 'B119 source-edits selftest profile',
    truthGrade: 'captured',
    source: targetCatalog.sourceIdentity,
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
        standardTextHeight: pin(16, 533),
        standardButtonHeight: pin(25, 522),
        viewWidth: pin(100, 707),
        viewHeight: pin(80, 708),
        borderSize: pin(1, 709),
      },
    },
    widget: {
      sourcePath: X4_LAYOUT_PROVENANCE.widgetSourcePath,
      sha256: WIDGET_SOURCE_SHA256,
    },
    defaults: {
      standardButtonHeight: pin(25, 522),
      minTextHeight: 7,
    },
  };
};

const contextFor = (lua = baseLua, extra: Partial<ModWorkspace> = {}): SourceEditFixtureContext => {
  const currentWorkspace = workspace(lua, extra);
  const currentSource = buildX4UiWorkspaceSource(currentWorkspace);
  if (!currentSource.bundle) throw new Error('source fixture did not build a bundle');
  const sourceFile = currentSource.bundle.sourceFiles.find(file => file.path === 'ui/edit.lua');
  if (!sourceFile) throw new Error('source fixture Lua file missing');
  const layoutModel = normalizeX4UiSourceEditLayoutModel(sourceFile.callModel);
  const target = createX4UiLayoutTargetCatalog(layoutModel).targets.find(candidate => candidate.kind === 'top-level');
  if (!target) throw new Error('source fixture top-level target missing');
  const result = projectX4UiLayoutProgram(layoutModel, target, profileFor(layoutModel));
  if (result.status === 'refused' || !result.program) throw new Error(`source fixture layout refused: ${JSON.stringify(result)}`);
  return {
    workspace: currentWorkspace,
    source: currentSource,
    program: result.program,
    evidenceAuthority: result.evidenceAuthority,
  };
};

const exactPipelineContextFor = (corpus?: X4UiCorpusCanonicalSuccess): SourceEditFixtureContext => {
  const currentWorkspace = workspace(exactPipelineLua, {
    id: 'pipeline-test-source-edits-selftest',
    name: 'Pipeline test source edits selftest',
    passthroughFiles: [
      passthrough('README.md', '# unchanged\n', { reason: 'unknown_domain' }),
      passthrough('ui.xml', exactPipelineXml, { reason: 'partial', bytes: exactPipelineXml.length }),
      passthrough('ui/pipeline_test.lua', exactPipelineLua, { reason: 'unparsed', bytes: exactPipelineLua.length }),
    ],
  });
  const currentSource = buildX4UiWorkspaceSource(currentWorkspace);
  if (!currentSource.bundle) throw new Error('exact pipeline source fixture did not build a bundle');
  const sourceFile = currentSource.bundle.sourceFiles.find(file => file.path === 'ui/pipeline_test.lua');
  if (!sourceFile) throw new Error('exact pipeline source fixture Lua file missing');
  const layoutModel = normalizeX4UiSourceEditLayoutModel(sourceFile.callModel);
  const target = createX4UiLayoutTargetCatalog(layoutModel).targets.find(candidate =>
    candidate.kind === 'function' && candidate.name === 'menu.createFrame');
  if (!target) throw new Error('exact pipeline function target missing');
  if (corpus !== undefined) {
    const selection: X4UiPreviewSelection = {
      sourceIndex: sourceFile.index,
      path: sourceFile.path,
      sourceIdentity: createX4UiLayoutTargetCatalog(sourceFile.callModel).sourceIdentity,
      target,
    };
    const previewResult = projectX4UiPreviewPipeline({
      source: currentSource,
      corpus,
      selection,
      profile: {
        id: 'source-edits-exact-pipeline-profile',
        provenance: 'B119 exact pipeline source-edits canonical selftest profile',
        truthGrade: 'supplied',
        source: target.sourceIdentity,
        drawable: { width: 1920, height: 1080 },
        uiScale: 1,
      },
    } satisfies X4UiPreviewPipelineInput);
    const previewProgram = (previewResult as unknown as { program?: unknown }).program as {
      readonly status?: unknown;
      readonly program?: X4UiLayoutProgram;
      readonly evidenceAuthority?: X4UiLayoutEvidenceAuthority;
    } | undefined;
    if (previewProgram?.status === 'refused' || previewProgram?.program === undefined || previewProgram.evidenceAuthority === undefined) {
      throw new Error(`exact pipeline canonical preview refused: ${JSON.stringify(previewResult)}`);
    }
    return {
      workspace: currentWorkspace,
      source: currentSource,
      program: previewProgram.program,
      evidenceAuthority: previewProgram.evidenceAuthority,
    };
  }
  const result = projectX4UiLayoutProgram(layoutModel, target, profileFor(layoutModel));
  if (result.status === 'refused' || !result.program) {
    throw new Error(`exact pipeline source fixture layout refused: ${JSON.stringify(result)}`);
  }
  return {
    workspace: currentWorkspace,
    source: currentSource,
    program: result.program,
    evidenceAuthority: result.evidenceAuthority,
  };
};

const sessionContextFor = (
  currentWorkspace: ModWorkspace,
  corpus: X4UiCorpusCanonicalSuccess | undefined,
  sourcePath: string,
  targetMatches: (target: X4UiLayoutTarget) => boolean,
  label: string,
): SourceEditFixtureContext => {
  const owner = createX4UiEditorSessionOwner(currentWorkspace);
  const candidate = owner.candidateCatalog.sourceCandidates.find(sourceCandidate =>
    sourceCandidate.path === sourcePath
      && sourceCandidate.sourceIdentity !== undefined
      && sourceCandidate.targets.some(targetMatches),
  );
  const target = candidate?.targets.find(targetMatches);
  if (!candidate || !candidate.sourceIdentity || !target) {
    throw new Error(`${label} Session target missing: ${JSON.stringify(owner.candidateCatalog)}`);
  }
  const projection = owner.project({
    workspace: currentWorkspace,
    corpus,
    selection: {
      sourceIndex: candidate.index,
      path: candidate.path,
      sourceIdentity: candidate.sourceIdentity,
      target,
    },
    profile: { width: 1920, height: 1080, uiScale: 1 },
  });
  const programResult = projection.preview.program;
  if (!programResult || programResult.status === 'refused') {
    throw new Error(`${label} Session projection missing program authority: ${JSON.stringify({
      status: projection.status,
      previewStatus: projection.preview.status,
      gaps: projection.preview.gaps,
    })}`);
  }
  return {
    workspace: currentWorkspace,
    source: projection.source,
    program: programResult.program,
    evidenceAuthority: programResult.evidenceAuthority,
  };
};

const automaticHeightSessionContextFor = (
  currentWorkspace: ModWorkspace,
  corpus: X4UiCorpusCanonicalSuccess | undefined,
): SourceEditFixtureContext => sessionContextFor(
  currentWorkspace,
  corpus,
  automaticHeightReviewPath,
  target => target.kind === 'top-level',
  'automatic-height review',
);

const createdMenuSessionContextFor = (
  corpus: X4UiCorpusCanonicalSuccess | undefined,
): SourceEditFixtureContext => {
  const blankWorkspace = workspace('', {
    id: 'b119-contextual-insertion-source-edits-selftest',
    name: 'B119 contextual insertion source-edits selftest',
    passthroughFiles: [],
  });
  const blankSource = buildX4UiWorkspaceSource(blankWorkspace);
  const creation = createX4UiWorkspaceMenu(blankWorkspace, blankSource, 'B119 Contextual Insertion');
  if (!creation.accepted) {
    throw new Error(`contextual insertion producer refused: ${JSON.stringify(creation)}`);
  }
  return sessionContextFor(
    creation.workspace,
    corpus,
    creation.menu.path,
    target => target.kind === 'function' && target.name === creation.menu.targetName,
    'contextual insertion producer',
  );
};

const contextualImportPath = 'ui/contextual_import.lua';
const contextualImportLua = [
  'local menu = { name = "ContextualImport", layer = 1 }',
  'function menu.createFrame()',
  'local frame = Helper.createFrameHandle(menu, { width = 530, height = 180 })',
  'local ftable = frame:addTable(3, { width = 530, reserveScrollBar = false })',
  'local row = ftable:addRow(false, {})',
  'row[1]:setColSpan(2); -- retained span',
  'frame:display(); -- retained display',
  'end',
  '-- trailing bytes',
  '',
].join('\n');

const b119PartialScalarMixedLua = contextualImportLua.replace(
  'row[1]:setColSpan(2); -- retained span\nframe:display(); -- retained display',
  [
    'row[1]:createText("AI INFLUENCE", {})',
    'row[2]:createButton({ active = true }):setText("CLOSE", {})',
    'if runtimeCondition then frame:display() end',
  ].join('\n'),
);

const b119PartialScalarScenarioPath = 'ui/partial_scalar_scenario.lua';
const b119PartialScalarScenarioLua = [
  'local menu = { name = "PartialScalarScenario", layer = 1 }',
  'function menu.display(dynamicText, h)',
  '  local frame = Helper.createFrameHandle(menu, { width = 90, height = 60 })',
  '  local table = frame:addTable(3, { width = 90, reserveScrollBar = false })',
  '  local row = table:addRow(false, {})',
  '  row[1]:createText("SCENARIO", {})',
  '  if choice then row[2]:createText(dynamicText, { height = h }) end',
  '  for i = 1, runtimeCount do row[3]:createText(dynamicText, { height = h }) end',
  '  local other = {}',
  '  other:createButton({ height = h })',
  '  local function localWidth() return 40 end',
  '  frame:addTable(1, { width = localWidth() })',
  '  frame:addTable(1, { width = C.GetWidth() })',
  'end',
  '',
].join('\n');

const b119PartialScalarLoopScenarioPath = 'ui/partial_scalar_loop_scenario.lua';
const b119PartialScalarLoopScenarioLua = [
  'local menu = { name = "PartialScalarLoopScenario", layer = 1 }',
  'function menu.createFrame()',
  '  local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
  '  local ftable = frame:addTable(1, { width = getWidth(), scaling = false })',
  '  local row = ftable:addRow(false, {})',
  '  row[1]:createText("SCENARIO", {})',
  '  if runtimeCondition then row[1]:createText("BRANCH", {}) end',
  '  for i = 1, runtimeCount do row[1]:createText("LOOP", {}) end',
  '  frame:display()',
  'end',
  '',
].join('\n');

const contextualImportContextFor = (
  corpus: X4UiCorpusCanonicalSuccess | undefined,
  lua = contextualImportLua,
): SourceEditFixtureContext => sessionContextFor(workspace(lua, {
  passthroughFiles: [
    passthrough('README.md', '# untouched\r\n', { reason: 'unknown_domain' }),
    passthrough('ui.xml', uiXml.replaceAll('ui/edit.lua', contextualImportPath)),
    passthrough(contextualImportPath, lua, { reason: 'unparsed', bytes: new TextEncoder().encode(lua).length }),
    passthrough('ui/sibling.lua', '-- sibling\r\nreturn {}\r\n'),
  ],
}), corpus, contextualImportPath, target => target.kind === 'function' && target.name === 'menu.createFrame', 'contextual import');

const selectedFunctionContextFor = (): SourceEditFixtureContext => {
  const currentWorkspace = workspace(selectedFunctionLua, {
    id: 'selected-function-source-edits-selftest',
    name: 'Selected function source edits selftest',
    passthroughFiles: [
      passthrough('README.md', '# unchanged\n', { reason: 'unknown_domain' }),
      passthrough('ui.xml', selectedFunctionXml, { reason: 'partial', bytes: selectedFunctionXml.length }),
      passthrough('ui/selected_function.lua', selectedFunctionLua, { reason: 'unparsed', bytes: selectedFunctionLua.length }),
    ],
  });
  const currentSource = buildX4UiWorkspaceSource(currentWorkspace);
  if (!currentSource.bundle) throw new Error('selected function source fixture did not build a bundle');
  const sourceFile = currentSource.bundle.sourceFiles.find(file => file.path === 'ui/selected_function.lua');
  if (!sourceFile) throw new Error('selected function source fixture Lua file missing');
  const layoutModel = normalizeX4UiSourceEditLayoutModel(sourceFile.callModel);
  const target = createX4UiLayoutTargetCatalog(layoutModel).targets.find(candidate =>
    candidate.kind === 'function' && candidate.name === 'menu.createFrame');
  if (!target) throw new Error('selected function target missing');
  const result = projectX4UiLayoutProgram(layoutModel, target, profileFor(layoutModel));
  if (result.status === 'refused' || !result.program) {
    throw new Error(`selected function source fixture layout refused: ${JSON.stringify(result)}`);
  }
  return {
    workspace: currentWorkspace,
    source: currentSource,
    program: result.program,
    evidenceAuthority: result.evidenceAuthority,
  };
};

const catalogFor = (context: SourceEditFixtureContext): X4UiSourceEditCatalog => discoverX4UiSourceEdits(
  context.workspace,
  context.source,
  context.program,
  context.evidenceAuthority,
);

const editableField = (
  catalog: X4UiSourceEditCatalog,
  type: X4UiEditableSourceEditEntry['valueType'],
  field: string,
  expectedText?: string,
  callName?: string,
): X4UiEditableSourceEditEntry => {
  const found = catalog.editableEntries.find(entry => entry.valueType === type
    && entry.provenance.fields.includes(field)
    && (expectedText === undefined || entry.expectedText === expectedText)
    && (callName === undefined || entry.provenance.callName === callName));
  if (!found) throw new Error(`editable ${type}/${field}/${expectedText || ''}/${callName || ''} missing: ${JSON.stringify(catalog)}`);
  return found;
};

const apply = (
  context: SourceEditFixtureContext,
  catalog: X4UiSourceEditCatalog,
  entry: X4UiEditableSourceEditEntry,
  value: string | number | boolean,
  expected?: { readonly path?: string; readonly startOffset?: number; readonly endOffset?: number; readonly expectedText?: string },
): X4UiSourceEditResult => applyX4UiSourceEdit(
  context.workspace,
  context.source,
  catalog,
  entry.id,
  value,
  expected?.path,
  expected?.startOffset,
  expected?.endOffset,
  expected?.expectedText,
);

const accepted = (result: X4UiSourceEditResult): Extract<X4UiSourceEditResult, { accepted: true }> => {
  if (!result.accepted) {
    throw new Error(`expected accepted edit, got ${JSON.stringify(result)}`);
  }
  return result as Extract<X4UiSourceEditResult, { accepted: true }>;
};

const refused = (result: X4UiSourceEditResult): Extract<X4UiSourceEditResult, { accepted: false }> => {
  if (result.accepted === false) return result;
  throw new Error(`expected refused edit, got ${JSON.stringify(result)}`);
};

const contextualWidgetEntryFor = (catalog: X4UiSourceEditCatalog, column?: number): X4UiSourceEditEmptyCellEntry => {
  const entries = (catalog.insertEntries || []).filter((entry): entry is X4UiSourceEditEmptyCellEntry => entry.kind === 'insert-widget'
    && (column === undefined || entry.column === column));
  if (entries.length !== 1) throw new Error(`contextual widget entry count ${entries.length}, column ${column}`);
  return entries[0];
};

const acceptedWidget = (
  result: ReturnType<typeof applyX4UiSourceWidgetInsertion>,
): Extract<ReturnType<typeof applyX4UiSourceWidgetInsertion>, { accepted: true }> => {
  if (result.accepted === false) throw new Error(`expected accepted widget insertion, got ${JSON.stringify({
    accepted: result.accepted, changed: result.changed, reason: result.reason, detail: result.detail,
  })}`);
  return result;
};

const rowEntryFor = (catalog: X4UiSourceEditCatalog, rowIndex: number, tableId?: string) => {
  const entries = catalog.insertEntries?.filter((entry): entry is X4UiSourceEditRowInsertionEntry => entry.kind === 'insert-row'
    && entry.rowIndex === rowIndex && (tableId === undefined || entry.tableId === tableId)) || [];
  if (entries.length !== 1) throw new Error(`row-below entry count ${entries.length} for row ${rowIndex}`);
  return entries[0];
};

const rowMoveEntryFor = (
  catalog: X4UiSourceEditCatalog,
  direction: 'up' | 'down',
  rowIndex: number,
  tableId?: string,
): X4UiSourceEditRowMoveEntry => {
  const entries = (catalog.moveEntries || []).filter(entry => entry.kind === 'move-row'
    && entry.direction === direction && entry.rowIndex === rowIndex
    && (tableId === undefined || entry.tableId === tableId));
  if (entries.length !== 1) throw new Error(`row move entry count ${entries.length} for ${direction}/${rowIndex}`);
  return entries[0];
};

const acceptedRow = (result: ReturnType<typeof applyX4UiSourceRowInsertion>) => {
  if (result.accepted === false) throw new Error(`expected accepted row insertion: ${JSON.stringify({
    accepted: result.accepted, changed: result.changed, reason: result.reason, detail: result.detail,
  })}`);
  return result;
};

const acceptedMove = (result: ReturnType<typeof applyX4UiSourceRowMove>) => {
  if (result.accepted === false) throw new Error(`expected row move: ${JSON.stringify({
    accepted: result.accepted, changed: result.changed, reason: result.reason, detail: result.detail,
  })}`);
  return result;
};

const sourceText = (context: { readonly source: X4UiWorkspaceSource }): string => {
  const text = context.source.bundle?.sourceFiles.find(file => file.path === 'ui/edit.lua')?.text;
  if (text === undefined) throw new Error('source fixture text missing');
  return text;
};

const sourceTextAt = (context: { readonly source: X4UiWorkspaceSource }, path: string): string => {
  const text = context.source.bundle?.sourceFiles.find(file => file.path === path)?.text;
  if (text === undefined) throw new Error(`source fixture text missing for ${path}`);
  return text;
};

const ledgerCounts = (source: X4UiWorkspaceSource): { readonly calls: number; readonly operations: number } | undefined => {
  const file = source.bundle?.sourceFiles.find(candidate => candidate.path === 'ui/edit.lua');
  if (!file) return undefined;
  const model = normalizeX4UiSourceEditLayoutModel(file.callModel);
  const target = createX4UiLayoutTargetCatalog(model).targets.find(candidate => candidate.kind === 'top-level');
  if (!target) return undefined;
  const result = projectX4UiLayoutProgram(model, target, profileFor(model));
  return result.status === 'refused' || !result.program
    ? undefined
    : { calls: model.calls.length, operations: result.program.operations.length };
};

const projectedProgramFor = (
  source: X4UiWorkspaceSource,
): { readonly model: X4UiCallModel; readonly program: X4UiLayoutProgram; readonly evidenceAuthority: X4UiLayoutEvidenceAuthority } | undefined => {
  const file = source.bundle?.sourceFiles.find(candidate => candidate.path === 'ui/edit.lua');
  if (!file) return undefined;
  const model = normalizeX4UiSourceEditLayoutModel(file.callModel);
  const target = createX4UiLayoutTargetCatalog(model).targets.find(candidate => candidate.kind === 'top-level');
  if (!target) return undefined;
  const result = projectX4UiLayoutProgram(model, target, profileFor(model));
  return result.status === 'refused' || !result.program
    ? undefined
    : { model, program: result.program, evidenceAuthority: result.evidenceAuthority };
};

const objectGraph = (value: unknown): readonly object[] => {
  const seen = new Set<object>();
  const visit = (candidate: unknown): void => {
    if (candidate === null || typeof candidate !== 'object' || seen.has(candidate)) return;
    seen.add(candidate);
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(candidate))) {
      if ('value' in descriptor) visit(descriptor.value);
    }
  };
  visit(value);
  return [...seen];
};

const deepFrozen = (value: unknown): boolean => {
  const seen = new Set<object>();
  const visit = (candidate: unknown): boolean => {
    if (candidate === null || typeof candidate !== 'object') return true;
    if (seen.has(candidate)) return true;
    seen.add(candidate);
    if (!Object.isFrozen(candidate)) return false;
    return Object.values(Object.getOwnPropertyDescriptors(candidate)).every(descriptor =>
      !('value' in descriptor) || visit(descriptor.value));
  };
  return visit(value);
};

const graphShares = (value: unknown, forbidden: ReadonlySet<object>): boolean => {
  const seen = new Set<object>();
  const visit = (candidate: unknown): boolean => {
    if (candidate === null || typeof candidate !== 'object') return false;
    if (forbidden.has(candidate)) return true;
    if (seen.has(candidate)) return false;
    seen.add(candidate);
    return Object.values(Object.getOwnPropertyDescriptors(candidate)).some(descriptor =>
      'value' in descriptor && visit(descriptor.value));
  };
  return visit(value);
};

const allUnfrozen = (values: readonly object[]): boolean => values.every(value => !Object.isFrozen(value));

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;

const locationLedgerValue = (value: unknown, splice: {
  readonly startOffset: number;
  readonly endOffset: number;
  readonly replacementLength: number;
  readonly beforeText: string;
  readonly afterText: string;
}, side: 'before' | 'after'): unknown => {
  const record = asRecord(value);
  const start = asRecord(record?.start);
  const end = asRecord(record?.end);
  if (!record || !start || !end
    || typeof record.file !== 'string'
    || typeof start.offset !== 'number'
    || typeof end.offset !== 'number') return value;
  const map = (offset: number): number | undefined => {
    if (side === 'after') return offset;
    if (offset < splice.startOffset) return offset;
    if (offset >= splice.endOffset) return offset + splice.replacementLength - (splice.endOffset - splice.startOffset);
    return undefined;
  };
  const mappedStart = map(start.offset);
  const mappedEnd = map(end.offset);
  if (mappedStart === undefined || mappedEnd === undefined) return { invalidSpliceLocation: true };
  const lineColumnAt = (text: string, offset: number): { readonly line: number; readonly column: number } => {
    let line = 1;
    let lineStart = 0;
    for (let index = 0; index < offset; index += 1) {
      if (text[index] === '\n') {
        line += 1;
        lineStart = index + 1;
      }
    }
    return { line, column: offset - lineStart };
  };
  const startPosition = lineColumnAt(splice.afterText, mappedStart);
  const endPosition = lineColumnAt(splice.afterText, mappedEnd);
  return {
    ...record,
    start: { ...start, ...startPosition, offset: mappedStart },
    end: { ...end, ...endPosition, offset: mappedEnd },
  };
};

const causalSourceKeys = new Set([
  'rowId',
  'cellId',
  'parentPath',
  'relatedPath',
  'localInvocation',
  'localInvocations',
  'localInvocationId',
  'localInvocationIds',
  'callLocation',
  'callLocations',
  'callLocationId',
  'callLocationIds',
]);

const causalIdentityText = (
  value: string,
  splice: { readonly startOffset: number; readonly endOffset: number; readonly replacementLength: number; readonly afterText: string },
  side: 'before' | 'after',
): string => {
  if (side === 'after') {
    return /^@[^:]+:\d+$/.test(value) && !/^@(?:row|cell):\d+$/.test(value)
      ? value.replace(/\d+$/, '<offset>')
      : value;
  }
  const map = (raw: string): number | undefined => {
    const offset = Number(raw);
    if (offset < splice.startOffset) return offset;
    if (offset >= splice.endOffset) return offset + splice.replacementLength - (splice.endOffset - splice.startOffset);
    return undefined;
  };
  let result = value.replace(/@(?:row|cell):(\d+)/g, (full, raw: string) => {
    const mapped = map(raw);
    return mapped === undefined ? '@invalid-splice-offset' : full.replace(raw, String(mapped));
  });
  result = result.replace(/(local-invocation:[^|]+\|\|)(\d+)\|(\d+)/g, (
    full,
    prefix: string,
    rawStart: string,
    rawEnd: string,
  ) => {
    const mappedStart = map(rawStart);
    const mappedEnd = map(rawEnd);
    return mappedStart === undefined || mappedEnd === undefined
      ? `${prefix}<invalid-splice-offset>|<invalid-splice-offset>`
      : `${prefix}${mappedStart}|${mappedEnd}`;
  });
  const lineColumnAt = (offset: number): { readonly line: number; readonly column: number } => {
    let line = 1;
    let lineStart = 0;
    for (let index = 0; index < offset; index += 1) {
      if (splice.afterText[index] === '\n') {
        line += 1;
        lineStart = index + 1;
      }
    }
    return { line, column: offset - lineStart };
  };
  if (result.includes('|call|')) {
    result = result.replace(/(\|\|)(\d+):(\d+):(\d+)\|(\d+):(\d+):(\d+)/g, (
      full,
      prefix: string,
      _beforeLineStart: string,
      _beforeColumnStart: string,
      rawStart: string,
      _beforeLineEnd: string,
      _beforeColumnEnd: string,
      rawEnd: string,
    ) => {
      const mappedStart = map(rawStart);
      const mappedEnd = map(rawEnd);
      return mappedStart === undefined || mappedEnd === undefined
        ? `${prefix}<invalid-splice-location>|<invalid-splice-location>`
        : (() => {
          const start = lineColumnAt(mappedStart);
          const end = lineColumnAt(mappedEnd);
          return `${prefix}${start.line}:${start.column}:${mappedStart}|${end.line}:${end.column}:${mappedEnd}`;
        })();
    });
  }
  if (/^@[^:]+:\d+$/.test(result) && !/^@(?:row|cell):\d+$/.test(result)) {
    result = result.replace(/\d+$/, '<offset>');
  }
  return result;
};

const causalNormalize = (
  value: unknown,
  key: string,
  splice: { readonly startOffset: number; readonly endOffset: number; readonly replacementLength: number; readonly beforeText: string; readonly afterText: string; readonly side?: 'before' | 'after' },
  side: 'before' | 'after',
  sourceDerived = false,
): unknown => {
  if (typeof value === 'string') return sourceDerived || causalSourceKeys.has(key)
    ? causalIdentityText(value, splice, side)
    : value;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(child => causalNormalize(child, key, splice, side, sourceDerived));
  const record = asRecord(value);
  if (!record) return value;
  if (key === 'source' || key === 'sourceLiteral' || key === 'location' || key === 'callSource') {
    return locationLedgerValue(value, splice, side);
  }
  return Object.fromEntries(Object.entries(record).map(([childKey, child]) => {
    const parserOwnedReference = (childKey === 'reference' || childKey === 'result')
      && (() => {
        const parserRecord = asRecord(child);
        const source = asRecord(parserRecord?.source);
        const start = asRecord(source?.start);
        const end = asRecord(source?.end);
        return typeof parserRecord?.kind === 'string'
          && typeof parserRecord.origin === 'string'
          && typeof source?.file === 'string'
          && typeof start?.offset === 'number'
          && typeof end?.offset === 'number';
      })();
    return [childKey, causalNormalize(
      child,
      childKey,
      splice,
      side,
      sourceDerived || causalSourceKeys.has(childKey) || parserOwnedReference,
    )];
  }));
};

const causalCallLedger = (
  source: X4UiWorkspaceSource,
  splice: { readonly startOffset: number; readonly endOffset: number; readonly replacementLength: number; readonly beforeText: string; readonly afterText: string },
  side: 'before' | 'after',
): readonly unknown[] => {
  const file = source.bundle?.sourceFiles.find(candidate => candidate.path === 'ui/edit.lua');
  if (!file) return [];
  return file.callModel.calls.map(call => {
    const record = call as unknown as Record<string, unknown>;
    return causalNormalize({
      name: call.name,
      callee: call.callee,
      method: call.method,
      receiver: call.receiver,
      arguments: call.arguments,
      context: call.context,
      source: call.source,
      localInvocation: record.localInvocation,
      localInvocations: record.localInvocations,
      localInvocationIds: record.localInvocationIds,
      callLocations: record.callLocations,
      callLocationIds: record.callLocationIds,
    }, '', splice, side);
  });
};

const causalOperationLedger = (
  program: X4UiLayoutProgram,
  splice: { readonly startOffset: number; readonly endOffset: number; readonly replacementLength: number; readonly beforeText: string; readonly afterText: string },
  side: 'before' | 'after',
): readonly unknown[] => program.operations.map(operation => {
  const record = operation as unknown as Record<string, unknown>;
  const kernel = asRecord(record.kernel);
  const kernelEnvelope = kernel
    ? Object.fromEntries(Object.entries(kernel).filter(([key]) => key !== 'stateBefore' && key !== 'stateAfter'))
    : undefined;
  return causalNormalize({
    kind: operation.kind,
    status: operation.status,
    localExpansion: operation.localExpansion,
    source: operation.source,
    tableId: record.tableId,
    frameId: record.frameId,
    rowId: record.rowId,
    cellId: record.cellId,
    parentPath: record.parentPath,
    relatedPath: record.relatedPath,
    localInvocations: record.localInvocations,
    localInvocationIds: record.localInvocationIds,
    callLocations: record.callLocations,
    callLocationIds: record.callLocationIds,
    kernel: kernelEnvelope,
  }, '', splice, side);
});

const exactEntrySequence = (catalog: X4UiSourceEditCatalog): boolean => {
  const structural = catalog.structuralEntries || [];
  const categorized = [...(catalog.deleteEntries || []), ...(catalog.replaceEntries || []), ...(catalog.insertEntries || [])];
  return structural.length === categorized.length && structural.every((entry, index) => entry === categorized[index]);
};

const workspaceBytes = (value: ModWorkspace): string => JSON.stringify(
  (value.passthroughFiles || []).map(file => ({
    path: file.path,
    content: file.content,
    bytes: file.bytes,
  })),
);

const samePassthroughValue = (
  left: PassthroughFile | undefined,
  right: PassthroughFile | undefined,
): boolean => JSON.stringify(left) === JSON.stringify(right);

const applyById = (
  context: Pick<SourceEditFixtureContext, 'workspace' | 'source'>,
  catalog: X4UiSourceEditCatalog,
  entryId: string,
  value: string | number | boolean,
): X4UiSourceEditResult => applyX4UiSourceEdit(
  context.workspace,
  context.source,
  catalog,
  entryId,
  value,
);

const structuralApply = (
  context: Pick<SourceEditFixtureContext, 'workspace' | 'source'>,
  catalog: X4UiSourceEditCatalog,
  entry: X4UiSourceEditDeleteEntry | X4UiSourceEditReplaceEntry | X4UiSourceEditInsertionEntry,
  directCall?: string,
  expected?: { readonly path?: string; readonly startOffset?: number; readonly endOffset?: number; readonly expectedText?: string },
): ReturnType<typeof applyX4UiSourceStructuralEdit> => applyX4UiSourceStructuralEdit(
  context.workspace,
  context.source,
  catalog,
  entry.id,
  directCall,
  expected?.path,
  expected?.startOffset,
  expected?.endOffset,
  expected?.expectedText,
);

const structuralDelete = (
  catalog: X4UiSourceEditCatalog,
  predicate: (entry: X4UiSourceEditDeleteEntry) => boolean,
): X4UiSourceEditDeleteEntry => {
  const entry = (catalog.deleteEntries || []).find(predicate);
  if (!entry) throw new Error(`structural delete entry missing: ${JSON.stringify(catalog.deleteEntries)}`);
  return entry;
};

const structuralInsert = (
  catalog: X4UiSourceEditCatalog,
  anchor: X4UiSourceEditInsertionEntry['anchor'],
): X4UiSourceEditInsertionEntry => {
  const entry = (catalog.insertEntries || []).find(candidate => candidate.anchor === anchor);
  if (!entry) throw new Error(`structural insert entry missing for ${anchor}: ${JSON.stringify(catalog.insertEntries)}`);
  return entry;
};

const structuralReplace = (
  catalog: X4UiSourceEditCatalog,
  predicate: (entry: X4UiSourceEditReplaceEntry) => boolean,
): X4UiSourceEditReplaceEntry => {
  const entry = (catalog.replaceEntries || []).find(predicate);
  if (!entry) throw new Error(`structural replacement entry missing: ${JSON.stringify(catalog.replaceEntries)}`);
  return entry;
};

const catalogWithEntry = (
  catalog: X4UiSourceEditCatalog,
  entryId: string,
  replacement: X4UiEditableSourceEditEntry,
  changes: Partial<X4UiSourceEditCatalog> = {},
): X4UiSourceEditCatalog => {
  const entries = catalog.entries.map(entry => entry.id === entryId ? replacement : entry);
  return {
    ...catalog,
    ...changes,
    entries,
    editableEntries: entries.filter((entry): entry is X4UiEditableSourceEditEntry => entry.kind === 'editable'),
    lockedEntries: entries.filter(entry => entry.kind === 'locked'),
  } as X4UiSourceEditCatalog;
};

const refusalPreservesInput = (
  result: X4UiSourceEditResult,
  context: Pick<SourceEditFixtureContext, 'workspace' | 'source'>,
  catalog: X4UiSourceEditCatalog,
  beforeBytes: string,
  beforeSource: string,
): boolean => !result.accepted
  && result.changed === false
  && result.workspace === context.workspace
  && result.source === context.source
  && result.catalog === catalog
  && workspaceBytes(context.workspace) === beforeBytes
  && sourceText(context) === beforeSource;

const structuralRefusalPreservesInput = (
  result: ReturnType<typeof applyX4UiSourceStructuralEdit>,
  context: Pick<SourceEditFixtureContext, 'workspace' | 'source'>,
  catalog: X4UiSourceEditCatalog,
  beforeBytes: string,
  beforeSource: string,
): boolean => !result.accepted
  && result.changed === false
  && result.workspace === context.workspace
  && result.source === context.source
  && result.catalog === catalog
  && workspaceBytes(context.workspace) === beforeBytes
  && sourceText(context) === beforeSource;

const structuralResultReason = (result: ReturnType<typeof applyX4UiSourceStructuralEdit>): string => {
  if (result.accepted === true) return 'accepted';
  return result.reason;
};

const structuralResultDetail = (result: ReturnType<typeof applyX4UiSourceStructuralEdit>): string | undefined =>
  result.accepted === false ? result.detail : undefined;

const contextWithSourceFileCallModel = (
  context: SourceEditFixtureContext,
  path: string,
  callModel: X4UiCallModel,
): SourceEditFixtureContext => {
  if (!context.source.bundle) throw new Error('source fixture bundle missing');
  const sourceFiles = context.source.bundle.sourceFiles.map(file => file.path === path
    ? { ...file, callModel }
    : file);
  return {
    ...context,
    source: {
      ...context.source,
      bundle: {
        ...context.source.bundle,
        sourceFiles,
      },
    },
  };
};

const contextWithCallModel = (
  context: SourceEditFixtureContext,
  callModel: X4UiCallModel,
): SourceEditFixtureContext => contextWithSourceFileCallModel(context, 'ui/edit.lua', callModel);

const invokePublic = <T>(call: () => T): PublicCallOutcome<T> => {
  try {
    return { threw: false, value: call() };
  } catch (error) {
    return {
      threw: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const invokeDiscoveryBoundary = (
  workspaceValue: unknown,
  sourceValue: unknown,
  programValue: unknown,
  evidenceValue: unknown,
): PublicCallOutcome<X4UiSourceEditCatalog> => invokePublic(() => {
  // @ts-expect-error Deliberately exercise the runtime boundary with malformed positional inputs.
  return discoverX4UiSourceEdits(workspaceValue, sourceValue, programValue, evidenceValue);
});

const invokeApplyBoundary = (
  workspaceValue: unknown,
  sourceValue: unknown,
  catalogValue: unknown,
  entryIdValue: unknown,
  replacementValue: unknown,
  expectedPathValue: unknown = undefined,
  expectedStartValue: unknown = undefined,
  expectedEndValue: unknown = undefined,
  expectedTextValue: unknown = undefined,
): PublicCallOutcome<X4UiSourceEditResult> => invokePublic(() => {
  // @ts-expect-error Deliberately exercise the runtime boundary with malformed positional inputs.
  return applyX4UiSourceEdit(workspaceValue, sourceValue, catalogValue, entryIdValue, replacementValue, expectedPathValue, expectedStartValue, expectedEndValue, expectedTextValue);
});

const invokeStructuralApplyBoundary = (
  workspaceValue: unknown,
  sourceValue: unknown,
  catalogValue: unknown,
  actionIdValue: unknown,
  directCallValue: unknown = undefined,
  expectedPathValue: unknown = undefined,
  expectedStartValue: unknown = undefined,
  expectedEndValue: unknown = undefined,
  expectedTextValue: unknown = undefined,
): PublicCallOutcome<ReturnType<typeof applyX4UiSourceStructuralEdit>> => invokePublic(() => {
  // @ts-expect-error Deliberately exercise the structural runtime boundary with malformed positional inputs.
  return applyX4UiSourceStructuralEdit(workspaceValue, sourceValue, catalogValue, actionIdValue, directCallValue, expectedPathValue, expectedStartValue, expectedEndValue, expectedTextValue);
});

const frozenClone = <T>(value: T): T => {
  const clone: T = structuredClone(value);
  const seen = new WeakSet<object>();
  const freeze = (candidate: unknown): void => {
    if (candidate === null || typeof candidate !== 'object' || seen.has(candidate)) return;
    seen.add(candidate);
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(candidate))) {
      if ('value' in descriptor) freeze(descriptor.value);
    }
    Object.freeze(candidate);
  };
  freeze(clone);
  return clone;
};

interface TrapCounter {
  reads: number;
  trap?: string;
}

const hostileProxy = <T extends object>(target: T, counter: TrapCounter): T => new Proxy(target, {
  get(): never {
    counter.reads += 1;
    counter.trap = 'get';
    throw new Error('hostile proxy get trap executed');
  },
  getOwnPropertyDescriptor(): never {
    counter.reads += 1;
    counter.trap = 'getOwnPropertyDescriptor';
    throw new Error('hostile proxy descriptor trap executed');
  },
  getPrototypeOf(): never {
    counter.reads += 1;
    counter.trap = 'getPrototypeOf';
    throw new Error('hostile proxy prototype trap executed');
  },
  has(): never {
    counter.reads += 1;
    counter.trap = 'has';
    throw new Error('hostile proxy has trap executed');
  },
  ownKeys(): never {
    counter.reads += 1;
    counter.trap = 'ownKeys';
    throw new Error('hostile proxy ownKeys trap executed');
  },
});

const ownUndefinedPaths = (
  value: unknown,
  path = 'model',
  seen = new WeakSet<object>(),
): readonly string[] => {
  if (value === null || typeof value !== 'object' || seen.has(value)) return [];
  seen.add(value);
  const paths: string[] = [];
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (key === 'length' || !('value' in descriptor)) continue;
    const childPath = Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`;
    if (descriptor.value === undefined) paths.push(childPath);
    else paths.push(...ownUndefinedPaths(descriptor.value, childPath, seen));
  }
  return paths;
};

const normalizationMessage = (model: X4UiCallModel): string => {
  try {
    normalizeX4UiSourceEditLayoutModel(model);
    return 'accepted';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

const runStructuralPreviewContinuation = (corpus: X4UiCorpusCanonicalSuccess): void => {
  const lua = [
    'local menu = { name = "StructuralPreview" }',
    'function menu.createFrame()',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local t = frame:addTable(1, { width = 80, scaling = false })',
    'local a = t:addRow(false, {})', 'a[1]:createText("Known A", { height = 10 })',
    'local b = t:addRow(false, {})', 'b[1]:createText("Known B", { height = 10 })',
    'local c = t:addRow(false, {})', 'c[1]:createText("Known C", { height = 10 })',
    'local sampled = frame:addTable(1, { width = 80, scaling = false })',
    'local d = sampled:addRow(false, {})', 'd[1]:createText(previewText, { height = 10 })',
    'local e = sampled:addRow(false, {})', 'e[1]:createText(previewText, { height = 10 })',
    'frame:display()', 'end',
  ].join('\n');
  const context = sessionContextFor(workspace(lua), corpus, 'ui/edit.lua', target => target.name === 'menu.createFrame', 'structural preview');
  const model = normalizeX4UiSourceEditLayoutModel(context.source.bundle!.sourceFiles.find(file => file.path === 'ui/edit.lua')!.callModel);
  const target = createX4UiLayoutTargetCatalog(model).targets.find(item => item.name === 'menu.createFrame')!;
  const seed = projectX4UiLayoutProgram(model, target, context.program.profile, undefined, undefined, undefined, corpus);
  assert.notEqual(seed.status, 'refused'); if (seed.status === 'refused') throw new Error('seed projection refused');
  assert.equal(seed.program.sampleCatalog.entries.length, 2);
  const samples = { catalogId: seed.program.sampleCatalog.id, source: seed.program.sampleCatalog.sourceIdentity,
    values: seed.program.sampleCatalog.entries.map((entry, i) => ({ id: entry.id, value: ['Scenario B', 'Independent B'][i]! })) };
  for (const active of [false, true]) {
    const projected = projectX4UiLayoutProgram(model, target, context.program.profile,
      active ? samples : undefined, undefined, undefined, corpus);
    if (projected.status === 'refused') throw new Error('sample projection refused');
    const catalog = discoverX4UiSourceEdits(context.workspace, context.source, projected.program, projected.evidenceAuthority);
    const move = catalog.moveEntries?.find(entry => entry.direction === 'down' && entry.rowIndex === 1);
    if (!active) {
      assert.equal(move, undefined, 'unresolved no-input operation stream does not admit the move');
      console.log('B119_STRUCTURAL_PREVIEW no-input: row move correctly unavailable');
      continue;
    }
    assert.ok(move, `active=${active}: actual owner admits known adjacent rows; ${JSON.stringify({ status: catalog.status, reason: catalog.reason, detail: catalog.detail, moves: catalog.moveEntries?.map(entry => [entry.rowIndex, entry.direction]), gaps: projected.program.gaps.map(gap => gap.reason) })}`);
    const replacement = move.lower.expectedText + move.upper.expectedText;
    const nextLua = lua.slice(0, move.startOffset) + replacement + lua.slice(move.endOffset);
    const nextSource = buildX4UiWorkspaceSource(workspace(nextLua));
    const nextModel = normalizeX4UiSourceEditLayoutModel(nextSource.bundle!.sourceFiles.find(file => file.path === 'ui/edit.lua')!.callModel);
    const nextTarget = createX4UiLayoutTargetCatalog(nextModel).targets.find(item => item.name === 'menu.createFrame')!;
    const nextProfile = { ...projected.program.profile, source: nextTarget.sourceIdentity };
    const splice = { path: move.path, startOffset: move.startOffset, endOffset: move.endOffset, expectedText: move.expectedText, replacement,
      retainedSpans: [
        { beforeStart: move.upper.startOffset, beforeEnd: move.upper.endOffset, afterStart: move.startOffset + move.lower.expectedText.length },
        { beforeStart: move.lower.startOffset, beforeEnd: move.lower.endOffset, afterStart: move.startOffset },
      ] };
    const legacy = reprojectX4UiLayoutProgramWithIssuedColorAuthority(projected.program, projected.evidenceAuthority, nextModel, nextTarget, nextProfile);
    const continued = reprojectX4UiLayoutProgramWithIssuedColorAuthority(projected.program, projected.evidenceAuthority, nextModel, nextTarget, nextProfile, splice);
    assert.notEqual(continued.status, 'refused');
    if (continued.status !== 'refused' && legacy.status !== 'refused') {
      assert.equal(legacy.program.previewSampleBindings.length, 0);
      assert.deepEqual(continued.program.previewSampleBindings.map(item => item.value), ['Scenario B', 'Independent B']);
      assert.equal(legacy.program.operations.filter(op => op.status !== 'applied').length, 2);
      assert.equal(continued.program.operations.filter(op => op.status !== 'applied').length, 0);
      const ledger = { beforeCalls: context.source.bundle!.sourceFiles.find(file => file.path === 'ui/edit.lua')!.callModel.calls,
        afterCalls: nextSource.bundle!.sourceFiles.find(file => file.path === 'ui/edit.lua')!.callModel.calls,
        beforeRecords: context.source.bundle!.sourceFiles.find(file => file.path === 'ui/edit.lua')!.callModel.records,
        afterRecords: nextSource.bundle!.sourceFiles.find(file => file.path === 'ui/edit.lua')!.callModel.records,
        beforeOperations: projected.program.operations, afterOperations: continued.program.operations,
        entry: move, beforeText: lua, afterText: nextLua, replacementLength: replacement.length, insertedCallIndex: -1, insertedOperationIndex: -1 };
      assert.equal(compareX4UiSourceStructuralLedgerCorrespondence(ledger), true, 'whole operation/kernel ledger with exact new sample identities');
      for (const tamper of ['hash', 'range', 'type', 'value'] as const) {
        const changed = structuredClone(ledger);
        const op = changed.afterOperations.find(item => item.descriptorFacts?.text?.status === 'known' && item.descriptorFacts.text.provenance === 'preview-sample')!;
        const fact = op.descriptorFacts!.text as unknown as { sampleId: string; value: string };
        if (tamper === 'hash') fact.sampleId = fact.sampleId.replace(/[A-F0-9]{64}/, '0'.repeat(64));
        if (tamper === 'range') fact.sampleId = fact.sampleId.replace(/\|\d+:/, '|999:');
        if (tamper === 'type') fact.sampleId = fact.sampleId.replace(/string$/, 'number');
        if (tamper === 'value') fact.value = 'wrong consumer value';
        assert.equal(compareX4UiSourceStructuralLedgerCorrespondence(changed), false, `tampered sample ${tamper} cannot pass correspondence`);
      }
      for (const invalid of [{ ...splice, expectedText: 'foreign' }, { ...splice, startOffset: splice.startOffset + 1 },
        { ...splice, retainedSpans: [splice.retainedSpans[0]!, splice.retainedSpans[0]!] }]) {
        assert.equal(reprojectX4UiLayoutProgramWithIssuedColorAuthority(projected.program, projected.evidenceAuthority, nextModel, nextTarget, nextProfile, invalid).status, 'refused');
      }
      assert.equal(reprojectX4UiLayoutProgramWithIssuedColorAuthority(structuredClone(projected.program), projected.evidenceAuthority, nextModel, nextTarget, nextProfile, splice).status, 'refused');
      console.log('B119_STRUCTURAL_PREVIEW causal: legacy drops 2 samples; fresh reissue keeps both; forged hash/range/type/value, false splice and foreign authority refuse');
    }
    const result = applyX4UiSourceRowMove(context.workspace, context.source, catalog, { entry: move });
    console.log(`B119_STRUCTURAL_PREVIEW ${JSON.stringify({ active, accepted: result.accepted,
      ...(result.accepted === false ? { reason: result.reason, detail: result.detail } : {}) })}`);
    assert.equal(result.accepted, true, `active=${active}: move must preserve unrelated sampled consumers`);
    if (result.accepted) {
      assert.equal(result.source.bundle!.sourceFiles.find(file => file.path === 'ui/edit.lua')!.text, nextLua);
      const insertion = result.catalog.insertEntries?.find(entry => entry.kind === 'insert-row' && entry.rowIndex === 1);
      assert.ok(insertion && insertion.kind === 'insert-row');
      const inserted = applyX4UiSourceRowInsertion(result.workspace, result.source, result.catalog, { entry: insertion });
      assert.equal(inserted.accepted, true, `insert row with active samples: ${inserted.accepted === false ? inserted.detail : 'accepted'}`);
      assert.equal(applyX4UiSourceRowMove(result.workspace, result.source, result.catalog, { entry: move }).accepted, false, 'stale move cannot mutate the new source');
      console.log('B119_STRUCTURAL_PREVIEW PASS: exact row move, insertion and stale-entry refusal');
    }
    const sampledMove = catalog.moveEntries?.find(entry => entry.direction === 'down' && entry.rowIndex === 1
      && entry.tableId === projected.program.tables[1]!.id);
    assert.ok(sampledMove, 'actual owner must admit the two rows whose exact text samples are consumed');
    const reorderedSamples = applyX4UiSourceRowMove(context.workspace, context.source, catalog, { entry: sampledMove });
    assert.equal(reorderedSamples.accepted, true, `sampled row move: ${reorderedSamples.accepted === false ? reorderedSamples.detail : 'accepted'}`);
    assert.equal(applyX4UiSourceRowMove(context.workspace, context.source, catalog, { entry: structuredClone(sampledMove) }).accepted, false,
      'copied sampled-row entry must not acquire owner authority');
    const partial = projectX4UiLayoutProgram(model, target, context.program.profile,
      { ...samples, values: samples.values.slice(0, 1) }, undefined, undefined, corpus);
    assert.notEqual(partial.status, 'refused');
    if (partial.status !== 'refused') {
      const partialCatalog = discoverX4UiSourceEdits(context.workspace, context.source, partial.program, partial.evidenceAuthority);
      assert.equal(partialCatalog.moveEntries?.some(entry => entry.tableId === partial.program.tables[1]!.id), false,
        'one consumed sample cannot authorize an adjacent row with an unresolved input');
    }
    console.log('B119_SAMPLED_ROW_OWNER PASS: consumed in-block inputs admit exact row permutation; copied or incomplete authority refuses');
  }
};

const runSampledWrappingEdit = (corpus: X4UiCorpusCanonicalSuccess): void => {
  const lua = 'local menu = { name = "SampledWrapping" }\nfunction menu.createFrame()\n'
    + 'local frame = Helper.createFrameHandle(menu, { width = 320, height = 260 })\n'
    + 'local t = frame:addTable(1, { width = 280, scaling = false })\n'
    + 'local row = t:addRow(false, {})\nrow[1]:createText(previewText, { wordwrap = false })\nframe:display()\nend';
  const context = sessionContextFor(workspace(lua), corpus, 'ui/edit.lua', target => target.name === 'menu.createFrame', 'sampled wrapping');
  const model = normalizeX4UiSourceEditLayoutModel(context.source.bundle!.sourceFiles.find(file => file.path === 'ui/edit.lua')!.callModel);
  const target = createX4UiLayoutTargetCatalog(model).targets.find(item => item.name === 'menu.createFrame')!;
  const seed = projectX4UiLayoutProgram(model, target, context.program.profile, undefined, undefined, undefined, corpus);
  assert.notEqual(seed.status, 'refused');
  const samples = seed.program!.sampleCatalog;
  assert.equal(samples.entries.length, 1);
  const projected = projectX4UiLayoutProgram(model, target, context.program.profile,
    { catalogId: samples.id, source: samples.sourceIdentity, values: [{ id: samples.entries[0]!.id,
      value: 'The station has approved your docking request. Approach the marked landing area and wait for clearance.\n\nReady' }] },
    undefined, undefined, corpus);
  assert.notEqual(projected.status, 'refused');
  if (projected.status === 'refused') throw new Error('sampled wrapping fixture refused');
  const catalog = discoverX4UiSourceEdits(context.workspace, context.source, projected.program, projected.evidenceAuthority);
  const wrappingOffset = lua.indexOf('false', lua.indexOf('wordwrap'));
  const entry = catalog.editableEntries.find(item => item.startOffset === wrappingOffset && item.valueType === 'boolean');
  assert.ok(entry, 'literal Wrapping property remains editable');
  const result = applyX4UiSourceEdit(context.workspace, context.source, catalog, entry.id, true);
  console.log('B119_SAMPLED_WRAPPING_EDIT', JSON.stringify({ accepted: result.accepted,
    ...(result.accepted === false ? { reason: result.reason, detail: result.detail } : {}) }));
  assert.equal(result.accepted, true, 'Wrapping Apply must reissue the text sample needed by the same call');
  if (result.accepted) {
    assert.equal(result.source.bundle!.sourceFiles.find(file => file.path === 'ui/edit.lua')!.text, lua.replace('wordwrap = false', 'wordwrap = true'));
    const next = result.catalog.editableEntries.find(item => item.startOffset === wrappingOffset && item.valueType === 'boolean');
    assert.ok(next);
    const inverse = applyX4UiSourceEdit(result.workspace, result.source, result.catalog, next.id, false);
    assert.equal(inverse.accepted, true);
    assert.equal(inverse.source.bundle!.sourceFiles.find(file => file.path === 'ui/edit.lua')!.text, lua);
    assert.equal(applyX4UiSourceEdit(result.workspace, result.source, catalog, entry.id, false).accepted, false, 'stale catalog refuses');
  }
  assert.equal(applyX4UiSourceEdit(context.workspace, context.source, structuredClone(catalog), entry.id, true).accepted, false, 'copied catalog refuses');
  console.log('B119_SAMPLED_WRAPPING_EDIT PASS: exact source scalar/inverse, retained sampled height, stale/copied authority refusal');
};

const runMixedDispatchCaptionEdit = (corpus: X4UiCorpusCanonicalSuccess): void => {
  const lua = 'local menu = { name = "DispatchCaption" }\n'
    + 'local function body(frame)\nlocal t=frame:addTable(1,{width=100,scaling=false})\n'
    + 'local r=t:addRow(false,{})\nr[1]:createText("BODY",{height=20})\nend\n'
    + 'local sections={ONE=body}\nfunction menu.display()\n'
    + 'local frame=Helper.createFrameHandle(menu,{width=400,height=300})\n'
    + 'local t=frame:addTable(1,{width=300,scaling=false})\nlocal r=t:addRow(false,{})\n'
    + 'r[1]:createText("HEADING",{height=20})\n'
    + 'if runtimeExtra then r[1]:createText("HIDDEN",{height=20}) end\n'
    + 'local selected=sections[section] or body\npcall(selected,frame)\nframe:display()\nend\n';
  const original = workspace(lua);
  const context = sessionContextFor(original, corpus, 'ui/edit.lua', target => target.name === 'menu.display', 'mixed dispatch caption');
  const model = normalizeX4UiSourceEditLayoutModel(context.source.bundle!.sourceFiles.find(file => file.path === 'ui/edit.lua')!.callModel)!;
  const choice = context.program.previewPathCatalog.entries.find(entry => entry.arm === 'dispatch' && entry.label === 'ONE');
  assert.ok(choice);
  const projected = projectX4UiLayoutProgram(model, context.program.target, context.program.profile, undefined,
    { catalogId: context.program.previewPathCatalog.id, source: context.program.previewPathCatalog.sourceIdentity,
      selections: [{ id: choice.id, boundaryId: choice.boundaryId, armId: choice.armId }] }, undefined, corpus);
  assert.notEqual(projected.status, 'refused');
  if (projected.status === 'refused') throw new Error('dispatch source projection refused');
  assert.ok(projected.program.operations.some(operation => operation.status === 'conditional'));
  assert.equal(projected.program.previewPathSelections.length, 1);
  const catalog = discoverX4UiSourceEdits(original, context.source, projected.program, projected.evidenceAuthority);
  const offset = lua.indexOf('"HEADING"');
  const entry = catalog.editableEntries.find(candidate => candidate.startOffset === offset && candidate.value === 'HEADING');
  assert.ok(entry, `direct caption under finite section must be editable: ${catalog.detail}`);
  assert.equal(catalog.structuralEntries.length, 0, 'mixed dispatch gains no structural authority');
  assert.equal(catalog.editableEntries.some(candidate => candidate.value === 'HIDDEN' || candidate.value === 'BODY'), false,
    'conditional and out-of-target helper literals remain locked');
  const edited = applyX4UiSourceEdit(original, context.source, catalog, entry.id, 'LONGER HEADING');
  assert.equal(edited.accepted, true, edited.accepted === false ? edited.detail : '');
  if (!edited.accepted) throw new Error('dispatch scalar edit unexpectedly refused');
  assert.equal(sourceTextAt(edited, 'ui/edit.lua'), lua.replace('"HEADING"', '"LONGER HEADING"'));
  const next = edited.catalog.editableEntries.find(candidate => candidate.startOffset === offset && candidate.value === 'LONGER HEADING');
  assert.ok(next, 'fresh source-owned catalog must rediscover the literal');
  const inverse = applyX4UiSourceEdit(edited.workspace, edited.source, edited.catalog, next.id, 'HEADING');
  assert.equal(inverse.accepted, true);
  assert.equal(sourceTextAt(inverse, 'ui/edit.lua'), lua);
  assert.equal(sourceTextAt(context, 'ui/edit.lua'), lua);
  assert.deepEqual(edited.workspace.passthroughFiles?.filter(file => file.path !== 'ui/edit.lua'),
    original.passthroughFiles?.filter(file => file.path !== 'ui/edit.lua'));
  assert.equal(applyX4UiSourceEdit(edited.workspace, edited.source, catalog, entry.id, 'BAD').accepted, false);
  assert.equal(applyX4UiSourceEdit(original, context.source, structuredClone(catalog), entry.id, 'BAD').accepted, false);
  assert.equal(discoverX4UiSourceEdits(original, context.source, structuredClone(projected.program), projected.evidenceAuthority).status, 'locked');
  console.log('B119_DISPATCH_CAPTION_EDIT PASS: direct scalar/inverse/local bytes; mixed helper/branch/structural/stale/copied locks retained');
};

const runMixedSampledCaptionEdit = (corpus: X4UiCorpusCanonicalSuccess): void => {
  const lua = 'local menu = { name = "MixedSampledCaption" }\nfunction menu.createFrame()\n'
    + 'local frame = Helper.createFrameHandle(menu, { width = 320, height = 260 })\n'
    + 'local t = frame:addTable(2, { width = 280, scaling = false })\n'
    + 'local row = t:addRow(false, {})\nrow[1]:createText(previewText, { height = 20 })\n'
    + 'row[2]:createButton({}):setText("DOSSIER", {})\n'
    + 'row[2].handlers.onClick = function() open("DOSSIER") end\n'
    + 'if runtimeExtra then row[1]:createText("HIDDEN", {}) end\nframe:display()\nend\n';
  const original = workspace(lua);
  const context = sessionContextFor(original, corpus, 'ui/edit.lua', target => target.name === 'menu.createFrame', 'mixed sampled caption');
  const model = normalizeX4UiSourceEditLayoutModel(context.source.bundle!.sourceFiles.find(file => file.path === 'ui/edit.lua')!.callModel);
  const sample = context.program.sampleCatalog.entries.find(entry => entry.expression === 'previewText');
  assert.ok(sample);
  const projected = projectX4UiLayoutProgram(model, context.program.target, context.program.profile,
    { catalogId: context.program.sampleCatalog.id, source: context.program.sampleCatalog.sourceIdentity,
      values: [{ id: sample.id, value: 'COMM CHANNEL    encrypted - sampled sector' }] }, undefined, undefined, corpus);
  assert.notEqual(projected.status, 'refused');
  if (projected.status === 'refused') throw new Error('mixed sampled caption projection refused');
  assert.ok(projected.program.operations.some(operation => operation.status === 'conditional'));
  assert.equal(projected.program.previewSampleBindings.length, 1);
  assert.ok(projected.program.previewSampleBindings.every(binding => binding.status === 'consumed'),
    JSON.stringify(projected.program.previewSampleBindings));
  const catalog = discoverX4UiSourceEdits(original, context.source, projected.program, projected.evidenceAuthority);
  const offset = lua.indexOf('"DOSSIER"');
  const entry = catalog.editableEntries.find(candidate => candidate.startOffset === offset && candidate.value === 'DOSSIER');
  assert.ok(entry, `mixed sampled caption must expose its direct literal: ${catalog.detail}`);
  assert.equal(catalog.structuralEntries.length, 0, 'mixed stream must not gain structural authority');
  assert.equal(catalog.editableEntries.some(candidate => candidate.value === 'HIDDEN'), false, 'conditional source stays locked');
  assert.equal(catalog.editableEntries.some(candidate => candidate.expression === 'previewText'), false, 'sample is not a source literal');
  const result = applyX4UiSourceEdit(original, context.source, catalog, entry.id, 'DOSSIER +');
  assert.equal(result.accepted, true, result.accepted === false ? result.detail : undefined);
  if (!result.accepted) throw new Error('mixed caption edit refused');
  const expected = lua.slice(0, offset) + '"DOSSIER +"' + lua.slice(offset + '"DOSSIER"'.length);
  assert.equal(sourceTextAt(result, 'ui/edit.lua'), expected);
  assert.ok(expected.includes('open("DOSSIER")'), 'same-word callback must not change');
  assert.deepEqual(result.workspace.passthroughFiles?.filter(file => file.path !== 'ui/edit.lua'),
    original.passthroughFiles?.filter(file => file.path !== 'ui/edit.lua'));
  const next = result.catalog.editableEntries.find(candidate => candidate.startOffset === offset && candidate.value === 'DOSSIER +');
  assert.ok(next);
  const inverse = applyX4UiSourceEdit(result.workspace, result.source, result.catalog, next.id, 'DOSSIER');
  assert.equal(inverse.accepted, true);
  assert.equal(sourceTextAt(inverse, 'ui/edit.lua'), lua);
  assert.equal(sourceTextAt(context, 'ui/edit.lua'), lua);
  assert.equal(applyX4UiSourceEdit(result.workspace, result.source, catalog, entry.id, 'BAD').accepted, false, 'stale source/catalog refuses');
  assert.equal(applyX4UiSourceEdit(original, context.source, structuredClone(catalog), entry.id, 'BAD').accepted, false, 'copied catalog refuses');
  assert.equal(discoverX4UiSourceEdits(original, context.source, structuredClone(projected.program), projected.evidenceAuthority).status, 'locked',
    'copied program cannot authorize preview-bound scalar edits');
  console.log('B119_MIXED_SAMPLED_CAPTION PASS: direct literal/callback bytes/inverse retained; conditional/dynamic/stale/copied authority locked');
};

const runLocalInstanceDirectCaptionEdit = (corpus: X4UiCorpusCanonicalSuccess): void => {
  const lua = 'local menu = { name = "LocalInstanceCaption" }\nfunction menu.display()\n'
    + 'local frame = Helper.createFrameHandle(menu, { width = 400, height = 300 })\n'
    + 'local function railLabel(parent, caption)\n'
    + 'local t = parent:addTable(1, { width = 100, scaling = false })\n'
    + 'local r = t:addRow(false, {})\nr[1]:createText(caption, { height = 20 })\nend\n'
    + 'railLabel(frame, "FIRST")\nrailLabel(frame, "SECOND")\n'
    + 'local t = frame:addTable(2, { width = 300, scaling = false })\n'
    + 'local row = t:addRow(false, {})\nrow[1]:createText("SEND", { height = 20 })\n'
    + 'row[2]:createButton({}):setText("END", {})\n'
    + 'row[2].handlers.onClick = function() open("SEND") end\n'
    + 'if runtimeExtra then row[1]:createText("HIDDEN", {}) end\nframe:display()\nend\n';
  const original = workspace(lua);
  const context = sessionContextFor(original, corpus, 'ui/edit.lua', target => target.name === 'menu.display', 'local instance caption');
  const expanded = context.program.operations.filter(operation => operation.localExpansion);
  assert.equal(expanded.length, 6, 'two complete three-call helper instances must be present');
  const tables = expanded.filter(operation => operation.kind === 'addTable');
  assert.equal(tables.length, 2);
  assert.equal(tables[0].modelOrder, tables[1].modelOrder, 'same raw helper source call');
  assert.notDeepEqual(tables[0].metadata.result, tables[1].metadata.result, 'distinct per-invocation table identities');
  assert.notDeepEqual(tables[0].localExpansion, tables[1].localExpansion);
  for (const operation of expanded) {
    const retained = getIssuedX4UiLayoutExpandedCallMetadata(context.program, context.evidenceAuthority, operation);
    assert.ok(retained, 'exact expanded operation has retained input metadata');
    assert.deepEqual(retained, operation.metadata, `expanded input metadata agrees at ${operation.source.start.line}`);
    assert.equal(Object.isFrozen(retained), true);
    assert.equal(Object.isFrozen(retained.semantics), true);
    assert.equal(getIssuedX4UiLayoutExpandedCallMetadata(context.program, context.evidenceAuthority, structuredClone(operation)), undefined);
  }
  const firstMetadata = getIssuedX4UiLayoutExpandedCallMetadata(context.program, context.evidenceAuthority, tables[0]);
  const secondMetadata = getIssuedX4UiLayoutExpandedCallMetadata(context.program, context.evidenceAuthority, tables[1]);
  assert.notDeepEqual(firstMetadata, secondMetadata, 'same raw call cannot borrow another invocation metadata');
  assert.equal(getIssuedX4UiLayoutExpandedCallMetadata(context.program, context.evidenceAuthority, context.program.operations[0]), undefined,
    'direct operations have no expanded override');
  assert.equal(getIssuedX4UiLayoutExpandedCallMetadata(structuredClone(context.program), context.evidenceAuthority, tables[0]), undefined);
  assert.equal(getIssuedX4UiLayoutExpandedCallMetadata(context.program, structuredClone(context.evidenceAuthority), tables[0]), undefined);
  const foreign = sessionContextFor(original, corpus, 'ui/edit.lua', target => target.name === 'menu.display', 'foreign local instance');
  assert.equal(getIssuedX4UiLayoutExpandedCallMetadata(foreign.program, foreign.evidenceAuthority, tables[0]), undefined,
    'even independently issued equal-text operations cannot be exchanged');
  const model = normalizeX4UiSourceEditLayoutModel(context.source.bundle!.sourceFiles.find(file => file.path === 'ui/edit.lua')!.callModel)!;
  const rawTamper = structuredClone(model);
  const rawTable = rawTamper.calls.find(call => call.order === tables[0].modelOrder)!;
  Object.assign(rawTable.result!, { path: '@local-instance:forged|t' });
  assert.equal(isIssuedX4UiLayoutEvidencePairForModel(context.program, context.evidenceAuthority, rawTamper), false,
    'raw-model namespace changes still invalidate the complete issuance');
  assert.ok(context.program.operations.some(operation => operation.status === 'conditional'), 'fixture retains a mixed stream');
  const catalog = discoverX4UiSourceEdits(original, context.source, context.program, context.evidenceAuthority);
  const offset = lua.indexOf('"SEND"');
  const entry = catalog.editableEntries.find(candidate => candidate.startOffset === offset && candidate.value === 'SEND');
  assert.ok(entry, `repeated local instances must not lock the unrelated SEND literal: ${catalog.detail}`);
  assert.equal(catalog.structuralEntries.length, 0, 'mixed expansion does not gain structural authority');
  assert.equal(catalog.editableEntries.some(candidate => ['FIRST', 'SECOND', 'HIDDEN'].includes(String(candidate.value))), false);
  assert.equal(catalog.editableEntries.some(candidate => expanded.some(operation =>
    operation.source.start.offset <= candidate.startOffset && candidate.endOffset <= operation.source.end.offset)), false,
  'helper bodies stay locked');
  const result = applyX4UiSourceEdit(original, context.source, catalog, entry.id, 'TRANSMIT');
  assert.equal(result.accepted, true, result.accepted === false ? result.detail : undefined);
  if (!result.accepted) throw new Error('local instance caption edit refused');
  const expected = lua.slice(0, offset) + '"TRANSMIT"' + lua.slice(offset + '"SEND"'.length);
  assert.equal(sourceTextAt(result, 'ui/edit.lua'), expected);
  assert.ok(expected.includes('open("SEND")'), 'callback is not the edited caption');
  assert.deepEqual(result.workspace.passthroughFiles?.filter(file => file.path !== 'ui/edit.lua'),
    original.passthroughFiles?.filter(file => file.path !== 'ui/edit.lua'));
  const next = result.catalog.editableEntries.find(candidate => candidate.startOffset === offset && candidate.value === 'TRANSMIT');
  assert.ok(next, 'post-edit reparse must reissue exact authority after target and invocation identities change');
  const inverse = applyX4UiSourceEdit(result.workspace, result.source, result.catalog, next.id, 'SEND');
  assert.equal(inverse.accepted, true);
  assert.equal(sourceTextAt(inverse, 'ui/edit.lua'), lua);
  assert.equal(sourceTextAt(context, 'ui/edit.lua'), lua);
  assert.equal(applyX4UiSourceEdit(result.workspace, result.source, catalog, entry.id, 'BAD').accepted, false);
  assert.equal(applyX4UiSourceEdit(original, context.source, structuredClone(catalog), entry.id, 'BAD').accepted, false);
  for (const tamper of ['namespace', 'invocation', 'metadata', 'swap'] as const) {
    const fake = structuredClone(context.program) as unknown as { operations: Record<string, unknown>[] };
    const index = context.program.operations.indexOf(tables[0]);
    if (tamper === 'namespace') fake.operations[index].metadata = { ...tables[0].metadata, result: tables[1].metadata.result };
    if (tamper === 'invocation') fake.operations[index].localExpansion = tables[1].localExpansion;
    if (tamper === 'metadata') fake.operations[index].metadata = context.program.operations[0].metadata;
    if (tamper === 'swap') {
      const secondIndex = context.program.operations.indexOf(tables[1]);
      [fake.operations[index], fake.operations[secondIndex]] = [fake.operations[secondIndex], fake.operations[index]];
    }
    assert.equal(discoverX4UiSourceEdits(original, context.source, fake as unknown as X4UiLayoutProgram, context.evidenceAuthority).status, 'locked', tamper);
  }
  assert.equal(discoverX4UiSourceEdits(original, context.source, context.program, structuredClone(context.evidenceAuthority)).status, 'locked');
  console.log('B119_LOCAL_INSTANCE_CAPTION PASS: repeated instance identity, literal CAS/inverse, helper/conditional locks and stale/copied/tampered authority refusal');
};

const runSourceProvenLoopCaptionEdits = (corpus: X4UiCorpusCanonicalSuccess): void => {
  for (const kind of ['numeric', 'ipairs'] as const) {
    for (const mixed of [false, true]) {
      const lua = [
        'local menu = { name = "SourceLoopEdit" }',
        'local labels = { "One", "Two", "Three" }',
        'function menu.createFrame()',
        'local frame = Helper.createFrameHandle(menu, { width = 400, height = 260 })',
        'local t = frame:addTable(1, { width = 300, scaling = false })',
        'local heading = t:addRow(false, {})',
        'heading[1]:createText("HEADING", {})',
        kind === 'numeric' ? 'for i = 1, 3 do' : 'for i, label in ipairs(labels) do',
        'local row = t:addRow(false, {})',
        kind === 'numeric' ? 'row[1]:createText("LOOP", {})' : 'row[1]:createText(label, {})',
        'end',
        ...(mixed ? ['if runtimeExtra then heading[1]:createText("CONDITIONAL", {}) end'] : []),
        'frame:display()', 'end', '-- unrelated tail',
      ].join('\n');
      const original = workspace(lua);
      const context = sessionContextFor(original, corpus, 'ui/edit.lua', target => target.name === 'menu.createFrame', 'source-proven loop caption');
      assert.deepEqual(context.program.previewLoopSelections.map(entry => entry.iterationCount), [3]);
      const catalog = catalogFor(context);
      const entry = catalog.editableEntries.find(item => item.value === 'HEADING');
      assert.ok(entry, `${kind}/${mixed}: direct heading must remain editable: ${catalog.detail}`);
      assert.equal(catalog.structuralEntries.length, 0, 'source-loop replay must not create structural authority');
      assert.ok(catalog.editableEntries.every(item => item.startOffset < lua.indexOf('for i') || item.startOffset > lua.indexOf('\nend\n')),
        'loop-body literals are not independent edit anchors');
      assert.equal(catalog.editableEntries.some(item => item.value === 'CONDITIONAL'), false);
      const result = applyX4UiSourceEdit(original, context.source, catalog, entry.id, 'EDITED HEADING');
      assert.equal(result.accepted, true, result.accepted === false ? result.detail : undefined);
      if (!result.accepted) throw new Error('source-loop heading edit refused');
      assert.equal(sourceTextAt(result, 'ui/edit.lua'), lua.replace('"HEADING"', '"EDITED HEADING"'));
      assert.deepEqual(result.workspace.passthroughFiles?.filter(file => file.path !== 'ui/edit.lua'),
        original.passthroughFiles?.filter(file => file.path !== 'ui/edit.lua'));
      const nextContext = sessionContextFor(result.workspace, corpus, 'ui/edit.lua', target => target.name === 'menu.createFrame', 'edited source loop');
      assert.deepEqual(nextContext.program.previewLoopSelections.map(item => item.iterationCount), [3]);
      const loopTexts = nextContext.program.operations.filter(item => item.kind === 'createText' && item.source.start.line === 10);
      assert.deepEqual(loopTexts.map(item => item.descriptorFacts.text?.status === 'known' ? item.descriptorFacts.text.value : undefined),
        kind === 'numeric' ? ['LOOP', 'LOOP', 'LOOP'] : ['One', 'Two', 'Three']);
      const next = result.catalog.editableEntries.find(item => item.value === 'EDITED HEADING');
      assert.ok(next);
      const inverse = applyX4UiSourceEdit(result.workspace, result.source, result.catalog, next.id, 'HEADING');
      assert.equal(inverse.accepted, true, inverse.accepted === false ? inverse.detail : undefined);
      assert.equal(sourceTextAt(inverse, 'ui/edit.lua'), lua);
      assert.equal(applyX4UiSourceEdit(result.workspace, result.source, catalog, entry.id, 'STALE').accepted, false);
      assert.equal(applyX4UiSourceEdit(original, context.source, structuredClone(catalog), entry.id, 'COPIED').accepted, false);
      assert.equal(discoverX4UiSourceEdits(original, context.source, structuredClone(context.program), context.evidenceAuthority).status, 'locked');
      const model = normalizeX4UiSourceEditLayoutModel(context.source.bundle!.sourceFiles.find(file => file.path === 'ui/edit.lua')!.callModel);
      const loops = context.program.previewLoopCatalog;
      for (const iterationCount of [2, 3, 4]) {
        const replay = projectX4UiLayoutProgram(model, context.program.target, context.program.profile,
          undefined, undefined, undefined, corpus, { catalogId: loops.id, source: loops.sourceIdentity,
            targetId: loops.targetId, profileId: loops.profileId, selections: [{ id: loops.entries[0]!.id, iterationCount }] });
        assert.notEqual(replay.status, 'refused');
        if (replay.status === 'refused') throw new Error('loop count replay refused');
        const replayCatalog = discoverX4UiSourceEdits(original, context.source, replay.program, replay.evidenceAuthority);
        assert.equal(replayCatalog.status, iterationCount === 3 ? 'ready' : 'locked', 'only the complete source-proven count grants direct scalar continuation');
        if (iterationCount !== 3) assert.equal(replayCatalog.editableEntries.length, 0);
      }
      assert.equal(sourceTextAt(context, 'ui/edit.lua'), lua);
      console.log(`B119_SOURCE_LOOP_CAPTION PASS ${kind}/${mixed}: direct CAS/inverse, retained loops, locked loop anchors, stale/copy/mismatched counts`);
    }
  }
};

const run = async (): Promise<void> => {
  const canonicalCorpus = await loadCanonicalSourceEditsSelftestCorpus();
  runMixedDispatchCaptionEdit(canonicalCorpus);
  runSourceProvenLoopCaptionEdits(canonicalCorpus);
  const discoverProperties = Reflect.get(sourceEditMoveSurface, 'discoverX4UiSourceTextPropertyAdditions') as
    (catalog: X4UiSourceEditCatalog, operationId: string) => readonly { property: string; operationId: string }[];
  const addProperty = Reflect.get(sourceEditMoveSurface, 'applyX4UiSourceTextPropertyAddition') as
    (workspace: ModWorkspace, source: X4UiWorkspaceSource, catalog: X4UiSourceEditCatalog, operationId: string, property: string, value: unknown) => ReturnType<typeof applyX4UiSourceStructuralEdit> & {
      propertySplice?: { path: string; startOffset: number; endOffset: number; expectedText: string; replacement: string };
    };
  assert.equal(typeof discoverProperties, 'function', 'omitted text properties need owner-backed discovery');
  assert.equal(typeof addProperty, 'function', 'omitted text properties need typed source-owner application');
  for (const [callName, options] of [['createText', '{}'], ['createText', ''], ['createText', '{ -- retained comment\n fontsize = 12, }'], ['setText', '{}'], ['setText2', '{}']]) {
    const receiver = callName === 'createText' ? 'row[1]' : 'row[1]:createButton({})';
    const call = `${receiver}:${callName}("Hello"${options ? `, ${options}` : ''})`;
    const lua = ['local menu = { name = "PropertyAddition" }', 'function menu.createFrame()',
      'local frame = Helper.createFrameHandle(menu, { width = 400, height = 180 })',
      'local t = frame:addTable(1, { width = 300, scaling = false })', 'local row = t:addRow(false, {})',
      call, 'frame:display()', 'end', '-- unrelated tail'].join('\n');
    const context = sessionContextFor(workspace(lua), canonicalCorpus, 'ui/edit.lua', target => target.name === 'menu.createFrame', 'missing text property');
    const catalog = catalogFor(context);
    const caption = catalog.editableEntries.find(entry => entry.value === 'Hello'); assert.ok(caption);
    const operationId = caption.provenance.operationId;
    const available = discoverProperties(catalog, operationId);
    assert.ok(available.some(entry => entry.property === 'halign'));
    assert.equal(available.some(entry => entry.property === 'fontsize'), !options.includes('fontsize'));
    assert.deepEqual(discoverProperties(structuredClone(catalog), operationId), []);
    for (const [property, value] of [['halign', 'injected()'], ['fontsize', 0], ['fontsize', -1], ['fontsize', Infinity], ['fontsize', '12'], ['wordwrap', 'false'], ['unknown', 1]] as const) {
      const rejected = addProperty(context.workspace, context.source, catalog, operationId, property, value);
      assert.equal(rejected.accepted, false, `${property} refuses ${String(value)}`);
      assert.equal(rejected.workspace, context.workspace);
    }
    const result = addProperty(context.workspace, context.source, catalog, operationId, 'halign', 'right');
    assert.equal(result.accepted, true, JSON.stringify(result.accepted === false ? { reason: result.reason, detail: result.detail } : {}));
    if (!result.accepted) throw new Error('property addition guard');
    const expectedCall = `${receiver}:${callName}("Hello", ${options ? `{ halign = "right", ${options.slice(1)}` : '{ halign = "right" }'})`;
    const expected = lua.replace(call, expectedCall);
    assert.equal(sourceTextAt(result, 'ui/edit.lua'), expected);
    assert.equal(sourceTextAt(context, 'ui/edit.lua'), lua);
    assert.ok(result.propertySplice);
    const splice = result.propertySplice;
    assert.equal(splice.startOffset, splice.endOffset);
    assert.equal(splice.expectedText, '');
    assert.equal(lua.slice(0, splice.startOffset) + splice.replacement + lua.slice(splice.endOffset), expected);
    const inserted = result.catalog.editableEntries.find(entry => entry.value === 'right' && entry.provenance.fields.includes('semantics.properties.halign'));
    assert.ok(inserted, 'new value must immediately have ordinary scalar edit authority');
    assert.equal(discoverProperties(result.catalog, inserted.provenance.operationId).some(entry => entry.property === 'halign'), false);
    assert.equal(addProperty(result.workspace, result.source, result.catalog, inserted.provenance.operationId, 'halign', 'left').accepted, false);
    assert.equal(addProperty(result.workspace, result.source, catalog, operationId, 'fontsize', 14).accepted, false, 'stale catalog refuses');
    assert.equal(addProperty(context.workspace, context.source, structuredClone(catalog), operationId, 'halign', 'right').accepted, false);
    const scalar = applyX4UiSourceEdit(result.workspace, result.source, result.catalog, inserted.id, 'left');
    assert.equal(scalar.accepted, true);
    assert.equal(sourceTextAt(scalar, 'ui/edit.lua'), expected.replace('halign = "right"', 'halign = "left"'));
    const wrapped = addProperty(result.workspace, result.source, result.catalog, inserted.provenance.operationId, 'wordwrap', false);
    assert.equal(wrapped.accepted, callName === 'createText', `${callName}/${options}: wrapping follows the existing per-call contract: ${wrapped.accepted === false ? wrapped.detail : ''}`);
    assert.equal(sourceTextAt(wrapped, 'ui/edit.lua'), callName === 'createText' ? expected.replace('{ halign =', '{ wordwrap = false,  halign =') : expected);
    let numericContext = wrapped.accepted === true ? wrapped : result;
    if (callName !== 'createText') {
      for (const unsupported of ['wordwrap', 'minRowHeight']) {
        assert.equal(discoverProperties(result.catalog, inserted.provenance.operationId).some(item => item.property === unsupported), false);
        assert.equal(addProperty(result.workspace, result.source, result.catalog, inserted.provenance.operationId, unsupported, unsupported === 'wordwrap' ? false : 3).accepted, false);
      }
    }
    for (const property of ['fontsize', 'x', 'y', 'minRowHeight']) {
      const text = numericContext.catalog.editableEntries.find(entry => entry.value === 'Hello'); assert.ok(text);
      if (property === 'fontsize' && options.includes('fontsize')) continue;
      if (property === 'minRowHeight' && callName !== 'createText') continue;
      assert.ok(discoverProperties(numericContext.catalog, text.provenance.operationId).some(item => item.property === property), `${callName}: missing ${property} must remain discoverable`);
      const before = sourceTextAt(numericContext, 'ui/edit.lua');
      const next = addProperty(numericContext.workspace, numericContext.source, numericContext.catalog, text.provenance.operationId, property, property === 'fontsize' ? 16 : 3);
      assert.equal(next.accepted, true, `${callName} supports ${property}: ${next.accepted === false ? next.detail : ''}`);
      assert.ok(next.propertySplice, 'numeric property insertion retains its minimal splice');
      assert.equal(sourceTextAt(next, 'ui/edit.lua'), before.slice(0, next.propertySplice.startOffset) + next.propertySplice.replacement + before.slice(next.propertySplice.endOffset));
      numericContext = next;
    }
    assert.equal(addProperty(structuredClone(context.workspace), context.source, catalog, operationId, 'halign', 'left').accepted, false);
    if (options.includes('\n')) {
      const entry = catalog.replaceEntries.find(item => item.callBindings.some(binding => binding.operationId === operationId));
      assert.ok(entry);
      const generic = applyX4UiSourceStructuralEdit(context.workspace, context.source, catalog, entry.id, entry.expectedText);
      assert.equal(generic.accepted, false, 'generic replacement still rejects multiline input');
    }
    let reads = 0;
    Object.defineProperty(context.workspace, 'passthroughFiles', { configurable: true, get: () => { reads += 1; throw new Error('getter must not run'); } });
    assert.deepEqual(discoverProperties(catalog, operationId), []);
    assert.equal(addProperty(context.workspace, context.source, catalog, operationId, 'halign', 'left').accepted, false);
    assert.equal(reads, 0, 'property discovery/apply must reject accessors before reading public authority');
  }
  for (const [setup, options] of [['local opts = {}', 'opts'], ['', '{ [runtimeKey] = 12 }']] as const) {
    const lua = ['local menu = { name = "UnsupportedPropertyAddition" }', 'function menu.createFrame()',
      'local frame = Helper.createFrameHandle(menu, { width = 400, height = 180 })',
      'local t = frame:addTable(1, { width = 300, scaling = false })', 'local row = t:addRow(false, {})',
      setup, `row[1]:createText("Hello", ${options})`, 'frame:display()', 'end'].join('\n');
    const context = sessionContextFor(workspace(lua), canonicalCorpus, 'ui/edit.lua', target => target.name === 'menu.createFrame', 'unsupported options');
    const catalog = catalogFor(context);
    const operation = context.program.operations.find(item => item.kind === 'createText');
    assert.ok(operation);
    assert.deepEqual(discoverProperties(catalog, operation.id), [], `no property additions through ${options}`);
    assert.equal(addProperty(context.workspace, context.source, catalog, operation.id, 'halign', 'right').accepted, false);
    assert.equal(sourceTextAt(context, 'ui/edit.lua'), lua);
  }
  console.log('B119_MISSING_TEXT_PROPERTIES PASS: empty/omitted/commented options, minimal splice, scalar follow-up, duplicate/stale/copied/invalid refusal');
  runLocalInstanceDirectCaptionEdit(canonicalCorpus);
  if (process.env.X4_UI_SOURCE_LOCAL_INSTANCE_ONLY === '1') return;
  runMixedSampledCaptionEdit(canonicalCorpus);
  runSampledWrappingEdit(canonicalCorpus);
  if (process.env.X4_UI_SOURCE_LONG_TEXT_ONLY === '1') return;
  runStructuralPreviewContinuation(canonicalCorpus);
  if (process.env.X4_UI_SOURCE_PREVIEW_TRANSFER_ONLY === '1') return;
  const initial = contextFor();
  const initialCatalog = catalogFor(initial);
  const selectedFunction = selectedFunctionContextFor();
  const selectedFunctionCatalog = catalogFor(selectedFunction);
  const selectedFunctionFile = selectedFunction.source.bundle?.sourceFiles.find(file => file.path === 'ui/selected_function.lua');
  const selectedFunctionRegression = {
    modelCalls: selectedFunctionFile?.callModel.calls.length,
    programStatus: selectedFunction.program.status,
    programOperations: selectedFunction.program.operations.length,
    authorityCalls: selectedFunction.evidenceAuthority.calls.length,
    catalogStatus: selectedFunctionCatalog.status,
    catalogReason: selectedFunctionCatalog.reason,
    catalogDetail: selectedFunctionCatalog.detail,
    editableEntries: selectedFunctionCatalog.editableEntries.length,
  };
  console.log(`x4UiSourceEdits selected-function isolation: ${JSON.stringify(selectedFunctionRegression)}`);
  check('selected function operations ignore legitimate calls outside the target',
    selectedFunction.program.status === 'projected'
      && selectedFunctionCatalog.status === 'ready'
      && selectedFunctionCatalog.editableEntries.length > 0,
    JSON.stringify(selectedFunctionRegression));
  const exactPipelineNoCorpus = exactPipelineContextFor();
  const exactPipelineNoCorpusCatalog = catalogFor(exactPipelineNoCorpus);
  const exactPipelineNoCorpusRegression = {
    programStatus: exactPipelineNoCorpus.program.status,
    unresolvedOperations: exactPipelineNoCorpus.program.operations
      .filter(operation => operation.status !== 'applied')
      .map(operation => ({ kind: operation.kind, modelOrder: operation.modelOrder, status: operation.status })),
    catalogStatus: exactPipelineNoCorpusCatalog.status,
    catalogReason: exactPipelineNoCorpusCatalog.reason,
    catalogDetail: exactPipelineNoCorpusCatalog.detail,
    editableEntries: exactPipelineNoCorpusCatalog.editableEntries.length,
  };
  console.log(`x4UiSourceEdits B119 exact pipeline no-corpus negative: ${JSON.stringify(exactPipelineNoCorpusRegression)}`);
  check('B119 exact pipeline without canonical corpus remains operation-not-applied',
    exactPipelineNoCorpus.program.status === 'partial'
      && exactPipelineNoCorpusRegression.unresolvedOperations.length > 0
      && exactPipelineNoCorpusCatalog.status === 'locked'
      && exactPipelineNoCorpusCatalog.reason === 'operation-not-applied'
      && exactPipelineNoCorpusCatalog.editableEntries.length === 0,
    JSON.stringify(exactPipelineNoCorpusRegression));
  const exactPipeline = exactPipelineContextFor(canonicalCorpus);
  const exactPipelineCatalog = catalogFor(exactPipeline);
  const exactPipelineFile = exactPipeline.source.bundle?.sourceFiles.find(file => file.path === 'ui/pipeline_test.lua');
  const exactPipelineModel = exactPipelineFile === undefined
    ? undefined
    : normalizeX4UiSourceEditLayoutModel(exactPipelineFile.callModel);
  const canonicalMetadataMismatches = exactPipeline.program.operations
    .map(operation => {
      const call = exactPipelineModel?.calls.find(candidate => candidate.order === operation.modelOrder);
      const binding = exactPipeline.evidenceAuthority.sourceBindings.find(candidate => candidate.operationId === operation.id);
      const callMetadata = call === undefined ? undefined : {
        arguments: call.arguments,
        ...(call.receiver !== undefined ? { receiver: call.receiver } : {}),
        ...(call.result !== undefined ? { result: call.result } : {}),
        semantics: call.semantics,
      };
      const operationMetadata = asRecord(operation.metadata);
      const operationSemantics = asRecord(operationMetadata?.semantics);
      const omittedProperties = operationMetadata === undefined || operationSemantics === undefined
        ? undefined
        : {
          ...operationMetadata,
          semantics: Object.fromEntries(Object.entries(operationSemantics).filter(([key]) => key !== 'properties')),
        };
      const normalizedCallMetadata = callMetadata === undefined
        ? undefined
        : withoutSelftestCallModelNumericExpressions(callMetadata);
      const options = asRecord(asRecord(call?.semantics)?.options);
      const row = {
        modelOrder: operation.modelOrder,
        callName: call?.name,
        rawOptionsExpression: options?.expression,
        rawPropertyNames: call?.semantics.properties?.map(property => property.name),
        rawVsEnriched: callMetadata !== undefined && JSON.stringify(callMetadata) === JSON.stringify(operation.metadata),
        rawVsEnrichedAfterDerivedNormalization: normalizedCallMetadata !== undefined
          && JSON.stringify(normalizedCallMetadata) === JSON.stringify(operation.metadata),
        rawVsEnrichedAfterDerivedNormalizationWithoutHeaderProperties: normalizedCallMetadata !== undefined
          && omittedProperties !== undefined
          && JSON.stringify(normalizedCallMetadata) === JSON.stringify(omittedProperties),
        enrichedVsBinding: binding !== undefined && JSON.stringify(operation.metadata) === JSON.stringify(binding.metadata),
        enrichedPropertyNames: Array.isArray(operationSemantics?.properties)
          ? operationSemantics.properties.map(property => asRecord(property)?.name)
          : undefined,
      };
      return row.rawVsEnriched ? undefined : row;
    })
    .filter((row): row is NonNullable<typeof row> => row !== undefined);
  console.log(`x4UiSourceEdits B119 canonical metadata mismatch: ${JSON.stringify(canonicalMetadataMismatches)}`);
  const canonicalMetadataByOrder = new Map(canonicalMetadataMismatches.map(row => [row.modelOrder, row]));
  check('B119 canonical enrichment mismatch is limited to derived numeric expressions and header properties',
    canonicalMetadataMismatches.length === 4
      && canonicalMetadataByOrder.get(48)?.rawVsEnrichedAfterDerivedNormalization === true
      && canonicalMetadataByOrder.get(56)?.rawVsEnrichedAfterDerivedNormalization === true
      && canonicalMetadataByOrder.get(67)?.rawVsEnrichedAfterDerivedNormalization === false
      && canonicalMetadataByOrder.get(67)?.rawVsEnrichedAfterDerivedNormalizationWithoutHeaderProperties === true
      && canonicalMetadataByOrder.get(71)?.rawVsEnrichedAfterDerivedNormalization === false
      && canonicalMetadataByOrder.get(71)?.rawVsEnrichedAfterDerivedNormalizationWithoutHeaderProperties === true
      && canonicalMetadataByOrder.get(67)?.rawOptionsExpression === 'Helper.headerRowCenteredProperties'
      && canonicalMetadataByOrder.get(71)?.rawOptionsExpression === 'Helper.headerRowCenteredProperties'
      && canonicalMetadataMismatches.every(row => row.enrichedVsBinding === true),
    JSON.stringify(canonicalMetadataMismatches));
  const exactPipelineRegression = {
    sourceSha256: exactPipeline.program.target.sourceIdentity.sha256,
    expectedSourceSha256: 'C1D9CD8580C6175E95C543259A2AB19F8B463282BF48B2229EB6013D6052718E',
    target: {
      kind: exactPipeline.program.target.kind,
      name: exactPipeline.program.target.name,
    },
    modelCalls: exactPipelineFile?.callModel.calls.length,
    programOperations: exactPipeline.program.operations.length,
    programStatus: exactPipeline.program.status,
    allOperationsApplied: exactPipeline.program.operations.every(operation => operation.status === 'applied'),
    canonicalMetadataMismatches,
    authorityCalls: exactPipeline.evidenceAuthority.calls.length,
    authorityOperations: exactPipeline.evidenceAuthority.operations.length,
    authorityBindings: exactPipeline.evidenceAuthority.sourceBindings.length,
    authorityCallOrders: exactPipeline.evidenceAuthority.calls.map(call => call.modelOrder),
    authorityCallStreamIndexes: exactPipeline.evidenceAuthority.calls.map(call => call.streamIndex),
    authorityOperationStreamIndexes: exactPipeline.evidenceAuthority.operations.map(operation => operation.streamIndex),
    authorityBindingStreamIndexes: exactPipeline.evidenceAuthority.sourceBindings.map(binding => binding.streamIndex),
    catalogStatus: exactPipelineCatalog.status,
    catalogReason: exactPipelineCatalog.reason,
    catalogDetail: exactPipelineCatalog.detail,
    editableEntries: exactPipelineCatalog.editableEntries.length,
    lockedEntries: exactPipelineCatalog.lockedEntries.length,
    lockedReasons: exactPipelineCatalog.lockedEntries.map(entry => entry.reason),
  };
  console.log(`x4UiSourceEdits B119 exact pipeline regression: ${JSON.stringify(exactPipelineRegression)}`);
  check('B119 exact pipeline_test menu.createFrame source edit catalog is ready',
    exactPipelineRegression.sourceSha256 === exactPipelineRegression.expectedSourceSha256
      && exactPipelineRegression.target.kind === 'function'
      && exactPipelineRegression.target.name === 'menu.createFrame'
      && exactPipelineRegression.allOperationsApplied
      && exactPipelineCatalog.status === 'ready'
      && exactPipelineCatalog.reason === undefined
      && exactPipelineCatalog.editableEntries.length > 0
      && !exactPipelineCatalog.lockedEntries.some(entry => entry.reason === 'provenance-drift'),
    JSON.stringify(exactPipelineRegression));
  const spanContext = contextualImportContextFor(canonicalCorpus);
  const spanCatalog = catalogFor(spanContext);
  const spanEntries = (spanCatalog.insertEntries || []).filter(entry => entry.kind === 'insert-widget');
  const spanReceipt = {
    status: spanContext.program.status,
    cells: spanContext.program.cells.map(cell => ({ column: cell.column, status: cell.status,
      type: cell.kernelState?.type, span: cell.kernelState?.colspan,
      operations: cell.operationIds.map(id => spanContext.program.operations.find(operation => operation.id === id)?.kind),
      metadata: cell.metadataOperationIds.length })),
    issuedColumns: spanEntries.map(entry => entry.column),
  };
  console.log(`x4UiSourceEdits contextual span: ${JSON.stringify(spanReceipt)}`);
  check('B119 imported empty span start and cell3 are issued; covered cell2 is not',
    spanEntries.map(entry => entry.column).join(',') === '1,3', JSON.stringify(spanReceipt));
  for (const widget of ['text', 'button', 'input'] as const) {
    const spanEntry = spanEntries.find(entry => entry.column === 1)!;
    const spanResult = acceptedWidget(applyX4UiSourceWidgetInsertion(spanContext.workspace, spanContext.source,
      spanCatalog, { entry: spanEntry, widget, text: `spanning ${widget}` }));
    const after = sessionContextFor(spanResult.workspace, canonicalCorpus, contextualImportPath,
      target => target.kind === 'function' && target.name === 'menu.createFrame', 'inserted span');
    check(`B119 unindented imported ${widget} preserves span and covered cell`,
      spanEntry.indentation === '' && spanResult.replacement.startsWith('row[1]:')
        && after.program.cells[0].kernelState?.colspan === 2
        && after.program.cells[1].kernelState?.colspan === 0
        && (spanResult.catalog.insertEntries || []).some(entry => entry.kind === 'insert-widget' && entry.column === 3)
        && !(spanResult.catalog.insertEntries || []).some(entry => entry.kind === 'insert-widget' && entry.column === 2));
  }
  const mutationCases = [
    ['unknown invocation', 'mutate(row)'],
    ['local invocation', 'local function mutate(value) value[2] = {} end\nmutate(row)'],
    ['row rebind', 'row = {}'],
    ['numeric cell write', 'row[2] = {}'],
    ['multi-LHS cell write', 'row[2], other = {}, nil'],
    ['spaced commented cell write', 'row --[=[ gap ]=]\n [ 2 ] -- gap\n = {}'],
    ['computed cell write', 'local column = 2\nrow[column] = {}'],
    ['computed multi-LHS', 'row[1 + 1], other = {}, nil'],
    ['string indexed cell write', 'row["2"] = {}'],
    ['long literal indexed write', 'row[ [=[2]=] ] = {}'],
    ['row local shadow', 'local row = {}'],
    ['alias escape', 'local escaped = row'],
    ['property escape', 'menu.escaped = row'],
    ['nested escape', 'menu.escaped = { row }'],
    ['conditional mutation', 'if condition then row[2] = {} end'],
    ['loop mutation', 'for i = 1, 2 do row[i] = {} end'],
    ['unresolved cell method', 'row[2]:unknownMethod()'],
  ] as const;
  const mutationReceipts = mutationCases.map(([name, statement]) => {
    const context = contextualImportContextFor(canonicalCorpus,
      contextualImportLua.replace('row[1]:setColSpan(2); -- retained span', statement));
    const catalog = catalogFor(context);
    return { name, status: context.program.status,
      issued: (catalog.insertEntries || []).filter(entry => entry.kind === 'insert-widget').length,
      unapplied: context.program.operations.filter(operation => operation.status !== 'applied').map(operation => operation.kind) };
  });
  console.log(`x4UiSourceEdits contextual mutation negatives: ${JSON.stringify(mutationReceipts)}`);
  check('B119 contextual mutation/escape source revokes empty-cell authority',
    mutationReceipts.every(receipt => receipt.issued === 0),
    JSON.stringify(mutationReceipts.filter(receipt => receipt.issued !== 0)));
  const formattingCases = [
    ['spaced receiver', 'row [ 1 ]:setColSpan(2)'],
    ['commented receiver', 'row --[=[ index ]=]\n [ 1 ]:setColSpan(2)'],
    ['inert escaped string', String.raw`local inert = "row[2], other = {}, nil; \"quoted\" \\slash"`],
    ['inert long string', 'local inert = [==[row = {}; row[2], other = {}, nil; mutate(row)]==]'],
    ['inert comments', '-- row = {}; mutate(row)\n--[==[ row[2], other = {}, nil ]==]'],
  ] as const;
  const formattingReceipts = formattingCases.map(([name, statement]) => {
    const context = contextualImportContextFor(canonicalCorpus,
      contextualImportLua.replace('row[1]:setColSpan(2); -- retained span', statement));
    const catalog = catalogFor(context);
    const entries = (catalog.insertEntries || []).filter(entry => entry.kind === 'insert-widget');
    const entry = entries.find(candidate => candidate.column === 1);
    const result = entry ? applyX4UiSourceWidgetInsertion(context.workspace, context.source, catalog,
      { entry, widget: 'text', text: 'formatted import' }) : undefined;
    return { name, status: context.program.status, issuedColumns: entries.map(candidate => candidate.column),
      accepted: result?.accepted, reason: result?.accepted === false ? result.reason : undefined };
  });
  console.log(`x4UiSourceEdits contextual formatting controls: ${JSON.stringify(formattingReceipts)}`);
  check('B119 parsed receiver formatting and inert source text preserve insertion authority',
    formattingReceipts.every(receipt => receipt.accepted === true),
    JSON.stringify(formattingReceipts.filter(receipt => receipt.accepted !== true)));
  const ownerSourceCases = [
    ['table rebind', contextualImportLua.replace('local row =', 'ftable = {}\nlocal row =')],
    ['rebound table alias', contextualImportLua.replace('local row = ftable:', 'local alias = ftable\nalias = {}\nlocal row = alias:')],
    ['row via alias', contextualImportLua.replace('local row = ftable:addRow(false, {})', 'local original = ftable:addRow(false, {})\nlocal row = original')],
    ['conditional row', contextualImportLua.replace('local row =', 'if condition then\nlocal row =').replace('frame:display()', 'end\nframe:display()')],
    ['loop row', contextualImportLua.replace('local row =', 'for i = 1, 2 do\nlocal row =').replace('frame:display()', 'end\nframe:display()')],
    ['frame rebind', contextualImportLua.replace('frame:display()', 'frame = {}\nframe:display()')],
  ] as const;
  const ownerSourceReceipts = ownerSourceCases.map(([name, lua]) => {
    const context = contextualImportContextFor(canonicalCorpus, lua.replace('row[1]:setColSpan(2); -- retained span', '-- no span call'));
    const catalog = catalogFor(context);
    return { name, status: context.program.status,
      issued: (catalog.insertEntries || []).filter(entry => entry.kind === 'insert-widget').length };
  });
  console.log(`x4UiSourceEdits contextual owner negatives: ${JSON.stringify(ownerSourceReceipts)}`);
  check('B119 unproven rebound aliased and control-flow row owners issue no insertion',
    ownerSourceReceipts.every(receipt => receipt.issued === 0), JSON.stringify(ownerSourceReceipts));
  const provenAlias = contextualImportContextFor(canonicalCorpus,
    contextualImportLua.replace('local row = ftable:', 'local alias = ftable\nlocal row = alias:'));
  const provenAliasCatalog = catalogFor(provenAlias);
  const provenAliasEntry = contextualWidgetEntryFor(provenAliasCatalog, 1);
  const provenAliasResult = acceptedWidget(applyX4UiSourceWidgetInsertion(provenAlias.workspace, provenAlias.source,
    provenAliasCatalog, { entry: provenAliasEntry, widget: 'text', text: 'source-proven alias' }));
  check('B119 a source-proven table alias retains exact widget placement authority',
    provenAliasResult.insertedWidget.tableId === provenAlias.program.tables[0].id
      && provenAliasResult.insertedWidget.rowId === provenAlias.program.rows[0].id
      && provenAliasResult.insertedWidget.cellId === provenAliasEntry.cellId);
  const preambleContext = contextualImportContextFor(canonicalCorpus,
    contextualImportLua.replace('local frame =', 'refreshHelper()\nif not Helper then return end\nlocal frame ='));
  const preambleCatalog = catalogFor(preambleContext);
  check('B119 unrelated unsupported preamble before row creation does not revoke proven row authority',
    applyX4UiSourceWidgetInsertion(preambleContext.workspace, preambleContext.source, preambleCatalog,
      { entry: contextualWidgetEntryFor(preambleCatalog, 1), widget: 'input', text: 'preamble control' }).accepted);

  const boundaryEntry = contextualWidgetEntryFor(spanCatalog, 1);
  const boundaryRequest: X4UiSourceEditWidgetInsertionRequest = { entry: boundaryEntry, widget: 'text', text: 'boundary' };
  const boundaryBefore = JSON.stringify(spanContext.workspace);
  const invalidRequests: readonly unknown[] = [null, {}, { ...boundaryRequest, widget: 'slider' },
    { ...boundaryRequest, text: 1 }, { ...boundaryRequest, text: () => 'executable' },
    { ...boundaryRequest, directCall: 'mutate(row)' }, { ...boundaryRequest, receiver: 'foreign[1]' },
    { ...boundaryRequest, expected: { path: boundaryEntry.path } },
    Object.assign(Object.create({ inherited: true }), boundaryRequest)];
  const invalidResults = invalidRequests.map(request => {
    const result: ReturnType<typeof applyX4UiSourceWidgetInsertion> = Reflect.apply(applyX4UiSourceWidgetInsertion,
      undefined, [spanContext.workspace, spanContext.source, spanCatalog, request]);
    return result.accepted === false && !result.changed && result.reason === 'invalid-request';
  });
  check('B119 typed insertion rejects raw executable fields and invalid request data atomically',
    invalidResults.every(Boolean) && JSON.stringify(spanContext.workspace) === boundaryBefore,
    JSON.stringify(invalidResults));

  const getterReceipts = ['request', 'expected', 'entry', 'catalog', 'source', 'workspace', 'workspace-file'].map(surface => {
    const context = contextualImportContextFor(canonicalCorpus);
    let catalog = catalogFor(context);
    let source = context.source;
    let request: X4UiSourceEditWidgetInsertionRequest = {
      entry: contextualWidgetEntryFor(catalog, 1), widget: 'text', text: 'getter boundary',
    };
    let reads = 0;
    const descriptor = { configurable: true, enumerable: true, get: () => { reads += 1; throw new Error('getter executed'); } };
    if (surface === 'request') request = Object.defineProperty({ ...request }, 'text', descriptor);
    if (surface === 'expected') request = { ...request, expected: Object.defineProperty({
      path: request.entry.path, startOffset: request.entry.startOffset, endOffset: request.entry.endOffset, expectedText: '',
    }, 'expectedText', descriptor) };
    if (surface === 'entry') request = { ...request, entry: Object.defineProperty({ ...request.entry }, 'provenance', descriptor) };
    if (surface === 'catalog') catalog = Object.defineProperty({ ...catalog }, 'insertEntries', descriptor);
    if (surface === 'source') source = Object.defineProperty({ ...source }, 'bundle', descriptor);
    if (surface === 'workspace') Object.defineProperty(context.workspace, 'passthroughFiles', descriptor);
    if (surface === 'workspace-file') Object.defineProperty(context.workspace.passthroughFiles![2], 'content', descriptor);
    const outcome = invokePublic(() => applyX4UiSourceWidgetInsertion(context.workspace, source, catalog, request));
    return { surface, reads, threw: outcome.threw, accepted: outcome.value?.accepted,
      changed: outcome.value?.changed, reason: outcome.value?.accepted === false ? outcome.value.reason : undefined };
  });
  console.log(`x4UiSourceEdits contextual accessor negatives: ${JSON.stringify(getterReceipts)}`);
  check('B119 typed insertion refuses accessor boundaries without executing getters or throwing',
    getterReceipts.every(receipt => receipt.reads === 0 && !receipt.threw && receipt.accepted === false && receipt.changed === false),
    JSON.stringify(getterReceipts));

  const contextualForeign = contextualImportContextFor(canonicalCorpus);
  const contextualForeignCatalog = catalogFor(contextualForeign);
  const authorityCases = [
    ['cloned entry', spanContext.workspace, spanContext.source, spanCatalog, { ...boundaryRequest, entry: structuredClone(boundaryEntry) }],
    ['foreign entry', spanContext.workspace, spanContext.source, spanCatalog, { ...boundaryRequest, entry: contextualWidgetEntryFor(contextualForeignCatalog, 1) }],
    ['cloned catalog', spanContext.workspace, spanContext.source, structuredClone(spanCatalog), boundaryRequest],
    ['foreign catalog', spanContext.workspace, spanContext.source, contextualForeignCatalog, boundaryRequest],
    ['cloned source', spanContext.workspace, structuredClone(spanContext.source), spanCatalog, boundaryRequest],
    ['cloned workspace', structuredClone(spanContext.workspace), spanContext.source, spanCatalog, boundaryRequest],
  ] as const;
  const authorityReceipts = authorityCases.map(([name, currentWorkspace, source, catalog, request]) => {
    const result = applyX4UiSourceWidgetInsertion(currentWorkspace, source, catalog, request);
    return { name, accepted: result.accepted, changed: result.changed, reason: result.accepted === false ? result.reason : undefined };
  });
  check('B119 typed insertion refuses cloned and foreign authority',
    authorityReceipts.every(receipt => !receipt.accepted && !receipt.changed)
      && JSON.stringify(spanContext.workspace) === boundaryBefore, JSON.stringify(authorityReceipts));
  const forgedPlacementResults = [
    { ...boundaryEntry, column: 2, cellId: spanContext.program.cells[1].id },
    { ...boundaryEntry, rowId: 'foreign-row' },
    { ...boundaryEntry, tableId: 'foreign-table' },
    { ...boundaryEntry, frameId: 'foreign-frame' },
  ].map(entry => applyX4UiSourceWidgetInsertion(spanContext.workspace, spanContext.source, spanCatalog,
    { ...boundaryRequest, entry }));
  check('B119 covered cells and forged placement never gain authority from caller coordinates or owner IDs',
    forgedPlacementResults.every(result => result.accepted === false && !result.changed && result.reason === 'foreign-entry'));
  const expected = { path: boundaryEntry.path, startOffset: boundaryEntry.startOffset,
    endOffset: boundaryEntry.endOffset, expectedText: '' };
  const casReceipts = [
    { ...expected, path: 'ui/foreign.lua' }, { ...expected, startOffset: expected.startOffset - 1 },
    { ...expected, endOffset: expected.endOffset + 1 }, { ...expected, expectedText: 'stale' },
  ].map(expectedValue => {
    const result = applyX4UiSourceWidgetInsertion(spanContext.workspace, spanContext.source, spanCatalog,
      { ...boundaryRequest, expected: expectedValue });
    return { accepted: result.accepted, changed: result.changed, reason: result.accepted === false ? result.reason : undefined };
  });
  check('B119 typed insertion enforces every caller CAS field and preserves failed input bytes',
    casReceipts.every(receipt => !receipt.accepted && !receipt.changed)
      && casReceipts.map(receipt => receipt.reason).join(',') === 'stale-range,stale-range,stale-range,stale-expected-text'
      && JSON.stringify(spanContext.workspace) === boundaryBefore, JSON.stringify(casReceipts));
  const contextualStale = contextualImportContextFor(canonicalCorpus);
  const contextualStaleCatalog = catalogFor(contextualStale);
  contextualStale.workspace.passthroughFiles![2].content += '-- external change\n';
  const contextualStaleBefore = JSON.stringify(contextualStale.workspace);
  const contextualStaleResult = applyX4UiSourceWidgetInsertion(contextualStale.workspace, contextualStale.source, contextualStaleCatalog,
    { entry: contextualWidgetEntryFor(contextualStaleCatalog, 1), widget: 'button', text: 'stale source' });
  check('B119 typed insertion refuses post-issuance workspace mutation without overwriting current bytes',
    contextualStaleResult.accepted === false && !contextualStaleResult.changed && contextualStaleResult.reason === 'workspace-source-mismatch'
      && JSON.stringify(contextualStale.workspace) === contextualStaleBefore);
  const noCorpusContext = contextualImportContextFor(undefined);
  const noCorpusCatalog = catalogFor(noCorpusContext);
  const noCorpusBefore = JSON.stringify(noCorpusContext.workspace);
  const noCorpusResult = applyX4UiSourceWidgetInsertion(noCorpusContext.workspace, noCorpusContext.source, noCorpusCatalog,
    { entry: contextualWidgetEntryFor(noCorpusCatalog, 1), widget: 'text', text: 'requires canonical automatic height' });
  const noCorpusReceipt = { accepted: noCorpusResult.accepted, changed: noCorpusResult.changed,
    reason: noCorpusResult.accepted === false ? noCorpusResult.reason : undefined,
    detail: noCorpusResult.accepted === false ? noCorpusResult.detail : undefined };
  console.log(`x4UiSourceEdits contextual failed reparse: ${JSON.stringify(noCorpusReceipt)}`);
  check('B119 failed automatic-height reparse returns unchanged original workspace',
    noCorpusResult.accepted === false && !noCorpusResult.changed && noCorpusResult.reason === 'reparse-provenance-drift'
      && noCorpusResult.workspace === noCorpusContext.workspace && noCorpusResult.source === noCorpusContext.source
      && JSON.stringify(noCorpusContext.workspace) === noCorpusBefore, JSON.stringify(noCorpusReceipt));
  const contextualByteLua = '\uFEFF' + contextualImportLua.replace('frame:display()', [
    'local sibling = ftable:addRow(false, {})',
    'sibling[1]:setColSpan(3)',
    'sibling[1]:createText("Retained sibling")',
    '-- insertion anchor comment; row[2], other = {}, nil',
    'frame:display()',
  ].join('\n')).replaceAll('\n', '\r\n');
  const contextualBytes = contextualImportContextFor(canonicalCorpus, contextualByteLua);
  const contextualByteCatalog = catalogFor(contextualBytes);
  const contextualByteEntry = contextualWidgetEntryFor(contextualByteCatalog, 1);
  const contextualByteBefore = JSON.stringify(contextualBytes.workspace);
  const contextualByteSourceBefore = JSON.stringify(contextualBytes.source);
  const contextualBomText = acceptedWidget(applyX4UiSourceWidgetInsertion(contextualBytes.workspace, contextualBytes.source,
    contextualByteCatalog, { entry: contextualByteEntry, widget: 'text', text: 'BOM text "quoted" \\slash\n-- inert' }));
  check('B119 BOM CRLF Text insertion preserves the exact raw splice and original bytes',
    sourceTextAt(contextualBomText, contextualImportPath) === contextualByteLua.slice(0, contextualBomText.startOffset)
      + contextualBomText.replacement + contextualByteLua.slice(contextualBomText.endOffset)
      && contextualBomText.replacement.endsWith('\r\n')
      && JSON.stringify(contextualBytes.workspace) === contextualByteBefore
      && JSON.stringify(contextualBytes.source) === contextualByteSourceBefore);
  const contextualButtonText = '"quoted" \\slash\n-- row[2] = {}; [==[literal]==]';
  const contextualFirst = acceptedWidget(applyX4UiSourceWidgetInsertion(contextualBytes.workspace, contextualBytes.source,
    contextualByteCatalog, { entry: contextualByteEntry, widget: 'button', text: contextualButtonText,
      expected: { path: contextualByteEntry.path, startOffset: contextualByteEntry.startOffset,
        endOffset: contextualByteEntry.endOffset, expectedText: '' } }));
  const contextualFirstText = sourceTextAt(contextualFirst, contextualImportPath);
  const contextualAfter = sessionContextFor(contextualFirst.workspace, canonicalCorpus, contextualImportPath,
    target => target.kind === 'function' && target.name === 'menu.createFrame', 'byte-local insertion');
  const contextualSecondEntry = contextualWidgetEntryFor(contextualFirst.catalog, 3);
  const contextualInputProbeLua = contextualFirstText.slice(0, contextualSecondEntry.startOffset)
    + 'row[3]:createEditBox({ defaultText = "second current insertion" })\r\n'
    + contextualFirstText.slice(contextualSecondEntry.endOffset);
  const contextualBomProducerReceipt = [true, false].map(bom => {
    const context = contextualImportContextFor(canonicalCorpus, bom ? contextualInputProbeLua : contextualInputProbeLua.slice(1));
    return { bom, input: context.program.operations.filter(operation => operation.kind === 'createEditBox')
      .map(operation => ({ status: operation.status, reason: operation.reason })) };
  });
  console.log('x4UiSourceEdits contextual Input BOM prerequisite:', JSON.stringify(contextualBomProducerReceipt));
  const contextualBomInput = applyX4UiSourceWidgetInsertion(contextualFirst.workspace, contextualFirst.source,
    contextualFirst.catalog, { entry: contextualSecondEntry, widget: 'input', text: 'second current insertion' });
  check('B119 BOM CRLF Input insertion accepts fresh catalog authority with exact producer evidence',
    contextualBomProducerReceipt.every(receipt => receipt.input.length === 1 && receipt.input[0].status === 'applied')
      && contextualBomInput.accepted && contextualBomInput.changed,
    JSON.stringify({ producer: contextualBomProducerReceipt, accepted: contextualBomInput.accepted,
      changed: contextualBomInput.changed, reason: contextualBomInput.accepted === false ? contextualBomInput.reason : undefined }));
  const contextualSecond = acceptedWidget(contextualBomInput);
  const contextualSecondText = sourceTextAt(contextualSecond, contextualImportPath);
  const contextualInputAfter = sessionContextFor(contextualSecond.workspace, canonicalCorpus, contextualImportPath,
    target => target.kind === 'function' && target.name === 'menu.createFrame', 'BOM Input after insertion');
  const contextualInputCreator = contextualInputAfter.program.operations.find(operation =>
    operation.id === contextualSecond.insertedWidget.creatorOperationId);
  const contextualInputCall = contextualSecond.source.bundle?.sourceFiles.find(file => file.path === contextualImportPath)
    ?.callModel.calls.find(call => call.order === contextualInputCreator?.modelOrder);
  check('B119 BOM Input returns the exact reparsed creator owner chain, decoded text and explicit starter height',
    contextualInputCreator?.status === 'applied' && contextualInputCreator.kind === 'createEditBox'
      && contextualInputCreator.cellId === contextualSecondEntry.cellId
      && contextualInputCreator.rowId === contextualSecondEntry.rowId
      && contextualInputCreator.tableId === contextualSecondEntry.tableId
      && contextualInputAfter.program.tables.find(table => table.id === contextualInputCreator.tableId)?.frameId
        === contextualSecond.insertedWidget.frameId
      && contextualInputCall?.semantics.editBox?.defaultText?.value === 'second current insertion'
      && contextualInputCall?.semantics.properties?.find(property => property.normalizedName === 'height')?.value.value === 25
      && JSON.stringify(contextualInputCreator.source) === JSON.stringify(contextualSecond.insertedWidget.creatorSource)
      && JSON.stringify(contextualInputAfter.program.target.sourceIdentity) === JSON.stringify(contextualSecond.insertedWidget.sourceIdentity));
  const contextualConsumed = applyX4UiSourceWidgetInsertion(contextualFirst.workspace, contextualFirst.source,
    contextualFirst.catalog, { entry: contextualByteEntry, widget: 'text', text: 'consumed' });
  const contextualOccupied = applyX4UiSourceWidgetInsertion(contextualFirst.workspace, contextualFirst.source,
    contextualFirst.catalog, { entry: { ...contextualSecondEntry, column: 1, cellId: contextualFirst.insertedWidget.cellId },
      widget: 'text', text: 'occupied' });
  const contextualOldCatalog = applyX4UiSourceWidgetInsertion(contextualFirst.workspace, contextualFirst.source,
    contextualByteCatalog, { entry: contextualByteEntry, widget: 'text', text: 'stale catalog' });
  check('B119 typed insertion preserves BOM CRLF comments semicolons trailing and immutable source bytes',
    contextualByteEntry.lineEnding === '\r\n' && contextualFirstText.startsWith('\uFEFF')
      && !/(^|[^\r])\n/.test(contextualFirstText)
      && contextualFirstText === contextualByteLua.slice(0, contextualFirst.startOffset) + contextualFirst.replacement
        + contextualByteLua.slice(contextualFirst.endOffset)
      && contextualSecondText === contextualFirstText.slice(0, contextualSecond.startOffset) + contextualSecond.replacement
        + contextualFirstText.slice(contextualSecond.endOffset)
      && JSON.stringify(contextualBytes.workspace) === contextualByteBefore
      && JSON.stringify(contextualBytes.source) === contextualByteSourceBefore
      && contextualBytes.workspace.passthroughFiles!.filter(file => file.path !== contextualImportPath).every(file =>
        JSON.stringify(contextualSecond.workspace.passthroughFiles!.find(after => after.path === file.path)) === JSON.stringify(file))
      && contextualFirst.workspace !== contextualBytes.workspace && contextualFirst.source !== contextualBytes.source
      && contextualFirst.catalog !== contextualByteCatalog && Object.isFrozen(contextualFirst.insertedWidget));
  check('B119 sequential insertion uses the fresh catalog and rejects consumed or old authority',
    contextualSecondEntry.rowId === contextualByteEntry.rowId && contextualSecondEntry.cellId !== contextualByteEntry.cellId
      && contextualSecond.insertedWidget.cellId === contextualSecondEntry.cellId
      && contextualSecond.insertedWidget.creatorOperationId !== contextualFirst.insertedWidget.creatorOperationId
      && contextualSecond.catalog !== contextualFirst.catalog
      && !(contextualSecond.catalog.insertEntries || []).some(entry => entry.kind === 'insert-widget')
      && contextualConsumed.accepted === false && !contextualConsumed.changed && contextualConsumed.reason === 'foreign-entry'
      && contextualOccupied.accepted === false && !contextualOccupied.changed && contextualOccupied.reason === 'foreign-entry'
      && contextualOldCatalog.accepted === false && !contextualOldCatalog.changed
      && JSON.stringify(contextualBytes.workspace) === contextualByteBefore);
  const contextualNoBom = contextualImportContextFor(canonicalCorpus, contextualByteLua.slice(1));
  const contextualNoBomCatalog = catalogFor(contextualNoBom);
  const contextualNoBomFirst = acceptedWidget(applyX4UiSourceWidgetInsertion(contextualNoBom.workspace, contextualNoBom.source,
    contextualNoBomCatalog, { entry: contextualWidgetEntryFor(contextualNoBomCatalog, 1), widget: 'text', text: 'first current' }));
  const contextualNoBomNext = contextualWidgetEntryFor(contextualNoBomFirst.catalog, 3);
  const contextualNoBomSecond = acceptedWidget(applyX4UiSourceWidgetInsertion(contextualNoBomFirst.workspace, contextualNoBomFirst.source,
    contextualNoBomFirst.catalog, { entry: contextualNoBomNext, widget: 'input', text: 'second current insertion' }));
  check('B119 Input sequential insertion consumes fresh CRLF imported authority',
    contextualNoBomSecond.insertedWidget.cellId === contextualNoBomNext.cellId
      && contextualNoBomSecond.replacement.endsWith('\r\n')
      && !(contextualNoBomSecond.catalog.insertEntries || []).some(entry => entry.kind === 'insert-widget'));

  const contextualBeforeFile = contextualBytes.source.bundle!.sourceFiles.find(file => file.path === contextualImportPath)!;
  const contextualAfterFile = contextualFirst.source.bundle!.sourceFiles.find(file => file.path === contextualImportPath)!;
  const contextualCallIndexes = contextualAfterFile.callModel.calls.map((call, index) => ({ call, index }))
    .filter(({ call }) => call.source.start.offset >= contextualFirst.startOffset
      && call.source.end.offset <= contextualFirst.startOffset + contextualFirst.replacement.length).map(({ index }) => index);
  const contextualOperationIndexes = contextualAfter.program.operations.map((operation, index) => ({ operation, index }))
    .filter(({ operation }) => operation.source.start.offset >= contextualFirst.startOffset
      && operation.source.end.offset <= contextualFirst.startOffset + contextualFirst.replacement.length).map(({ index }) => index);
  const contextualLedger: Parameters<typeof compareX4UiSourceStructuralLedgerCorrespondence>[0] = {
    beforeCalls: contextualBeforeFile.callModel.calls, afterCalls: contextualAfterFile.callModel.calls,
    beforeRecords: contextualBeforeFile.callModel.records, afterRecords: contextualAfterFile.callModel.records,
    beforeOperations: contextualBytes.program.operations, afterOperations: contextualAfter.program.operations,
    entry: contextualByteEntry, beforeText: contextualByteLua, afterText: contextualFirstText,
    replacementLength: contextualFirst.replacement.length, insertedCallIndex: -1, insertedOperationIndex: -1,
    replacementCallIndexes: contextualCallIndexes,
    replacementCallNames: contextualCallIndexes.map(index => contextualAfterFile.callModel.calls[index].name),
    replacementCallOrders: contextualCallIndexes.map(index => contextualAfterFile.callModel.calls[index].order),
    replacementOperationIndexes: contextualOperationIndexes,
    replacementOperationKinds: contextualOperationIndexes.map(index => contextualAfter.program.operations[index].kind),
    replacementOperationIds: contextualOperationIndexes.map(index => contextualAfter.program.operations[index].id),
    replacementOperationModelOrders: contextualOperationIndexes.map(index => contextualAfter.program.operations[index].modelOrder),
  };
  type ContextualLedgerInput = typeof contextualLedger;
  const contextualLedgerMutations: readonly [string, (input: ContextualLedgerInput) => void][] = [
    ['retained call receiver', input => { asRecord(input.afterCalls[0])!.receiver = { expression: 'foreign' }; }],
    ['retained record value', input => { asRecord(input.afterRecords[0])!.unexpected = 'foreign'; }],
    ['retained operation source range', input => {
      const source = asRecord(asRecord(input.afterOperations[0])!.source)!;
      asRecord(source.start)!.offset = 1;
    }],
    ['retained span owner', input => {
      asRecord(input.afterOperations.find(operation => asRecord(operation)?.kind === 'setColSpan'))!.cellId = 'foreign-cell';
    }],
    ['retained kernel width', input => {
      const kernel = asRecord(asRecord(input.afterOperations.find(operation => asRecord(operation)?.kind === 'addRow'))!.kernel)!;
      const properties = asRecord(asRecord(kernel.stateAfter)!.properties)!;
      properties.width = Number(properties.width) + 1;
    }],
    ['inserted button continuation owner', input => {
      asRecord(input.afterOperations[contextualOperationIndexes[1]])!.cellId = 'foreign-cell';
    }],
    ['inserted creator table', input => {
      asRecord(input.afterOperations[contextualOperationIndexes[0]])!.tableId = 'foreign-table';
    }],
    ['inserted continuation unresolved', input => {
      asRecord(input.afterOperations[contextualOperationIndexes[1]])!.status = 'unresolved';
    }],
    ['inserted continuation model order', input => {
      asRecord(input.afterOperations[contextualOperationIndexes[1]])!.modelOrder = 0;
    }],
    ['missing retained record', input => {
      asRecord(input)!.afterRecords = input.afterRecords.slice(1);
    }],
    ['missing atomic continuation', input => {
      asRecord(input)!.afterOperations = input.afterOperations.filter((_, index) => index !== contextualOperationIndexes[1]);
    }],
    ['inserted creator range', input => {
      const source = asRecord(asRecord(input.afterCalls[contextualCallIndexes[0]])!.source)!;
      asRecord(source.end)!.offset = contextualFirst.startOffset;
    }],
    ['retained sibling operation', input => {
      asRecord(input.afterOperations.find(operation => asRecord(operation)?.kind === 'createText'))!.rowId = 'foreign-row';
    }],
  ];
  const contextualLedgerReceipts = contextualLedgerMutations.map(([name, mutate]) => {
    const input = structuredClone(contextualLedger);
    const before = JSON.stringify(input);
    mutate(input);
    return { name, changed: JSON.stringify(input) !== before, accepted: compareX4UiSourceStructuralLedgerCorrespondence(input) };
  });
  console.log(`x4UiSourceEdits contextual ledger negatives: ${JSON.stringify(contextualLedgerReceipts)}`);
  check('B119 insert-widget correspondence retains exact records sources owners and unaffected kernel state',
    compareX4UiSourceStructuralLedgerCorrespondence(contextualLedger)
      && contextualCallIndexes.length === 2 && contextualOperationIndexes.length === 2
      && contextualAfterFile.callModel.calls[contextualCallIndexes[1]].semantics.text?.value === contextualButtonText
      && contextualLedgerReceipts.every(receipt => receipt.changed && !receipt.accepted), JSON.stringify(contextualLedgerReceipts));
  const contextualProducer = createdMenuSessionContextFor(canonicalCorpus);
  const contextualProducerCatalog = catalogFor(contextualProducer);
  const rowProducerEntries = (contextualProducerCatalog.insertEntries || [])
    .filter(entry => entry.kind === 'insert-row');
  check('B119 Add row New-menu producer issues one row-below action', rowProducerEntries.length === 1,
    JSON.stringify({ status: contextualProducer.program.status,
      rowCount: contextualProducer.program.rows.length,
      insertKinds: contextualProducerCatalog.insertEntries?.map(entry => entry.kind) }));
  const rowProducerResult = applyX4UiSourceRowInsertion(contextualProducer.workspace, contextualProducer.source,
    contextualProducerCatalog, { entry: rowProducerEntries[0] });
  check('B119 Add row New-menu producer accepts a new local row', rowProducerResult.accepted,
    JSON.stringify({ accepted: rowProducerResult.accepted, changed: rowProducerResult.changed,
      reason: rowProducerResult.accepted === false ? rowProducerResult.reason : undefined,
      detail: rowProducerResult.accepted === false ? rowProducerResult.detail : undefined }));
  if (rowProducerResult.accepted === false) throw new Error('New-menu row insertion refused');
  const emptyChainContext = sessionContextFor(rowProducerResult.workspace, canonicalCorpus, rowProducerResult.path,
    target => target.kind === 'function' && target.name === 'menu.createFrame', 'B119 consecutive empty-row boundary');
  const emptyChainRowEntries = (rowProducerResult.catalog.insertEntries || []).filter(entry => entry.kind === 'insert-row');
  console.log(`x4UiSourceEdits B119 consecutive empty-row boundary: ${JSON.stringify({
    insertRows: emptyChainRowEntries.map(entry => ({ rowIndex: entry.rowIndex, rowId: entry.rowId, tableId: entry.tableId })),
    moveRows: (rowProducerResult.catalog.moveEntries || []).map(entry => entry.kind === 'move-row'
      ? { direction: entry.direction, rowIndex: entry.rowIndex, rowId: entry.rowId, adjacentRowId: entry.adjacentRowId } : undefined),
    rows: emptyChainContext.program.rows.map(row => ({ rowIndex: row.rowIndex, rowId: row.id, cellIds: row.cellIds.length,
      cellTypes: row.cellIds.map(cellId => emptyChainContext.program.cells.find(cell => cell.id === cellId)?.kernelState?.type) })),
    operations: emptyChainContext.program.operations.map(operation => ({ kind: operation.kind, rowId: operation.rowId,
      status: operation.status, tableId: operation.tableId })),
  })}`);
  const emptyRowsLua = '\uFEFF' + contextualImportLua.replace([
    'local row = ftable:addRow(false, {})',
    'row[1]:setColSpan(2); -- retained span',
    'frame:display(); -- retained display',
  ].join('\n'), [
    'local first = ftable:addRow(false, {});',
    '-- first empty row',
    'local second = ftable:addRow(false, {});',
    '-- second empty row',
    'frame:display();',
  ].join('\n')).replaceAll('\n', '\r\n');
  const emptyRowContext = contextualImportContextFor(canonicalCorpus, emptyRowsLua);
  const emptyRowCatalog = catalogFor(emptyRowContext);
  const emptyMoveEntry = rowMoveEntryFor(emptyRowCatalog, 'down', 1);
  const emptyMoveBeforeText = sourceTextAt(emptyRowContext, emptyMoveEntry.path);
  const emptyMoveResult = applyX4UiSourceRowMove(emptyRowContext.workspace, emptyRowContext.source,
    emptyRowCatalog, { entry: emptyMoveEntry });
  const emptyMoveInverseEntry = emptyMoveResult.accepted
    ? (emptyMoveResult.catalog.moveEntries || []).find(entry => entry.kind === 'move-row'
      && entry.direction === 'up' && entry.rowIndex === 2 && entry.rowId === emptyMoveResult.movedRow.rowId)
    : undefined;
  const emptyMoveInverse = emptyMoveInverseEntry
    ? applyX4UiSourceRowMove(emptyMoveResult.workspace, emptyMoveResult.source, emptyMoveResult.catalog,
      { entry: emptyMoveInverseEntry })
    : undefined;
  const emptyMoveBeforeContext = emptyRowContext;
  const emptyMoveAfterContext = emptyMoveResult.accepted
    ? sessionContextFor(emptyMoveResult.workspace, canonicalCorpus, emptyMoveEntry.path,
      target => target.kind === 'function' && target.name === 'menu.createFrame', 'B119 empty-row move after')
    : undefined;
  const emptyRowsAreKernelOnly = (context: SourceEditFixtureContext | undefined): boolean => {
    if (!context) return false;
    const rows = context.program.rows.filter(row => row.tableId === emptyMoveEntry.tableId
      && (row.rowIndex === emptyMoveEntry.rowIndex || row.rowIndex === emptyMoveEntry.rowIndex + 1));
    const rowIds = new Set(rows.map(row => row.id));
    return rows.length === 2
      && rows.every(row => row.cellIds.length > 0 && row.cellIds.every(cellId => {
        const cell = context.program.cells.find(candidate => candidate.id === cellId);
        return cell?.rowId === row.id && cell.kernelState?.type === 'cell';
      }))
      && !context.program.operations.some(operation => rowIds.has(operation.rowId || '')
        && ['createText', 'createButton', 'createEditBox', 'createIcon'].includes(operation.kind));
  };
  const emptyMoveReceipt = {
    issued: true,
    accepted: emptyMoveResult.accepted,
    inverseAccepted: emptyMoveInverse?.accepted === true,
    exactSwap: emptyMoveResult.accepted === true
      && sourceTextAt(emptyMoveResult, emptyMoveEntry.path) === emptyMoveBeforeText.slice(0, emptyMoveEntry.startOffset)
        + emptyMoveEntry.lower.expectedText + emptyMoveEntry.upper.expectedText
        + emptyMoveBeforeText.slice(emptyMoveEntry.endOffset),
    exactRoundTrip: emptyMoveInverse?.accepted === true
      && sourceTextAt(emptyMoveInverse, emptyMoveEntry.path) === emptyMoveBeforeText,
    beforeRowsEmpty: emptyRowsAreKernelOnly(emptyMoveBeforeContext),
    afterRowsEmpty: emptyRowsAreKernelOnly(emptyMoveAfterContext),
    reason: emptyMoveResult.accepted === false ? emptyMoveResult.reason : undefined,
  };
  console.log(`x4UiSourceEdits B119 empty-row move matrix: ${JSON.stringify(emptyMoveReceipt)}`);
  check('B119 imported empty rows apply and inverse as an exact source permutation',
    emptyMoveReceipt.accepted && emptyMoveReceipt.inverseAccepted && emptyMoveReceipt.exactSwap
      && emptyMoveReceipt.exactRoundTrip && emptyMoveReceipt.beforeRowsEmpty && emptyMoveReceipt.afterRowsEmpty,
    JSON.stringify(emptyMoveReceipt));
  const newRowCell = rowProducerResult.catalog.insertEntries?.find(entry => entry.kind === 'insert-widget'
    && entry.rowId === rowProducerResult.insertedRow.rowId);
  if (!newRowCell || newRowCell.kind !== 'insert-widget') throw new Error('new row has no issued empty cell');
  const rowWidgetResult = applyX4UiSourceWidgetInsertion(rowProducerResult.workspace, rowProducerResult.source,
    rowProducerResult.catalog, { entry: newRowCell, widget: 'text', text: 'New-menu new-row text' });
  check('B119 Add row New-menu fresh cell immediately accepts a typed widget', rowWidgetResult.accepted,
    JSON.stringify({ accepted: rowWidgetResult.accepted, reason: rowWidgetResult.accepted === false ? rowWidgetResult.reason : undefined }));
  const rowProducerAfter = sessionContextFor(rowProducerResult.workspace, canonicalCorpus, rowProducerResult.path,
    target => target.kind === 'function' && target.name === 'menu.createFrame', 'new row result');
  const rowOwner = rowProducerAfter.program.rows.find(row => row.id === rowProducerResult.insertedRow.rowId)!;
  const rowCreator = rowProducerAfter.program.operations.find(operation => operation.id === rowProducerResult.insertedRow.creatorOperationId)!;
  const rowHeight = getRowHeight(rowProducerAfter.program.tables[0].kernelState!, rowOwner.rowIndex!);
  check('B119 Add row returned creator and complete empty row owner chain retain canonical Helper height',
    rowCreator.kind === 'addRow' && rowCreator.status === 'applied' && rowCreator.rowId === rowOwner.id
      && rowCreator.tableId === rowOwner.tableId && rowOwner.rowIndex === 2
      && rowOwner.tableId === rowProducerResult.insertedRow.tableId
      && rowProducerAfter.program.tables.find(table => table.id === rowOwner.tableId)?.frameId === rowProducerResult.insertedRow.frameId
      && JSON.stringify(rowCreator.source) === JSON.stringify(rowProducerResult.insertedRow.creatorSource)
      && JSON.stringify(rowProducerResult.insertedRow.sourceIdentity) === JSON.stringify(rowProducerAfter.program.target.sourceIdentity)
      && JSON.stringify(rowOwner.cellIds) === JSON.stringify(rowProducerResult.insertedRow.cellIds)
      && rowOwner.height?.status === 'known' && rowHeight.status === 'ok' && rowOwner.height.value === rowHeight.value
      && rowOwner.kernelState?.scaling === rowProducerAfter.program.tables.find(table => table.id === rowOwner.tableId)?.kernelState?.properties.scaling
      && rowProducerAfter.program.cells.filter(cell => cell.rowId === rowOwner.id).every(cell =>
        cell.rowIndex === 2 && cell.kernelState?.type === 'cell' && cell.kernelState.colspan === 1)
      && Object.isFrozen(rowProducerResult.insertedRow) && Object.isFrozen(rowProducerResult.insertedRow.cellIds),
    JSON.stringify({ height: rowOwner.height, rowIndex: rowOwner.rowIndex, creator: rowCreator.kind }));
  let rowSequence = acceptedWidget(rowWidgetResult);
  for (const widget of ['button', 'input'] as const) {
    const rowResult = acceptedRow(applyX4UiSourceRowInsertion(rowSequence.workspace, rowSequence.source, rowSequence.catalog,
      { entry: rowEntryFor(rowSequence.catalog, widget === 'button' ? 2 : 3) }));
    const entry = rowResult.catalog.insertEntries?.find(entry => entry.kind === 'insert-widget'
      && entry.rowId === rowResult.insertedRow.rowId && entry.column === 1);
    if (!entry || entry.kind !== 'insert-widget') throw new Error('sequential row missing first empty cell');
    const text = `sequential row ${widget} "quote" \\ literal\n-- inert`;
    rowSequence = acceptedWidget(applyX4UiSourceWidgetInsertion(rowResult.workspace, rowResult.source, rowResult.catalog, { entry, widget, text }));
    const after = sessionContextFor(rowSequence.workspace, canonicalCorpus, rowSequence.path,
      target => target.kind === 'function' && target.name === 'menu.createFrame', 'sequential new-menu row widget');
    const operations = after.program.operations.filter(operation => operation.rowId === rowResult.insertedRow.rowId);
    const calls = rowSequence.source.bundle!.sourceFiles.find(file => file.path === rowSequence.path)!.callModel.calls;
    const textCall = calls.find(call => call.name === (widget === 'button' ? 'setText' : 'createEditBox')
      && call.source.start.offset >= rowSequence.startOffset && call.source.end.offset <= rowSequence.startOffset + rowSequence.replacement.length);
    check(`B119 Add row New-menu sequential fresh ${widget} keeps literal and exact creator ownership`,
      operations.map(operation => operation.kind).join(',') === (widget === 'button' ? 'addRow,createButton,setText' : 'addRow,createEditBox')
        && operations.every(operation => operation.status === 'applied' && operation.tableId === entry.tableId
          && (operation.kind === 'addRow' || operation.cellId === entry.cellId))
        && (widget === 'input' ? textCall?.semantics.editBox?.defaultText?.value : textCall?.semantics.text?.value) === text
        && rowSequence.insertedWidget.rowId === rowResult.insertedRow.rowId,
      JSON.stringify({ widget, kinds: operations.map(operation => operation.kind), text: textCall?.semantics,
        returnedRow: rowSequence.insertedWidget.rowId === rowResult.insertedRow.rowId }));
    if (widget === 'input') {
      const inputCell = after.program.cells.find(cell => cell.id === entry.cellId);
      const inputRow = after.program.rows.find(row => row.id === entry.rowId);
      const heightEntry = rowSequence.catalog.editableEntries.find(candidate =>
        candidate.provenance.callName === 'createEditBox' && candidate.provenance.fields.includes('semantics.properties.height')
          && candidate.startOffset >= rowSequence.startOffset
          && candidate.endOffset <= rowSequence.startOffset + rowSequence.replacement.length);
      const heightReceipt = {
        cellHeight: inputCell?.height, rowHeight: inputRow?.height,
        kernelHeight: inputCell?.kernelState?.height,
        editableHeight: heightEntry?.expectedText,
      };
      console.log('B119_FRESH_ROW_INPUT_HEIGHT', JSON.stringify(heightReceipt));
      check('B119 fresh-row Input gets an explicit editable control height without a sibling',
        inputCell?.kernelState?.height === 25
          && inputCell.height?.status === 'known' && inputCell.height.value === 25
          && inputRow?.height?.status === 'known' && inputRow.height.value === 25
          && heightEntry?.expectedText === '25', JSON.stringify(heightReceipt));

      // This counterfactual is imported source, not a request to insert a widget.
      // Omitting height must retain Helper's zero-height editbox semantics.
      const heightlessSource = sourceTextAt(rowSequence, rowSequence.path).replace(
        rowSequence.replacement, rowSequence.replacement.replace(', height = 25', ''));
      const heightlessWorkspace: ModWorkspace = { ...rowSequence.workspace,
        passthroughFiles: rowSequence.workspace.passthroughFiles!.map(file => file.path === rowSequence.path
          ? { ...file, content: heightlessSource } : file) };
      const heightlessBefore = JSON.stringify(heightlessWorkspace);
      const heightless = sessionContextFor(heightlessWorkspace, canonicalCorpus, rowSequence.path,
        target => target.kind === 'function' && target.name === 'menu.createFrame', 'imported heightless Input');
      const heightlessCell = heightless.program.cells.find(cell => cell.rowIndex === 4 && cell.column === 1);
      const heightlessRow = heightless.program.rows.find(row => row.rowIndex === 4);
      check('B119 imported heightless Input remains zero-height with a one-unit empty sibling row',
        heightlessCell?.kernelState?.height === 0
          && heightlessCell.height?.status === 'known' && heightlessCell.height.value === 0
          && heightlessRow?.height?.status === 'known' && heightlessRow.height.value === 1
          && JSON.stringify(heightlessWorkspace) === heightlessBefore
          && sourceTextAt(heightless, rowSequence.path) === heightlessSource,
        JSON.stringify({ cell: heightlessCell?.height, row: heightlessRow?.height }));
    }
  }
  const rowMiddleLua = '\uFEFF' + contextualImportLua.replace('local row = ftable:addRow(false, {})', [
    'local row = ftable:addRow(false, {})', 'row[1]:createText("first", {})',
    'local second = ftable:addRow(false, {})', 'second[1]:createText("middle", {})',
    'local third = ftable:addRow(false, {})', 'third[1]:createText("last", {})',
  ].join('\n')).replace('row[1]:setColSpan(2); -- retained span', '-- retained row block').replaceAll('\n', '\r\n');
  const rowPlacementCases = [
    ['middle of three', rowMiddleLua, 2], ['last of three', rowMiddleLua, 3],
    ['interleaved table', rowMiddleLua.replace('local row =', 'local other = frame:addTable(2, { width = 180 })\r\nlocal row =')
      .replace('local third =', 'local otherrow = other:addRow(false, {})\r\notherrow[1]:createText("other", {})\r\nlocal third ='), 2],
    ['unindented spans retained', contextualImportLua, 1],
    ['canonical empty unscaled', contextualImportLua.replace('reserveScrollBar = false', 'reserveScrollBar = false, scaling = false'), 1],
    ['all file names reserved', contextualImportLua.replace('function menu.createFrame()', 'local row2 = 2\nfunction menu.createFrame(row3)')
      .replace('-- trailing bytes', 'local function later(row4)\n local row5 = row4\n return row5, row6\nend\n-- trailing bytes'), 1],
  ] as const;
  const rowPlacementReceipts = rowPlacementCases.map(([name, lua, index]) => {
    const context = contextualImportContextFor(canonicalCorpus, lua);
    const catalog = catalogFor(context);
    const tableId = context.program.tables[0].id;
    const entry = catalog.insertEntries?.find(entry => entry.kind === 'insert-row' && entry.rowIndex === index && entry.tableId === tableId);
    const before = JSON.stringify(context.workspace);
    const beforeSource = JSON.stringify(context.source);
    const result = entry?.kind === 'insert-row'
      ? applyX4UiSourceRowInsertion(context.workspace, context.source, catalog, { entry }) : undefined;
    if (result?.accepted !== true) return { name, issued: Boolean(entry), accepted: result?.accepted,
      reason: result?.accepted === false ? result.reason : undefined, detail: result?.accepted === false ? result.detail : undefined };
    const after = sessionContextFor(result.workspace, canonicalCorpus, result.path,
      target => target.kind === 'function' && target.name === 'menu.createFrame', name);
    const inserted = after.program.rows.find(row => row.id === result.insertedRow.rowId)!;
    const nextOldRow = context.program.rows.find(row => row.tableId === tableId && row.rowIndex === index + 1);
    const nextStatementStart = nextOldRow && context.source.bundle!.sourceFiles.find(file => file.path === result.path)!.callModel.calls
      .find(call => call.name === 'addRow' && call.source.start.offset === nextOldRow.source.start.offset)?.enclosingStatement?.deletionSource.start.offset;
    const expectedAnchor = nextStatementStart ?? lua.indexOf('frame:display()');
    const ownerIndices = context.program.rows.every(oldRow => {
      const offset = oldRow.source.start.offset + (oldRow.source.start.offset >= result.startOffset ? result.replacement.length : 0);
      const mappedRow = after.program.rows.find(row => row.source.start.offset === offset);
      return mappedRow?.tableId === oldRow.tableId && mappedRow.rowIndex === oldRow.rowIndex! + (oldRow.tableId === tableId && oldRow.rowIndex! > index ? 1 : 0)
        && JSON.stringify(mappedRow.kernelState) === JSON.stringify(oldRow.kernelState)
        && after.program.cells.filter(cell => cell.rowId === mappedRow.id).every(cell => cell.rowIndex === mappedRow.rowIndex);
    });
    return { name, issued: true, accepted: true, anchor: result.startOffset === expectedAnchor,
      ownerIndices, rowIndex: inserted.rowIndex === index + 1,
      columns: inserted.kernelState?.cells.every((cell, column) => cell.colspan === after.program.tables[0].kernelState?.columns[column].colspan),
      bytes: sourceTextAt(result, result.path) === lua.slice(0, result.startOffset) + result.replacement + lua.slice(result.endOffset)
        && JSON.stringify(context.workspace) === before && JSON.stringify(context.source) === beforeSource
        && context.workspace.passthroughFiles!.filter(file => file.path !== result.path).every(file =>
          JSON.stringify(result.workspace.passthroughFiles!.find(afterFile => afterFile.path === file.path)) === JSON.stringify(file)),
      binding: name !== 'all file names reserved' || result.replacement.startsWith('local row7 = ftable:addRow(false, {})'),
      height: name !== 'canonical empty unscaled' || (inserted.height?.status === 'known' && inserted.height.value === 1
        && inserted.kernelState?.cells.every(cell => cell.height === 0)),
    };
  });
  console.log(`x4UiSourceEdits row placement controls: ${JSON.stringify(rowPlacementReceipts)}`);

  const rowBeforeFile = contextualProducer.source.bundle!.sourceFiles.find(file => file.path === rowProducerResult.path)!;
  const rowAfterFile = rowProducerResult.source.bundle!.sourceFiles.find(file => file.path === rowProducerResult.path)!;
  const rowCallIndex = rowAfterFile.callModel.calls.findIndex(call => call.source.start.offset === rowCreator.source.start.offset);
  const rowOperationIndex = rowProducerAfter.program.operations.findIndex(operation => operation.id === rowCreator.id);
  const rowLedger: ContextualLedgerInput = {
    beforeCalls: rowBeforeFile.callModel.calls, afterCalls: rowAfterFile.callModel.calls,
    beforeRecords: rowBeforeFile.callModel.records, afterRecords: rowAfterFile.callModel.records,
    beforeOperations: contextualProducer.program.operations, afterOperations: rowProducerAfter.program.operations,
    entry: rowProducerEntries[0], beforeText: rowBeforeFile.text, afterText: rowAfterFile.text,
    replacementLength: rowProducerResult.replacement.length, insertedCallIndex: -1, insertedOperationIndex: -1,
    replacementCallIndexes: [rowCallIndex], replacementCallNames: ['addRow'], replacementCallOrders: [rowAfterFile.callModel.calls[rowCallIndex].order],
    replacementOperationIndexes: [rowOperationIndex], replacementOperationKinds: ['addRow'], replacementOperationIds: [rowCreator.id],
    replacementOperationModelOrders: [rowCreator.modelOrder],
  };
  const rowLedgerAttacks: readonly [string, (input: ContextualLedgerInput) => void][] = [
    ['inserted rowId', input => { asRecord(input.afterOperations[rowOperationIndex])!.rowId = 'foreign-row'; }],
    ['inserted frameId', input => { asRecord(input.afterOperations[rowOperationIndex])!.frameId = 'foreign-frame'; }],
    ['inserted tableId', input => { asRecord(input.afterOperations[rowOperationIndex])!.tableId = 'foreign-table'; }],
    ['inserted modelOrder', input => { asRecord(input.afterOperations[rowOperationIndex])!.modelOrder = 0; }],
    ['inserted metadata result', input => {
      asRecord(asRecord(asRecord(input.afterOperations[rowOperationIndex])!.metadata)!.result)!.path = 'foreign-row';
    }],
    ['inserted metadata unrelated undefined', input => {
      asRecord(asRecord(input.afterOperations[rowOperationIndex])!.metadata)!.unexpected = undefined;
    }],
    ['inserted source', input => {
      const source = asRecord(asRecord(input.afterOperations[rowOperationIndex])!.source)!;
      const end = asRecord(source.end)!; end.offset = Number(end.offset) - 1; end.column = Number(end.column) - 1;
    }],
    ['retained owner', input => { asRecord(input.afterOperations.find(operation => asRecord(operation)?.kind === 'createText'))!.rowId = 'foreign-row'; }],
    ['retained kernel width', input => {
      const kernel = asRecord(asRecord(input.afterOperations[rowOperationIndex])!.kernel)!;
      asRecord(asRecord(kernel.stateAfter)!.properties)!.width = 99;
    }],
    ['inserted row kernel', input => {
      const kernel = asRecord(asRecord(input.afterOperations[rowOperationIndex])!.kernel)!;
      const rows = asRecord(kernel.stateAfter)!.rows as Record<string, unknown>[]; rows[1].paddingTop = 99;
    }],
    ['missing retained record', input => { asRecord(input)!.afterRecords = input.afterRecords.slice(1); }],
  ];
  const rowLedgerReceipts = rowLedgerAttacks.map(([name, mutate]) => {
    const input = structuredClone(rowLedger);
    const snapshot = () => JSON.stringify(input, (_key, value) => value === undefined ? '<undefined>' : value);
    const before = snapshot(); mutate(input);
    return { name, changed: snapshot() !== before, accepted: compareX4UiSourceStructuralLedgerCorrespondence(input) };
  });
  console.log(`x4UiSourceEdits row ledger negatives: ${JSON.stringify(rowLedgerReceipts)}`);
  const rowNegativeSourceCases = [
    ...ownerSourceCases,
    ...['mutate(ftable)', 'ftable:setDefaultColSpan(1, 2)', 'ftable[2] = {}'].map(statement =>
      [`before selected row: ${statement}`, contextualImportLua.replace('local row =', `${statement}\nlocal row =`)] as const),
    ...['mutate(row)', 'row = {}', 'row[2] = {}', 'row[2], other = {}, nil', 'local escaped = row',
      'mutate(ftable)', 'ftable = {}', 'ftable [ --[[ slot ]] 2 ], other = {}, nil', 'local escaped = ftable\nmutate(escaped)',
      'local alias = ftable\nalias[2], other = {}, nil',
      'row [ 1 + 1 ] = {}', 'row --[[ comment ]] [2] = {}'].map(statement =>
      [statement, contextualImportLua.replace('frame:display()', `${statement}\nframe:display()`)] as const),
  ];
  const rowNegativeSourceReceipts = rowNegativeSourceCases.map(([name, lua]) => {
    const context = contextualImportContextFor(canonicalCorpus, lua.replace('row[1]:setColSpan(2); -- retained span', '-- no span'));
    const catalog = catalogFor(context);
    return { name, issued: catalog.insertEntries?.filter(entry => entry.kind === 'insert-row').length || 0 };
  });
  console.log(`x4UiSourceEdits row owner negatives: ${JSON.stringify(rowNegativeSourceReceipts)}`);
  const rowInertSources = [
    contextualImportLua.replace('frame:display()', 'local inert = "row[2], other = {}, nil; mutate(ftable)"\n-- row = {}; ftable = {}\nframe:display()'),
    contextualImportLua.replace('local row = ftable:', 'local alias = ftable\nlocal row = alias:'),
    contextualImportLua.replace('frame:display()', 'local alias = ftable\nframe:display()'),
    contextualImportLua.replace('frame:display()', 'local inert = [==[ row[2] = {}; mutate(ftable) ]==]\n--[=[ row = {} ]=]\nframe:display()'),
  ];
  const rowInertReceipts = rowInertSources.map(lua => {
    const context = contextualImportContextFor(canonicalCorpus, lua); const catalog = catalogFor(context);
    const entry = catalog.insertEntries?.find(entry => entry.kind === 'insert-row');
    return entry?.kind === 'insert-row' && applyX4UiSourceRowInsertion(context.workspace, context.source, catalog, { entry }).accepted;
  });
  const rowBoundaryContext = contextualImportContextFor(canonicalCorpus);
  const rowBoundaryCatalog = catalogFor(rowBoundaryContext);
  const rowBoundaryEntry = rowEntryFor(rowBoundaryCatalog, 1);
  const rowRequest: X4UiSourceEditRowInsertionRequest = { entry: rowBoundaryEntry };
  const rowBoundaryBytes = JSON.stringify(rowBoundaryContext.workspace);
  const rowForeignContext = contextualImportContextFor(canonicalCorpus);
  const rowForeignCatalog = catalogFor(rowForeignContext);
  const rowAuthorityCases = [
    ['cloned entry', rowBoundaryContext.workspace, rowBoundaryContext.source, rowBoundaryCatalog, { entry: structuredClone(rowBoundaryEntry) }],
    ['foreign entry', rowBoundaryContext.workspace, rowBoundaryContext.source, rowBoundaryCatalog, { entry: rowEntryFor(rowForeignCatalog, 1) }],
    ['wrong table', rowBoundaryContext.workspace, rowBoundaryContext.source, rowBoundaryCatalog, { entry: { ...rowBoundaryEntry, tableId: 'foreign' } }],
    ['wrong row', rowBoundaryContext.workspace, rowBoundaryContext.source, rowBoundaryCatalog, { entry: { ...rowBoundaryEntry, rowId: 'foreign' } }],
    ['wrong frame', rowBoundaryContext.workspace, rowBoundaryContext.source, rowBoundaryCatalog, { entry: { ...rowBoundaryEntry, frameId: 'foreign' } }],
    ['cloned catalog', rowBoundaryContext.workspace, rowBoundaryContext.source, structuredClone(rowBoundaryCatalog), rowRequest],
    ['foreign catalog', rowBoundaryContext.workspace, rowBoundaryContext.source, rowForeignCatalog, rowRequest],
    ['cloned source', rowBoundaryContext.workspace, structuredClone(rowBoundaryContext.source), rowBoundaryCatalog, rowRequest],
    ['cloned workspace', structuredClone(rowBoundaryContext.workspace), rowBoundaryContext.source, rowBoundaryCatalog, rowRequest],
  ] as const;
  const rowAuthorityReceipts = rowAuthorityCases.map(([name, currentWorkspace, source, catalog, request]) => {
    const result = applyX4UiSourceRowInsertion(currentWorkspace, source, catalog, request);
    return { name, accepted: result.accepted, changed: result.changed, reason: result.accepted === false ? result.reason : undefined };
  });
  const rowAccessorReceipts = ['request', 'entry', 'expected', 'catalog', 'workspace', 'workspace-file', 'source'].map(surface => {
    const context = contextualImportContextFor(canonicalCorpus); let catalog = catalogFor(context); let source = context.source;
    let request: X4UiSourceEditRowInsertionRequest = { entry: rowEntryFor(catalog, 1) };
    let reads = 0;
    const descriptor = { enumerable: true, configurable: true, get: () => { reads += 1; throw new Error('row getter executed'); } };
    if (surface === 'request') request = Object.defineProperty({ ...request }, 'entry', descriptor);
    if (surface === 'entry') request = { entry: Object.defineProperty({ ...request.entry }, 'provenance', descriptor) };
    if (surface === 'expected') request = { ...request, expected: Object.defineProperty({ path: request.entry.path,
      startOffset: request.entry.startOffset, endOffset: request.entry.endOffset, expectedText: '' }, 'path', descriptor) };
    if (surface === 'catalog') catalog = Object.defineProperty({ ...catalog }, 'insertEntries', descriptor);
    if (surface === 'source') source = Object.defineProperty({ ...source }, 'bundle', descriptor);
    if (surface === 'workspace') Object.defineProperty(context.workspace, 'passthroughFiles', descriptor);
    if (surface === 'workspace-file') Object.defineProperty(context.workspace.passthroughFiles![2], 'content', descriptor);
    const outcome = invokePublic(() => applyX4UiSourceRowInsertion(context.workspace, source, catalog, request));
    return { surface, reads, threw: outcome.threw, accepted: outcome.value?.accepted, changed: outcome.value?.changed };
  });
  const rowInvalidRequests: readonly unknown[] = [null, {}, { ...rowRequest, directCall: 'ftable:addRow(false, {})' },
    { ...rowRequest, receiver: 'other' }, { ...rowRequest, binding: 'caller' }, { ...rowRequest, height: 10 },
    { ...rowRequest, entry: null }, { ...rowRequest, entry: () => rowBoundaryEntry },
    { ...rowRequest, expected: {} }, Object.assign(Object.create({ inherited: true }), rowRequest)];
  const rowInvalidResults = rowInvalidRequests.map(request => {
    const result: ReturnType<typeof applyX4UiSourceRowInsertion> = Reflect.apply(applyX4UiSourceRowInsertion, undefined,
      [rowBoundaryContext.workspace, rowBoundaryContext.source, rowBoundaryCatalog, request]);
    return result.accepted === false && !result.changed && result.reason === 'invalid-request';
  });
  const rowExpected = { path: rowBoundaryEntry.path, startOffset: rowBoundaryEntry.startOffset, endOffset: rowBoundaryEntry.endOffset, expectedText: '' };
  const rowCasResults = [{ ...rowExpected, path: 'wrong' }, { ...rowExpected, startOffset: rowExpected.startOffset - 1 },
    { ...rowExpected, endOffset: rowExpected.endOffset + 1 }, { ...rowExpected, expectedText: 'stale' }].map(expected =>
    applyX4UiSourceRowInsertion(rowBoundaryContext.workspace, rowBoundaryContext.source, rowBoundaryCatalog, { ...rowRequest, expected }));
  const rowStaleContext = contextualImportContextFor(canonicalCorpus); const rowStaleCatalog = catalogFor(rowStaleContext);
  const rowStaleEntry = rowEntryFor(rowStaleCatalog, 1);
  rowStaleContext.workspace.passthroughFiles![2].content += '-- externally changed';
  const rowStale = applyX4UiSourceRowInsertion(rowStaleContext.workspace, rowStaleContext.source, rowStaleCatalog, { entry: rowStaleEntry });
  const rowConsumed = applyX4UiSourceRowInsertion(rowProducerResult.workspace, rowProducerResult.source, rowProducerResult.catalog, { entry: rowProducerEntries[0] });
  const rowOldCatalog = applyX4UiSourceRowInsertion(rowProducerResult.workspace, rowProducerResult.source, contextualProducerCatalog, { entry: rowProducerEntries[0] });
  console.log(`x4UiSourceEdits row boundary negatives: ${JSON.stringify({ authority: rowAuthorityReceipts,
    accessors: rowAccessorReceipts, invalid: rowInvalidResults, cas: rowCasResults.map(result => ({ accepted: result.accepted, changed: result.changed })),
    stale: rowStale.accepted, consumed: rowConsumed.accepted, oldCatalog: rowOldCatalog.accepted })}`);
  check('B119 Add row last middle interleaved spans and collision controls preserve exact source and mapped owners',
    rowPlacementReceipts.every(receipt => receipt.accepted && receipt.anchor && receipt.ownerIndices && receipt.rowIndex
      && receipt.columns && receipt.bytes && receipt.binding && receipt.height), JSON.stringify(rowPlacementReceipts));
  check('B119 Add row standalone ledger rejects forged inserted and retained ownership source order and kernel state',
    compareX4UiSourceStructuralLedgerCorrespondence(rowLedger) && rowLedgerReceipts.every(receipt => receipt.changed && !receipt.accepted),
    JSON.stringify(rowLedgerReceipts));
  check('B119 Add row refuses unsafe rebound mutation alias and control-flow owners',
    rowNegativeSourceReceipts.every(receipt => receipt.issued === 0), JSON.stringify(rowNegativeSourceReceipts));
  check('B119 Add row preserves inert text comments and proven table aliases', rowInertReceipts.every(Boolean), JSON.stringify(rowInertReceipts));
  check('B119 Add row rejects cloned foreign wrong-owner and malformed raw-Lua requests without byte mutation',
    rowAuthorityReceipts.every(receipt => !receipt.accepted && !receipt.changed) && rowInvalidResults.every(Boolean)
      && JSON.stringify(rowBoundaryContext.workspace) === rowBoundaryBytes, JSON.stringify(rowAuthorityReceipts));
  check('B119 Add row accessor requests and authority graphs execute zero getters',
    rowAccessorReceipts.every(receipt => receipt.reads === 0 && !receipt.threw && receipt.accepted === false && receipt.changed === false),
    JSON.stringify(rowAccessorReceipts));
  check('B119 Add row expected CAS stale source and consumed catalogs are atomic refusals',
    rowCasResults.every(result => result.accepted === false && !result.changed)
      && rowStale.accepted === false && !rowStale.changed && rowConsumed.accepted === false && !rowConsumed.changed
      && rowOldCatalog.accepted === false && !rowOldCatalog.changed);
  const testsFirstMoveSurface = sourceEditMoveSurface as unknown as {
    applyX4UiSourceRowMove?: unknown;
  };
  check('B119 tests-first move API is the next source-owned surface',
    typeof testsFirstMoveSurface.applyX4UiSourceRowMove === 'function',
    'typed row move API is not implemented yet');
  const buildFourRowProducer = () => {
    let producer = createdMenuSessionContextFor(canonicalCorpus);
    const producerPath = producer.program.target.source.file;
    for (const widget of ['text', 'button', 'input'] as const) {
      const catalog = catalogFor(producer);
      const rowEntry = rowEntryFor(catalog, producer.program.rows.length);
      const rowResult = acceptedRow(applyX4UiSourceRowInsertion(
        producer.workspace,
        producer.source,
        catalog,
        { entry: rowEntry },
      ));
      const cellEntry = rowResult.catalog.insertEntries?.find(entry => entry.kind === 'insert-widget'
        && entry.rowId === rowResult.insertedRow.rowId && entry.column === 1);
      if (!cellEntry || cellEntry.kind !== 'insert-widget') throw new Error(`producer ${widget} row has no first cell authority`);
      const widgetResult = acceptedWidget(applyX4UiSourceWidgetInsertion(
        rowResult.workspace,
        rowResult.source,
        rowResult.catalog,
        { entry: cellEntry, widget, text: `producer ${widget} row` },
      ));
      producer = sessionContextFor(
        widgetResult.workspace,
        canonicalCorpus,
        producerPath,
        target => target.kind === 'function' && target.name === 'menu.createFrame',
        `B119 producer ${widget} row`,
      );
    }
    return producer;
  };
  const moveProducer = buildFourRowProducer();
  const moveProducerPath = moveProducer.program.target.source.file;
  const producerMoveDirections = [
    ['row1 down', 'down', 1],
    ['row2 down', 'down', 2],
    ['row3 down', 'down', 3],
    ['row2 up', 'up', 2],
    ['row3 up', 'up', 3],
    ['row4 up', 'up', 4],
  ] as const;
  const producerDirectionReceipts = producerMoveDirections.map(([name, direction, rowIndex]) => {
    const producer = buildFourRowProducer();
    const catalog = catalogFor(producer);
    const entry = (catalog.moveEntries || []).find(candidate => candidate.kind === 'move-row'
      && candidate.direction === direction && candidate.rowIndex === rowIndex);
    if (!entry) return { name, issued: false, accepted: false, inverseAccepted: false, moveEntries: (catalog.moveEntries || []).length };
    const before = sourceTextAt(producer, moveProducerPath);
    const result = applyX4UiSourceRowMove(producer.workspace, producer.source, catalog, { entry });
    if (result.accepted === false) return { name, issued: true, accepted: false, inverseAccepted: false, reason: result.reason, detail: result.detail };
    const movedIndex = direction === 'down' ? rowIndex + 1 : rowIndex - 1;
    const inverseEntry = (result.catalog.moveEntries || []).find(candidate => candidate.kind === 'move-row'
      && candidate.direction !== direction && candidate.rowIndex === movedIndex
      && candidate.rowId === result.movedRow.rowId);
    const inverse = inverseEntry
      ? applyX4UiSourceRowMove(result.workspace, result.source, result.catalog, { entry: inverseEntry })
      : undefined;
    const expectedMovedText = before.slice(0, entry.startOffset) + entry.lower.expectedText + entry.upper.expectedText
      + before.slice(entry.endOffset);
    return {
      name,
      issued: true,
      accepted: true,
      inverseAccepted: inverse?.accepted === true,
      exactSwap: sourceTextAt(result, moveProducerPath) === expectedMovedText,
      exactRoundTrip: inverse?.accepted === true && sourceTextAt(inverse, moveProducerPath) === before,
      movedRowIndex: result.movedRow.rowIndex,
      inverseRowIndex: inverse?.accepted === true ? inverse.movedRow.rowIndex : undefined,
      freshProof: result.movedRow.rowId !== result.entry.rowId
        && result.movedRow.creatorOperationId !== (direction === 'down' ? entry.upper : entry.lower).creatorOperationId,
      movedCellCount: result.movedRow.cellIds.length,
    };
  });
  console.log(`x4UiSourceEdits B119 actual four-row producer all directions: ${JSON.stringify(producerDirectionReceipts)}`);
  check('B119 actual New-menu Text/Button/Input four-row producer accepts every direction and inverse byte-identically',
    producerDirectionReceipts.every(receipt => receipt.issued && receipt.accepted && receipt.inverseAccepted
      && receipt.exactSwap && receipt.exactRoundTrip && receipt.movedRowIndex !== undefined
      && receipt.inverseRowIndex !== undefined && receipt.movedCellCount > 0 && receipt.freshProof),
    JSON.stringify(producerDirectionReceipts));
  const moveProducerCatalog = catalogFor(moveProducer);
  const moveProducerText = sourceTextAt(moveProducer, moveProducerPath);
  const moveProducerEntry = (moveProducerCatalog.moveEntries || []).find(entry => entry.kind === 'move-row'
    && entry.direction === 'down' && entry.rowIndex === 2);
  const firstProducerMove = moveProducerEntry
    ? applyX4UiSourceRowMove(moveProducer.workspace, moveProducer.source, moveProducerCatalog, { entry: moveProducerEntry })
    : undefined;
  const firstProducerMoveReceipt = {
    accepted: firstProducerMove?.accepted,
    changed: firstProducerMove?.changed,
    reason: firstProducerMove?.accepted === false ? firstProducerMove.reason : undefined,
    detail: firstProducerMove?.accepted === false ? firstProducerMove.detail : undefined,
    moveEntries: (moveProducerCatalog.moveEntries || []).length,
    rowCount: moveProducer.program.rows.length,
  };
  console.log(`x4UiSourceEdits B119 first producer move: ${JSON.stringify(firstProducerMoveReceipt)}`);
  check('B119 New-menu Text/Button/Input producer exposes and accepts a real middle-row move',
    firstProducerMove?.accepted === true,
    JSON.stringify(firstProducerMoveReceipt));
  if (!firstProducerMove || firstProducerMove.accepted === false) throw new Error('producer move did not accept');
  const movedProducerText = sourceTextAt(firstProducerMove, moveProducerPath);
  const expectedMovedProducerText = moveProducerText.slice(0, firstProducerMove.startOffset)
    + firstProducerMove.entry.lower.expectedText + firstProducerMove.entry.upper.expectedText
    + moveProducerText.slice(firstProducerMove.endOffset);
  const movedProducerContext = sessionContextFor(
    firstProducerMove.workspace,
    canonicalCorpus,
    moveProducerPath,
    target => target.kind === 'function' && target.name === 'menu.createFrame',
    'B119 producer moved row',
  );
  const inverseProducerEntry = (firstProducerMove.catalog.moveEntries || []).find(entry => entry.kind === 'move-row'
    && entry.direction === 'up' && entry.rowIndex === 3 && entry.rowId === firstProducerMove.movedRow.rowId);
  const inverseProducerMove = inverseProducerEntry
    ? applyX4UiSourceRowMove(firstProducerMove.workspace, firstProducerMove.source, firstProducerMove.catalog,
      { entry: inverseProducerEntry })
    : undefined;
  const inverseProducerReceipt = {
    accepted: inverseProducerMove?.accepted,
    changed: inverseProducerMove?.changed,
    reason: inverseProducerMove?.accepted === false ? inverseProducerMove.reason : undefined,
    detail: inverseProducerMove?.accepted === false ? inverseProducerMove.detail : undefined,
    movedRowIndex: firstProducerMove.movedRow.rowIndex,
    freshMovedRow: firstProducerMove.movedRow.rowId !== firstProducerMove.entry.rowId,
  };
  console.log(`x4UiSourceEdits B119 producer inverse move: ${JSON.stringify(inverseProducerReceipt)}`);
  check('B119 producer move preserves exact swapped bytes and fresh creator proof for inverse move',
    movedProducerText === expectedMovedProducerText
      && firstProducerMove.movedRow.rowIndex === 3
      && firstProducerMove.movedRow.creatorOperationId !== firstProducerMove.entry.upper.creatorOperationId
      && firstProducerMove.movedRow.sourceIdentity.sha256 !== firstProducerMove.entry.provenance.sourceIdentity.sha256
      && inverseProducerMove?.accepted === true
      && sourceTextAt(inverseProducerMove, moveProducerPath) === moveProducerText
      && inverseProducerMove.movedRow.rowIndex === 2
      && movedProducerContext.program.rows.length === moveProducer.program.rows.length,
    JSON.stringify({ first: firstProducerMoveReceipt, inverse: inverseProducerReceipt }));
  const moveBeforeFile = moveProducer.source.bundle!.sourceFiles.find(file => file.path === moveProducerPath)!;
  const moveAfterFile = movedProducerContext.source.bundle!.sourceFiles.find(file => file.path === moveProducerPath)!;
  const rowMoveLedger: Parameters<typeof compareX4UiSourceStructuralLedgerCorrespondence>[0] = {
    beforeCalls: moveBeforeFile.callModel.calls,
    afterCalls: moveAfterFile.callModel.calls,
    beforeRecords: moveBeforeFile.callModel.records,
    afterRecords: moveAfterFile.callModel.records,
    beforeOperations: moveProducer.program.operations,
    afterOperations: movedProducerContext.program.operations,
    entry: firstProducerMove.entry,
    beforeText: moveProducerText,
    afterText: movedProducerText,
    replacementLength: firstProducerMove.replacement.length,
    insertedCallIndex: -1,
    insertedOperationIndex: -1,
  };
  const rowMoveLedgerBaseline = compareX4UiSourceStructuralLedgerCorrespondence(rowMoveLedger);
  const movedCreatorIndex = movedProducerContext.program.operations.findIndex(operation => operation.id === firstProducerMove.movedRow.creatorOperationId);
  const retainedRowIndex = movedProducerContext.program.operations.findIndex(operation => operation.kind === 'addRow'
    && operation.id !== firstProducerMove.movedRow.creatorOperationId);
  const retainedCellIndex = movedProducerContext.program.operations.findIndex(operation => operation.kind === 'createText'
    && operation.rowId !== firstProducerMove.movedRow.rowId);
  const prefixIndex = movedProducerContext.program.operations.findIndex(operation => operation.kind === 'setColWidthPercent');
  const rowMoveLedgerMutations: readonly [string, (input: typeof rowMoveLedger) => void][] = [
    ['retained row ownership', input => {
      asRecord(input.afterOperations[retainedRowIndex])!.rowId = 'foreign-unaffected-row';
    }],
    ['retained row kernel state', input => {
      const kernel = asRecord(asRecord(input.afterOperations[retainedRowIndex])!.kernel)!;
      const rows = asRecord(kernel.stateAfter)!.rows as Record<string, unknown>[];
      asRecord(rows[0])!.paddingBottom = Number(asRecord(rows[0])!.paddingBottom) + 1;
    }],
    ['moved row ownership', input => {
      asRecord(input.afterOperations[movedCreatorIndex])!.rowId = 'foreign-moved-row';
    }],
    ['moved row kernel state', input => {
      const kernel = asRecord(asRecord(input.afterOperations[movedCreatorIndex])!.kernel)!;
      const rows = asRecord(kernel.stateAfter)!.rows as Record<string, unknown>[];
      asRecord(rows[rows.length - 1])!.paddingTop = Number(asRecord(rows[rows.length - 1])!.paddingTop) + 1;
    }],
    ['retained table prefix kernel state', input => {
      const kernel = asRecord(asRecord(input.afterOperations[prefixIndex])!.kernel)!;
      const properties = asRecord(asRecord(kernel.stateAfter)!.properties)!;
      properties.width = Number(properties.width) + 1;
    }],
    ['retained cell kernel state', input => {
      const kernel = asRecord(asRecord(input.afterOperations[retainedCellIndex])!.kernel)!;
      const rows = asRecord(kernel.stateAfter)!.rows as Record<string, unknown>[];
      const cells = asRecord(rows[0])!.cells as Record<string, unknown>[];
      asRecord(cells[0])!.height = Number(asRecord(cells[0])!.height) + 1;
    }],
  ];
  const rowMoveLedgerReceipts = rowMoveLedgerMutations.map(([name, mutate]) => {
    const input = structuredClone(rowMoveLedger);
    const before = JSON.stringify(input);
    mutate(input);
    return { name, changed: JSON.stringify(input) !== before, accepted: compareX4UiSourceStructuralLedgerCorrespondence(input) };
  });
  console.log(`x4UiSourceEdits B119 row move ledger causal matrix: ${JSON.stringify({
    baseline: rowMoveLedgerBaseline,
    rows: rowMoveLedgerMutations.length,
    refused: rowMoveLedgerReceipts.filter(receipt => !receipt.accepted).length,
  })}`);
  check('B119 row move correspondence proves retained prefixes, moved own-row state, and exact two-row scope',
    rowMoveLedgerBaseline && rowMoveLedgerReceipts.every(receipt => receipt.changed && !receipt.accepted),
    JSON.stringify(rowMoveLedgerReceipts));
  const terminalPairProducer = buildFourRowProducer();
  const terminalPairCatalog = catalogFor(terminalPairProducer);
  const terminalPairEntry = rowMoveEntryFor(terminalPairCatalog, 'down', 3);
  const terminalPairBeforeText = sourceTextAt(terminalPairProducer, terminalPairEntry.path);
  const terminalPairResult = acceptedMove(applyX4UiSourceRowMove(terminalPairProducer.workspace,
    terminalPairProducer.source, terminalPairCatalog, { entry: terminalPairEntry }));
  const terminalPairAfterContext = sessionContextFor(terminalPairResult.workspace, canonicalCorpus,
    terminalPairEntry.path, target => target.kind === 'function' && target.name === 'menu.createFrame',
    'B119 terminal Button/Input moved source');
  const terminalPairBeforeFile = terminalPairProducer.source.bundle!.sourceFiles.find(file => file.path === terminalPairEntry.path)!;
  const terminalPairAfterFile = terminalPairAfterContext.source.bundle!.sourceFiles.find(file => file.path === terminalPairEntry.path)!;
  const terminalPairLedger: Parameters<typeof compareX4UiSourceStructuralLedgerCorrespondence>[0] = {
    beforeCalls: terminalPairBeforeFile.callModel.calls,
    afterCalls: terminalPairAfterFile.callModel.calls,
    beforeRecords: terminalPairBeforeFile.callModel.records,
    afterRecords: terminalPairAfterFile.callModel.records,
    beforeOperations: terminalPairProducer.program.operations,
    afterOperations: terminalPairAfterContext.program.operations,
    entry: terminalPairResult.entry,
    beforeText: terminalPairBeforeText,
    afterText: sourceTextAt(terminalPairResult, terminalPairEntry.path),
    replacementLength: terminalPairResult.replacement.length,
    insertedCallIndex: -1,
    insertedOperationIndex: -1,
  };
  const lastKernelIndexFor = (operations: readonly X4UiLayoutOperation[], tableId: string): number => {
    for (let index = operations.length - 1; index >= 0; index -= 1) {
      const operation = operations[index];
      const kernel = asRecord(operation.kernel);
      if (operation.tableId === tableId && kernel?.stateAfter !== undefined) return index;
    }
    return -1;
  };
  const terminalBeforeKernelIndex = lastKernelIndexFor(terminalPairProducer.program.operations, terminalPairEntry.tableId);
  const terminalAfterKernelIndex = lastKernelIndexFor(terminalPairAfterContext.program.operations, terminalPairEntry.tableId);
  const terminalAfterSetTextIndex = terminalPairAfterContext.program.operations.findIndex((operation, index) =>
    index > terminalAfterKernelIndex && operation.tableId === terminalPairEntry.tableId && operation.kind === 'setText');
  if (terminalBeforeKernelIndex < 0 || terminalAfterKernelIndex < 0 || terminalAfterSetTextIndex < 0) {
    throw new Error('Button/Input terminal kernel transition was not reproduced');
  }
  const terminalBeforeKernelOperation = terminalPairProducer.program.operations[terminalBeforeKernelIndex];
  const terminalAfterKernelOperation = terminalPairAfterContext.program.operations[terminalAfterKernelIndex];
  const terminalAfterSetTextOperation = terminalPairAfterContext.program.operations[terminalAfterSetTextIndex];
  const terminalKernelLedgerBaseline = compareX4UiSourceStructuralLedgerCorrespondence(terminalPairLedger);
  const terminalKernelMutations: readonly [string, (input: typeof terminalPairLedger) => void][] = [
    ['before terminal stateAfter removed', input => {
      const operation = asRecord(input.beforeOperations[terminalBeforeKernelIndex])!;
      delete asRecord(operation.kernel)!.stateAfter;
    }],
    ['after terminal stateAfter removed', input => {
      const operation = asRecord(input.afterOperations[terminalAfterKernelIndex])!;
      delete asRecord(operation.kernel)!.stateAfter;
    }],
    ['after terminal kernel removed', input => {
      delete asRecord(input.afterOperations[terminalAfterKernelIndex])!.kernel;
    }],
  ];
  const terminalKernelReceipts = terminalKernelMutations.map(([name, mutate]) => {
    const input = structuredClone(terminalPairLedger);
    const before = JSON.stringify(input);
    mutate(input);
    return { name, changed: JSON.stringify(input) !== before, accepted: compareX4UiSourceStructuralLedgerCorrespondence(input) };
  });
  const terminalKernelSummary = {
    baseline: terminalKernelLedgerBaseline,
    before: { index: terminalBeforeKernelIndex, kind: terminalBeforeKernelOperation.kind,
      modelOrder: terminalBeforeKernelOperation.modelOrder, hasStateAfter: asRecord(terminalBeforeKernelOperation.kernel)?.stateAfter !== undefined },
    after: { index: terminalAfterKernelIndex, kind: terminalAfterKernelOperation.kind,
      modelOrder: terminalAfterKernelOperation.modelOrder, hasStateAfter: asRecord(terminalAfterKernelOperation.kernel)?.stateAfter !== undefined },
    metadataAfter: { index: terminalAfterSetTextIndex, kind: terminalAfterSetTextOperation.kind,
      hasKernel: terminalAfterSetTextOperation.kernel !== undefined, hasStateAfter: asRecord(terminalAfterSetTextOperation.kernel)?.stateAfter !== undefined },
    cases: terminalKernelMutations.length,
    refused: terminalKernelReceipts.filter(receipt => !receipt.accepted).length,
  };
  console.log(`x4UiSourceEdits B119 terminal Button/Input kernel removal negatives: ${JSON.stringify(terminalKernelSummary)}`);
  check('B119 terminal Button/Input kernel and stateAfter removals refuse without fallback to an earlier snapshot',
    terminalKernelLedgerBaseline && terminalBeforeKernelOperation.kind === 'createEditBox'
      && terminalAfterKernelOperation.kind === 'createButton' && terminalAfterSetTextOperation.kind === 'setText'
      && terminalAfterSetTextOperation.kernel === undefined && terminalAfterSetTextOperation.kernel?.stateAfter === undefined
      && terminalKernelReceipts.every(receipt => receipt.changed && !receipt.accepted),
    JSON.stringify({ summary: terminalKernelSummary, receipts: terminalKernelReceipts }));
  const rowMoveSemicolonLua = '\uFEFF' + contextualImportLua.replace([
    'local row = ftable:addRow(false, {})',
    'row[1]:setColSpan(2); -- retained span',
    'frame:display(); -- retained display',
  ].join('\n'), [
    'local first = ftable:addRow(false, {});',
    'first[1]:setColSpan(2); -- first span',
    'first[1]:createText("first", {});',
    '-- retained between-row comment; first[9] is inert',
    'local second = ftable:addRow(false, {});',
    'second[1]:setColSpan(2); -- second span',
    'second[1]:createText("second", {});',
    '-- retained second-row comment; second[9] is inert',
    'local third = ftable:addRow(false, {});',
    'third[1]:setColSpan(2); -- third span',
    'third[1]:createText("third", {});',
    'frame:display();',
  ].join('\n')).replaceAll('\n', '\r\n');
  const semicolonMoveCases = [
    ['first down', 'down', 1],
    ['middle down', 'down', 2],
    ['last up', 'up', 3],
  ] as const;
  const semicolonMoveReceipts = semicolonMoveCases.map(([name, direction, rowIndex]) => {
    const context = contextualImportContextFor(canonicalCorpus, rowMoveSemicolonLua);
    const catalog = catalogFor(context);
    const entry = (catalog.moveEntries || []).find(candidate => candidate.kind === 'move-row'
      && candidate.direction === direction && candidate.rowIndex === rowIndex);
    if (!entry) return { name, issued: false, accepted: false, inverseAccepted: false };
    const before = sourceTextAt(context, entry.path);
    const otherFiles = context.workspace.passthroughFiles?.filter(file => file.path !== entry.path) || [];
    const result = applyX4UiSourceRowMove(context.workspace, context.source, catalog, { entry });
    if (result.accepted === false) return { name, issued: true, accepted: false, reason: result.reason, detail: result.detail };
    const movedText = sourceTextAt(result, entry.path);
    const expectedText = before.slice(0, entry.startOffset) + entry.lower.expectedText + entry.upper.expectedText
      + before.slice(entry.endOffset);
    const movedIndex = direction === 'down' ? rowIndex + 1 : rowIndex - 1;
    const resultOtherFiles = (result.workspace.passthroughFiles || []).filter(file => file.path !== entry.path);
    const otherFilesUnchanged = resultOtherFiles.length === otherFiles.length
      && JSON.stringify(resultOtherFiles) === JSON.stringify(otherFiles);
    const inverseEntry = (result.catalog.moveEntries || []).find(candidate => candidate.kind === 'move-row'
      && candidate.direction !== direction && candidate.rowIndex === movedIndex
      && candidate.rowId === result.movedRow.rowId);
    const inverse = inverseEntry
      ? applyX4UiSourceRowMove(result.workspace, result.source, result.catalog, { entry: inverseEntry })
      : undefined;
    return {
      name,
      issued: true,
      accepted: true,
      inverseAccepted: inverse?.accepted === true,
      exactSwap: movedText === expectedText,
      exactRoundTrip: inverse?.accepted === true && sourceTextAt(inverse, entry.path) === before,
      freshProof: result.movedRow.rowIndex === movedIndex && result.movedRow.cellIds.length === 3
        && result.movedRow.rowId !== result.entry.rowId,
      formatting: movedText.startsWith('\uFEFF') && !movedText.replaceAll('\r\n', '').includes('\n')
        && otherFilesUnchanged,
      otherFilesCount: resultOtherFiles.length,
    };
  });
  console.log(`x4UiSourceEdits B119 no-indent semicolon span move matrix: ${JSON.stringify(semicolonMoveReceipts)}`);
  check('B119 first/middle/last no-indent semicolon span moves preserve BOM CRLF bytes and inverse proof',
    semicolonMoveReceipts.every(receipt => receipt.issued && receipt.accepted && receipt.inverseAccepted
      && receipt.exactSwap && receipt.exactRoundTrip && receipt.freshProof && receipt.formatting),
    JSON.stringify(semicolonMoveReceipts));
  const firstPhaseContext = contextualImportContextFor(canonicalCorpus, rowMoveSemicolonLua);
  const firstPhaseCatalog = catalogFor(firstPhaseContext);
  const firstPhaseEntry = (firstPhaseCatalog.moveEntries || []).find(entry => entry.kind === 'move-row'
    && entry.direction === 'down' && entry.rowIndex === 1);
  if (!firstPhaseEntry) throw new Error('first-row phase move authority was not issued');
  const firstPhaseBeforeText = sourceTextAt(firstPhaseContext, firstPhaseEntry.path);
  const firstPhaseResult = applyX4UiSourceRowMove(firstPhaseContext.workspace, firstPhaseContext.source,
    firstPhaseCatalog, { entry: firstPhaseEntry });
  if (firstPhaseResult.accepted === false) throw new Error('first-row phase move did not accept');
  const firstPhaseAfterContext = sessionContextFor(
    firstPhaseResult.workspace,
    canonicalCorpus,
    firstPhaseEntry.path,
    target => target.kind === 'function' && target.name === 'menu.createFrame',
    'B119 first-row phase moved source',
  );
  const firstPhaseBeforeFile = firstPhaseContext.source.bundle!.sourceFiles.find(file => file.path === firstPhaseEntry.path)!;
  const firstPhaseAfterFile = firstPhaseAfterContext.source.bundle!.sourceFiles.find(file => file.path === firstPhaseEntry.path)!;
  const firstPhaseLedger: Parameters<typeof compareX4UiSourceStructuralLedgerCorrespondence>[0] = {
    beforeCalls: firstPhaseBeforeFile.callModel.calls,
    afterCalls: firstPhaseAfterFile.callModel.calls,
    beforeRecords: firstPhaseBeforeFile.callModel.records,
    afterRecords: firstPhaseAfterFile.callModel.records,
    beforeOperations: firstPhaseContext.program.operations,
    afterOperations: firstPhaseAfterContext.program.operations,
    entry: firstPhaseResult.entry,
    beforeText: firstPhaseBeforeText,
    afterText: sourceTextAt(firstPhaseResult, firstPhaseEntry.path),
    replacementLength: firstPhaseResult.replacement.length,
    insertedCallIndex: -1,
    insertedOperationIndex: -1,
  };
  const firstPhaseBeforeOperationIndex = firstPhaseContext.program.operations.findIndex(operation =>
    operation.id === firstPhaseEntry.upper.creatorOperationId);
  const firstPhaseAfterOperationIndex = firstPhaseAfterContext.program.operations.findIndex(operation =>
    operation.id === firstPhaseResult.movedRow.creatorOperationId);
  const firstPhaseKernelMutations: readonly [string, (input: typeof firstPhaseLedger) => void][] = [
    ['before columns', input => {
      const state = asRecord(asRecord(input.beforeOperations[firstPhaseBeforeOperationIndex])!.kernel)!.stateBefore;
      const columns = asRecord(state)!.columns as Record<string, unknown>[];
      columns[0].width = Number(columns[0].width) + 1;
    }],
    ['before final flag', input => {
      const state = asRecord(asRecord(input.beforeOperations[firstPhaseBeforeOperationIndex])!.kernel)!.stateBefore;
      asRecord(state)!.final = true;
    }],
    ['after columns', input => {
      const state = asRecord(asRecord(input.afterOperations[firstPhaseAfterOperationIndex])!.kernel)!.stateBefore;
      const columns = asRecord(state)!.columns as Record<string, unknown>[];
      columns[0].width = Number(columns[0].width) + 1;
    }],
    ['after final flag', input => {
      const state = asRecord(asRecord(input.afterOperations[firstPhaseAfterOperationIndex])!.kernel)!.stateBefore;
      asRecord(state)!.final = false;
    }],
  ];
  const firstPhaseKernelReceipts = firstPhaseKernelMutations.map(([name, mutate]) => {
    const input = structuredClone(firstPhaseLedger);
    const before = JSON.stringify(input);
    mutate(input);
    return { name, changed: JSON.stringify(input) !== before, accepted: compareX4UiSourceStructuralLedgerCorrespondence(input) };
  });
  const firstPhaseLedgerBaseline = compareX4UiSourceStructuralLedgerCorrespondence(firstPhaseLedger);
  console.log(`x4UiSourceEdits B119 first-row finalization kernel negatives: ${JSON.stringify({
    baseline: firstPhaseLedgerBaseline,
    cases: firstPhaseKernelMutations.length,
    refused: firstPhaseKernelReceipts.filter(receipt => !receipt.accepted).length,
  })}`);
  check('B119 first-row finalization proves helper columns and final flag without normalization',
    firstPhaseLedgerBaseline && firstPhaseKernelReceipts.every(receipt => receipt.changed && !receipt.accepted),
    JSON.stringify(firstPhaseKernelReceipts));
  const unknownMoveLua = rowMoveSemicolonLua.replace(
    'second[1]:setColSpan(2); -- second span',
    'mutate(ftable); -- unknown executable side effect inside the row block\nsecond[1]:setColSpan(2); -- second span',
  );
  const unknownMoveContext = contextualImportContextFor(canonicalCorpus, unknownMoveLua);
  const unknownMoveCatalog = catalogFor(unknownMoveContext);
  const unknownMoveBefore = JSON.stringify(unknownMoveContext.workspace);
  const unknownMoveReceipt = {
    moveEntries: (unknownMoveCatalog.moveEntries || []).length,
    accepted: unknownMoveCatalog.moveEntries?.some(entry => entry.kind === 'move-row') || false,
    unchanged: JSON.stringify(unknownMoveContext.workspace) === unknownMoveBefore,
  };
  console.log(`x4UiSourceEdits B119 unknown executable move boundary: ${JSON.stringify(unknownMoveReceipt)}`);
  check('B119 unknown executable side effects inside row byte blocks issue no move authority',
    unknownMoveReceipt.moveEntries === 0 && !unknownMoveReceipt.accepted && unknownMoveReceipt.unchanged,
    JSON.stringify(unknownMoveReceipt));
  const moveImportRefusalCases = [
    ['aliased and rebound table receiver', rowMoveSemicolonLua
      .replace('local first = ftable:addRow(false, {});',
        'local alias = ftable;\r\nlocal first = alias:addRow(false, {});')
      .replace('local second = ftable:addRow(false, {});',
        'alias = ftable;\r\nlocal second = ftable:addRow(false, {});')],
    ['rebound table owner', rowMoveSemicolonLua.replace(
      'local first = ftable:addRow(false, {});',
      'ftable = ftable;\r\nlocal first = ftable:addRow(false, {});',
    )],
    ['cross-row reference after both blocks', rowMoveSemicolonLua.replace(
      'frame:display();',
      'first[1] = third[1];\r\nframe:display();',
    )],
    ['interleaved executable side effect', unknownMoveLua],
  ] as const;
  const moveImportRefusalReceipts = moveImportRefusalCases.map(([name, lua]) => {
    const context = contextualImportContextFor(canonicalCorpus, lua);
    const catalog = catalogFor(context);
    const before = JSON.stringify(context.workspace);
    const moveEntries = catalog.moveEntries || [];
    return {
      name,
      moveEntries: moveEntries.length,
      accepted: moveEntries.some(entry => entry.kind === 'move-row'),
      unchanged: JSON.stringify(context.workspace) === before,
    };
  });
  console.log(`x4UiSourceEdits B119 imported move refusal matrix: ${JSON.stringify(moveImportRefusalReceipts)}`);
  check('B119 imported alias/rebinding cross-row reference and interleaved execution issue no move authority',
    moveImportRefusalReceipts.every(receipt => receipt.moveEntries === 0 && !receipt.accepted && receipt.unchanged),
    JSON.stringify(moveImportRefusalReceipts));
  const safeStaticAliasLua = rowMoveSemicolonLua.replace(
    'local first = ftable:addRow(false, {});',
    'local alias = ftable;\r\nlocal first = alias:addRow(false, {});',
  );
  const safeStaticAliasContext = contextualImportContextFor(canonicalCorpus, safeStaticAliasLua);
  const safeStaticAliasCatalog = catalogFor(safeStaticAliasContext);
  const safeStaticAliasEntry = rowMoveEntryFor(safeStaticAliasCatalog, 'down', 1);
  const safeStaticAliasBefore = sourceTextAt(safeStaticAliasContext, safeStaticAliasEntry.path);
  const safeStaticAliasMove = acceptedMove(applyX4UiSourceRowMove(
    safeStaticAliasContext.workspace,
    safeStaticAliasContext.source,
    safeStaticAliasCatalog,
    { entry: safeStaticAliasEntry },
  ));
  const safeStaticAliasInverseEntry = (safeStaticAliasMove.catalog.moveEntries || []).find(entry => entry.kind === 'move-row'
    && entry.direction === 'up' && entry.rowIndex === 2 && entry.rowId === safeStaticAliasMove.movedRow.rowId);
  if (!safeStaticAliasInverseEntry) throw new Error('safe static alias inverse move authority was not issued');
  const safeStaticAliasInverse = acceptedMove(applyX4UiSourceRowMove(
    safeStaticAliasMove.workspace,
    safeStaticAliasMove.source,
    safeStaticAliasMove.catalog,
    { entry: safeStaticAliasInverseEntry },
  ));
  const safeStaticAliasExpected = safeStaticAliasBefore.slice(0, safeStaticAliasEntry.startOffset)
    + safeStaticAliasEntry.lower.expectedText + safeStaticAliasEntry.upper.expectedText
    + safeStaticAliasBefore.slice(safeStaticAliasEntry.endOffset);
  const safeStaticAliasReceipt = {
    luaChange: 'local alias = ftable; then local first = alias:addRow(false, {}); with no rebinding',
    moveEntries: (safeStaticAliasCatalog.moveEntries || []).length,
    accepted: safeStaticAliasMove.accepted,
    inverseAccepted: safeStaticAliasInverse.accepted,
    exactSwap: sourceTextAt(safeStaticAliasMove, safeStaticAliasEntry.path) === safeStaticAliasExpected,
    exactRoundTrip: sourceTextAt(safeStaticAliasInverse, safeStaticAliasEntry.path) === safeStaticAliasBefore,
    freshProof: safeStaticAliasMove.movedRow.rowId !== safeStaticAliasEntry.rowId
      && safeStaticAliasMove.movedRow.rowIndex === 2
      && safeStaticAliasMove.movedRow.cellIds.length === 3,
  };
  console.log(`x4UiSourceEdits B119 imported static alias positive: ${JSON.stringify(safeStaticAliasReceipt)}`);
  check('B119 imported static table alias retains safe exact row move authority and inverse',
    safeStaticAliasReceipt.moveEntries === 4 && safeStaticAliasReceipt.accepted
      && safeStaticAliasReceipt.inverseAccepted && safeStaticAliasReceipt.exactSwap
      && safeStaticAliasReceipt.exactRoundTrip && safeStaticAliasReceipt.freshProof,
    JSON.stringify(safeStaticAliasReceipt));
  const moveBoundaryBefore = JSON.stringify(moveProducer.workspace);
  const forgedMoveEntry = { ...moveProducerEntry, expectedText: 'forged' };
  const wrongMoveTarget = { ...moveProducerEntry, path: 'ui/not-the-selected-target.lua' };
  const moveBoundaryRequests: readonly [string, ModWorkspace, X4UiWorkspaceSource, X4UiSourceEditCatalog, unknown][] = [
    ['cloned entry', moveProducer.workspace, moveProducer.source, moveProducerCatalog, { entry: structuredClone(moveProducerEntry) }],
    ['forged entry', moveProducer.workspace, moveProducer.source, moveProducerCatalog, { entry: forgedMoveEntry }],
    ['wrong target', moveProducer.workspace, moveProducer.source, moveProducerCatalog, { entry: wrongMoveTarget }],
    ['cloned catalog', moveProducer.workspace, moveProducer.source, structuredClone(moveProducerCatalog), { entry: moveProducerEntry }],
    ['cloned source', moveProducer.workspace, structuredClone(moveProducer.source), moveProducerCatalog, { entry: moveProducerEntry }],
    ['cloned workspace', structuredClone(moveProducer.workspace), moveProducer.source, moveProducerCatalog, { entry: moveProducerEntry }],
    ['stale catalog after move', firstProducerMove.workspace, firstProducerMove.source, moveProducerCatalog, { entry: moveProducerEntry }],
    ['unknown source entry', moveProducer.workspace, moveProducer.source, moveProducerCatalog, { entry: { ...moveProducerEntry, id: 'unknown-source-entry' } }],
  ];
  const moveBoundaryReceipts = moveBoundaryRequests.map(([name, currentWorkspace, source, catalog, request]) => {
    const result = applyX4UiSourceRowMove(currentWorkspace, source, catalog, request as X4UiSourceEditRowMoveRequest);
    return { name, accepted: result.accepted, changed: result.changed, reason: result.accepted === false ? result.reason : undefined };
  });
  let getterReads = 0;
  const getterMoveRequest = Object.defineProperty({ entry: moveProducerEntry }, 'entry', {
    enumerable: true,
    configurable: true,
    get: () => { getterReads += 1; throw new Error('move entry getter executed'); },
  });
  const getterMoveResult = applyX4UiSourceRowMove(moveProducer.workspace, moveProducer.source, moveProducerCatalog,
    getterMoveRequest as X4UiSourceEditRowMoveRequest);
  const staleMoveResult = applyX4UiSourceRowMove(moveProducer.workspace, moveProducer.source, moveProducerCatalog,
    { entry: moveProducerEntry, expected: {
      path: moveProducerEntry.path,
      startOffset: moveProducerEntry.startOffset,
      endOffset: moveProducerEntry.endOffset,
      expectedText: 'stale move CAS',
    } });
  const rawMoveResult = applyX4UiSourceStructuralEdit(moveProducer.workspace, moveProducer.source, moveProducerCatalog,
    moveProducerEntry.id);
  check('B119 move rejects cloned foreign forged stale wrong-target unknown-source and getter boundaries atomically',
    moveBoundaryReceipts.every(receipt => !receipt.accepted && !receipt.changed)
      && getterReads === 0 && getterMoveResult.accepted === false && !getterMoveResult.changed
      && staleMoveResult.accepted === false && !staleMoveResult.changed
      && rawMoveResult.accepted === false && !rawMoveResult.changed
      && JSON.stringify(moveProducer.workspace) === moveBoundaryBefore,
    JSON.stringify({ boundaries: moveBoundaryReceipts, getterReads, getter: getterMoveResult.accepted,
      stale: staleMoveResult.accepted, raw: rawMoveResult.accepted }));
  const contextualEmptyCellEntries = (contextualProducerCatalog.insertEntries || [])
    .filter(entry => entry.kind === 'insert-widget');
  const contextualProducerReceipt = {
    path: contextualProducer.program.target.source.file,
    target: {
      kind: contextualProducer.program.target.kind,
      name: contextualProducer.program.target.name,
    },
    programStatus: contextualProducer.program.status,
    allOperationsApplied: contextualProducer.program.operations.every(operation => operation.status === 'applied'),
    catalogStatus: contextualProducerCatalog.status,
    catalogReason: contextualProducerCatalog.reason,
    insertEntryKinds: (contextualProducerCatalog.insertEntries || []).map(entry => entry.kind),
    contextualEmptyCellEntries: contextualEmptyCellEntries.map(entry => ({
      column: entry.column, frameId: entry.frameId, tableId: entry.tableId, rowId: entry.rowId, cellId: entry.cellId,
    })),
  };
  console.log(`x4UiSourceEdits B119 contextual insertion producer scaffold: ${JSON.stringify(contextualProducerReceipt)}`);
  check('B119 contextual insertion producer exposes the exact empty uncovered cell authority',
    contextualProducer.program.target.kind === 'function'
      && contextualProducer.program.target.name === 'menu.createFrame'
      && (contextualProducer.program.status === 'projected' || contextualProducer.program.status === 'partial')
      && contextualProducer.program.operations.every(operation => operation.status === 'applied')
      && contextualEmptyCellEntries.length === 1
      && contextualEmptyCellEntries[0].column === 2,
    JSON.stringify(contextualProducerReceipt));
  for (const widget of ['text', 'button', 'input'] as const) {
    const widgetContext = createdMenuSessionContextFor(canonicalCorpus);
    const widgetCatalog = catalogFor(widgetContext);
    const widgetEntry = contextualWidgetEntryFor(widgetCatalog);
    const widgetText = `${widget} literal "quotes" \\slash\n-- comment-looking [==[text]==]`;
    const widgetRequest: X4UiSourceEditWidgetInsertionRequest = {
      entry: widgetEntry,
      widget,
      text: widgetText,
    };
    const widgetResult = acceptedWidget(applyX4UiSourceWidgetInsertion(
      widgetContext.workspace,
      widgetContext.source,
      widgetCatalog,
      widgetRequest,
    ));
    const widgetAfter = sessionContextFor(
      widgetResult.workspace,
      canonicalCorpus,
      widgetEntry.path,
      target => target.kind === 'function' && target.name === 'menu.createFrame',
      `contextual ${widget} insertion`,
    );
    const widgetAfterFile = widgetAfter.source.bundle?.sourceFiles.find(file => file.path === widgetEntry.path);
    const expectedCreatorNames = widget === 'text'
      ? ['createText']
      : widget === 'button'
        ? ['createButton', 'setText']
        : ['createEditBox'];
    const insertedOperations = widgetAfter.program.operations
      .filter(operation => operation.source.file === widgetEntry.path
        && operation.source.start.offset >= widgetResult.startOffset
        && operation.source.end.offset <= widgetResult.startOffset + widgetResult.replacement.length)
      .sort((left, right) => left.source.start.offset - right.source.start.offset);
    const creatorOperation = widgetAfter.program.operations.find(operation =>
      operation.id === widgetResult.insertedWidget.creatorOperationId);
    const insertedCalls = (widgetAfterFile?.callModel.calls || [])
      .filter(call => call.source.file === widgetEntry.path
        && call.source.start.offset >= widgetResult.startOffset
        && call.source.end.offset <= widgetResult.startOffset + widgetResult.replacement.length)
      .sort((left, right) => left.source.start.offset - right.source.start.offset);
    const insertedCellStillIssued = (widgetResult.catalog.insertEntries || [])
      .some(entry => entry.kind === 'insert-widget' && entry.cellId === widgetEntry.cellId);
    const insertedValue = widget === 'input'
      ? insertedCalls[0]?.semantics.editBox?.defaultText
      : insertedCalls[widget === 'button' ? 1 : 0]?.semantics.text;
    const afterTable = widgetAfter.program.tables.find(table => table.id === creatorOperation?.tableId);
    const afterRow = widgetAfter.program.rows.find(row => row.id === creatorOperation?.rowId);
    const afterCell = widgetAfter.program.cells.find(cell => cell.id === creatorOperation?.cellId);
    const widgetReceipt = {
      widget,
      accepted: true,
      changed: widgetResult.changed,
      reparsed: widgetResult.reparsed,
      byteLocal: widgetResult.byteLocal,
      path: widgetResult.path,
      startOffset: widgetResult.startOffset,
      endOffset: widgetResult.endOffset,
      replacement: widgetResult.replacement,
      insertedWidget: widgetResult.insertedWidget,
      insertedOperationKinds: insertedOperations.map(operation => operation.kind),
      insertedCallNames: insertedCalls.map(call => call.name),
      creatorOperation: creatorOperation ? {
        id: creatorOperation.id,
        kind: creatorOperation.kind,
        status: creatorOperation.status,
        tableId: creatorOperation.tableId,
        rowId: creatorOperation.rowId,
        cellId: creatorOperation.cellId,
      } : undefined,
      freshCatalogCellEntry: insertedCellStillIssued,
      decodedText: insertedValue?.value,
    };
    check(`B119 contextual ${widget} insertion accepts the producer-issued empty cell`,
      widgetResult.changed
        && widgetResult.reparsed
        && widgetResult.provenanceReestablished
        && widgetResult.path === widgetEntry.path
        && widgetResult.startOffset === widgetEntry.startOffset
        && widgetResult.endOffset === widgetEntry.endOffset
        && widgetResult.expectedText === ''
        && insertedOperations.map(operation => operation.kind).join('|') === expectedCreatorNames.join('|')
        && insertedCalls.map(call => call.name).join('|') === expectedCreatorNames.join('|')
        && creatorOperation?.kind === expectedCreatorNames[0]
        && creatorOperation.status === 'applied'
        && creatorOperation.tableId === widgetEntry.tableId
        && creatorOperation.rowId === widgetEntry.rowId
        && creatorOperation.cellId === widgetEntry.cellId
        && afterTable?.frameId === widgetResult.insertedWidget.frameId
        && afterRow?.tableId === afterTable?.id
        && afterCell?.rowId === afterRow?.id
        && afterCell?.column === widgetEntry.column
        && widgetResult.insertedWidget.widget === widget
        && widgetResult.insertedWidget.frameId === widgetEntry.frameId
        && widgetResult.insertedWidget.tableId === widgetEntry.tableId
        && widgetResult.insertedWidget.rowId === widgetEntry.rowId
        && widgetResult.insertedWidget.cellId === widgetEntry.cellId
        && widgetResult.insertedWidget.creatorCallName === expectedCreatorNames[0]
        && JSON.stringify(widgetResult.insertedWidget.creatorSource) === JSON.stringify(creatorOperation?.source)
        && JSON.stringify(widgetResult.insertedWidget.sourceIdentity) === JSON.stringify(widgetAfter.program.target.sourceIdentity)
        && !insertedCellStillIssued,
      JSON.stringify(widgetReceipt));
    check(`B119 contextual ${widget} insertion preserves the literal value and exact owner chain`,
      insertedValue?.status === 'static' && insertedValue.type === 'string' && insertedValue.value === widgetText
        && insertedOperations.every(operation => operation.status === 'applied' && !operation.localExpansion
          && operation.tableId === widgetEntry.tableId
          && operation.rowId === widgetEntry.rowId
          && operation.cellId === widgetEntry.cellId),
      JSON.stringify(widgetReceipt));
  }
  {
    const reviewWorkspace = workspace(automaticHeightReviewLua, {
      id: 'b119-batch-1a-automatic-height-review',
      name: 'B119 Batch1A automatic-height review selftest',
      passthroughFiles: [
        passthrough('README.md', '# unrelated review bytes\n', { reason: 'unknown_domain' }),
        passthrough('ui.xml', automaticHeightReviewXml, { reason: 'partial', bytes: automaticHeightReviewXml.length }),
        passthrough(automaticHeightReviewPath, automaticHeightReviewLua, { reason: 'unparsed', bytes: automaticHeightReviewLua.length }),
      ],
    });
    const reviewContext = automaticHeightSessionContextFor(reviewWorkspace, canonicalCorpus);
    const reviewCatalog = catalogFor(reviewContext);
    const reviewButton = editableField(reviewCatalog, 'string', 'arguments[0]', '"Button caption"', 'setText');
    const reviewText = editableField(reviewCatalog, 'string', 'arguments[0]', '"Review text"', 'createText');
    const reviewSecondText = editableField(reviewCatalog, 'string', 'arguments[0]', '"Second row"', 'createText');
    const unrelatedBefore = JSON.stringify((reviewWorkspace.passthroughFiles || [])
      .filter(file => file.path !== automaticHeightReviewPath));
    const reviewInitialReceipt = {
      sessionStatus: reviewContext.program.status,
      operations: reviewContext.program.operations.map(operation => ({ kind: operation.kind, status: operation.status })),
      catalogStatus: reviewCatalog.status,
      editableEntries: reviewCatalog.editableEntries.length,
      button: { id: reviewButton.id, expectedText: reviewButton.expectedText },
      text: { id: reviewText.id, expectedText: reviewText.expectedText },
      secondText: { id: reviewSecondText.id, expectedText: reviewSecondText.expectedText },
    };
    console.log(`x4UiSourceEdits B119 Batch1A automatic-height initial: ${JSON.stringify(reviewInitialReceipt)}`);
    check('B119 Batch1A real Session automatic-height fixture is initially actionable',
      reviewContext.program.status === 'projected'
        && reviewContext.program.operations.every(operation => operation.status === 'applied')
        && reviewCatalog.status === 'ready'
        && reviewCatalog.editableEntries.some(entry => entry.provenance.callName === 'setText' && entry.expectedText === '"Button caption"')
        && reviewCatalog.editableEntries.some(entry => entry.provenance.callName === 'createText' && entry.expectedText === '"Review text"')
        && reviewCatalog.editableEntries.some(entry => entry.provenance.callName === 'createText' && entry.expectedText === '"Second row"'),
      JSON.stringify(reviewInitialReceipt));

    const buttonResult = applyX4UiSourceEdit(
      reviewContext.workspace,
      reviewContext.source,
      reviewCatalog,
      reviewButton.id,
      'Changed caption',
    );
    const buttonReceipt = buttonResult.accepted === true
      ? {
        accepted: true,
        changed: buttonResult.changed,
        reparsed: buttonResult.reparsed,
        provenanceReestablished: buttonResult.provenanceReestablished,
        catalogStatus: buttonResult.catalog.status,
        source: sourceTextAt(buttonResult, automaticHeightReviewPath),
      }
      : (() => {
        const refusedButtonResult = refused(buttonResult);
        return {
          accepted: false,
          reason: refusedButtonResult.reason,
          detail: refusedButtonResult.detail,
          source: sourceTextAt(refusedButtonResult, automaticHeightReviewPath),
        };
      })();
    console.log(`x4UiSourceEdits B119 Batch1A automatic-height button-edit: ${JSON.stringify(buttonReceipt)}`);
    check('B119 Batch1A retains canonical corpus through the first automatic-height button reparse',
      buttonResult.accepted
        && buttonResult.changed
        && buttonResult.reparsed
        && buttonResult.provenanceReestablished
        && buttonResult.catalog.status === 'ready'
        && buttonResult.catalog.editableEntries.some(entry => entry.provenance.callName === 'createText' && entry.expectedText === '"Review text"')
        && sourceTextAt(buttonResult, automaticHeightReviewPath).includes('setText("Changed caption")'),
      JSON.stringify(buttonReceipt));
    const firstButtonResult = accepted(buttonResult);

    const freshReviewContext = automaticHeightSessionContextFor(firstButtonResult.workspace, canonicalCorpus);
    const freshReviewCatalog = catalogFor(freshReviewContext);
    const freshReviewButton = editableField(freshReviewCatalog, 'string', 'arguments[0]', '"Changed caption"', 'setText');
    const freshReviewText = editableField(freshReviewCatalog, 'string', 'arguments[0]', '"Review text"', 'createText');
    const freshReviewTextResult = accepted(applyX4UiSourceEdit(
      freshReviewContext.workspace,
      freshReviewContext.source,
      freshReviewCatalog,
      freshReviewText.id,
      'Changed review text',
    ));
    const finalReviewButton = editableField(freshReviewTextResult.catalog, 'string', 'arguments[0]', '"Changed caption"', 'setText');
    const finalReviewResult = accepted(applyX4UiSourceEdit(
      freshReviewTextResult.workspace,
      freshReviewTextResult.source,
      freshReviewTextResult.catalog,
      finalReviewButton.id,
      'Final caption',
    ));
    const unrelatedAfter = JSON.stringify((finalReviewResult.workspace.passthroughFiles || [])
      .filter(file => file.path !== automaticHeightReviewPath));
    const reviewRepeatedReceipt = {
      freshSession: {
        status: freshReviewContext.program.status,
        operations: freshReviewContext.program.operations.map(operation => ({ kind: operation.kind, status: operation.status })),
        catalogStatus: freshReviewCatalog.status,
        freshCatalog: freshReviewCatalog !== reviewCatalog,
        buttonExpectedText: freshReviewButton.expectedText,
      },
      textEdit: {
        changed: freshReviewTextResult.changed,
        reparsed: freshReviewTextResult.reparsed,
        catalogStatus: freshReviewTextResult.catalog.status,
        source: sourceTextAt(freshReviewTextResult, automaticHeightReviewPath),
      },
      repeatedButtonEdit: {
        changed: finalReviewResult.changed,
        reparsed: finalReviewResult.reparsed,
        catalogStatus: finalReviewResult.catalog.status,
        source: sourceTextAt(finalReviewResult, automaticHeightReviewPath),
      },
      unrelatedBytesPreserved: unrelatedBefore === unrelatedAfter,
    };
    console.log(`x4UiSourceEdits B119 Batch1A automatic-height repeated-edits: ${JSON.stringify(reviewRepeatedReceipt)}`);
    check('B119 Batch1A fresh Session catalog supports automatic-height text and repeated button/text edits',
      freshReviewContext.program.status === 'projected'
        && freshReviewContext.program.operations.every(operation => operation.status === 'applied')
        && freshReviewCatalog.status === 'ready'
        && freshReviewCatalog !== reviewCatalog
        && freshReviewTextResult.changed
        && freshReviewTextResult.reparsed
        && finalReviewResult.changed
        && finalReviewResult.reparsed
        && finalReviewResult.catalog.status === 'ready'
        && sourceTextAt(finalReviewResult, automaticHeightReviewPath).includes('createText("Changed review text"')
        && sourceTextAt(finalReviewResult, automaticHeightReviewPath).includes('setText("Final caption")')
        && unrelatedBefore === unrelatedAfter,
      JSON.stringify(reviewRepeatedReceipt));

    const noCorpusReviewContext = automaticHeightSessionContextFor(reviewWorkspace, undefined);
    const noCorpusReviewCatalog = catalogFor(noCorpusReviewContext);
    const noCorpusReceipt = {
      programStatus: noCorpusReviewContext.program.status,
      unresolved: noCorpusReviewContext.program.operations.filter(operation => operation.status !== 'applied')
        .map(operation => ({ kind: operation.kind, status: operation.status })),
      catalogStatus: noCorpusReviewCatalog.status,
      catalogReason: noCorpusReviewCatalog.reason,
    };
    console.log(`x4UiSourceEdits B119 Batch1A automatic-height no-corpus control: ${JSON.stringify(noCorpusReceipt)}`);
    check('B119 Batch1A no-corpus automatic-height control remains honestly unresolved',
      noCorpusReviewContext.program.status === 'partial'
        && noCorpusReceipt.unresolved.length > 0
        && noCorpusReviewCatalog.status === 'locked'
        && noCorpusReviewCatalog.reason === 'operation-not-applied',
      JSON.stringify(noCorpusReceipt));

    const staleReviewWorkspace = structuredClone(reviewContext.workspace) as ModWorkspace;
    const staleReviewBefore = workspaceBytes(staleReviewWorkspace);
    const staleReviewResult = refused(applyX4UiSourceEdit(
      staleReviewWorkspace,
      reviewContext.source,
      reviewCatalog,
      reviewButton.id,
      'Stale caption',
    ));
    const clonedReviewProgram = structuredClone(reviewContext.program) as X4UiLayoutProgram;
    const clonedReviewEvidence = structuredClone(reviewContext.evidenceAuthority) as X4UiLayoutEvidenceAuthority;
    const clonedReviewProgramIssued = isIssuedX4UiLayoutEvidencePair(
      clonedReviewProgram,
      reviewContext.evidenceAuthority,
    );
    const clonedReviewEvidenceIssued = isIssuedX4UiLayoutEvidencePair(
      reviewContext.program,
      clonedReviewEvidence,
    );
    const clonedReviewCatalog = catalogFor({ ...reviewContext, program: clonedReviewProgram });
    const clonedReviewResult = refused(applyX4UiSourceEdit(
      reviewContext.workspace,
      reviewContext.source,
      clonedReviewCatalog,
      reviewButton.id,
      'Forged caption',
    ));
    const negativeReceipt = {
      staleWorkspace: {
        accepted: false,
        reason: staleReviewResult.reason,
        identityPreserved: staleReviewResult.workspace === staleReviewWorkspace
          && workspaceBytes(staleReviewWorkspace) === staleReviewBefore,
      },
      clonedIssuance: {
        programIssued: clonedReviewProgramIssued,
        evidenceIssued: clonedReviewEvidenceIssued,
        catalogStatus: clonedReviewCatalog.status,
        accepted: false,
        reason: clonedReviewResult.reason,
        sourceUnchanged: sourceTextAt(reviewContext, automaticHeightReviewPath)
          === automaticHeightReviewLua,
      },
    };
    console.log(`x4UiSourceEdits B119 Batch1A automatic-height negatives: ${JSON.stringify(negativeReceipt)}`);
    check('B119 Batch1A stale workspace and cloned issuance remain fail-closed',
      staleReviewResult.reason === 'workspace-source-mismatch'
        && staleReviewResult.workspace === staleReviewWorkspace
        && workspaceBytes(staleReviewWorkspace) === staleReviewBefore
        && !clonedReviewProgramIssued
        && !clonedReviewEvidenceIssued
        && clonedReviewCatalog.status === 'locked'
        && clonedReviewResult.accepted === false
        && sourceTextAt(reviewContext, automaticHeightReviewPath) === automaticHeightReviewLua,
      JSON.stringify(negativeReceipt));
  }
  {
  const aliasWorkspace = workspace(aliasSourceLayoutLua, {
    id: 'b119-alias-source-layout-selftest',
    name: 'B119 alias source layout selftest',
    passthroughFiles: [
      passthrough('README.md', '# unchanged\n', { reason: 'unknown_domain' }),
      passthrough('ui.xml', uiXml, { reason: 'partial', bytes: uiXml.length }),
      passthrough('ui/edit.lua', aliasSourceLayoutLua, { reason: 'partial', bytes: aliasSourceLayoutLua.length }),
    ],
  });
  const aliasSource = buildX4UiWorkspaceSource(aliasWorkspace);
  if (!aliasSource.bundle) throw new Error('B119 alias source fixture did not build a bundle');
  const aliasSourceFile = aliasSource.bundle.sourceFiles.find(file => file.path === 'ui/edit.lua');
  if (!aliasSourceFile) throw new Error('B119 alias source fixture Lua file missing');
  const aliasRawModel = aliasSourceFile.callModel;
  // PreviewPipeline's pre-fix clone is intentionally represented here with the
  // same JSON-domain clone, so the receipt captures the old model-view split.
  const aliasPreviewClone = JSON.parse(JSON.stringify(aliasRawModel)) as X4UiCallModel;
  const aliasSourceEditModel = normalizeX4UiSourceEditLayoutModel(aliasRawModel);
  const aliasCanonicalModel = canonicalizeX4UiLayoutModel(aliasRawModel);
  if (!aliasCanonicalModel) throw new Error('B119 alias source fixture canonical model missing');
  const countSourceLiteralKeys = (value: unknown): number => {
    if (Array.isArray(value)) return value.reduce((total, child) => total + countSourceLiteralKeys(child), 0);
    if (value === null || typeof value !== 'object') return 0;
    return Object.entries(value).reduce((total, [key, child]) =>
      total + (key === 'sourceLiteral' ? 1 : 0) + countSourceLiteralKeys(child), 0);
  };
  const modelDifferencePaths = (left: unknown, right: unknown, path = '$'): readonly string[] => {
    if (JSON.stringify(left) === JSON.stringify(right)) return [];
    if (Array.isArray(left) && Array.isArray(right)) {
      const paths: string[] = [];
      const length = Math.max(left.length, right.length);
      for (let index = 0; index < length; index += 1) {
        paths.push(...modelDifferencePaths(left[index], right[index], `${path}[${index}]`));
      }
      return paths;
    }
    if (left !== null && right !== null && typeof left === 'object' && typeof right === 'object'
      && !Array.isArray(left) && !Array.isArray(right)) {
      const paths: string[] = [];
      const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
      for (const key of keys) paths.push(...modelDifferencePaths(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
        `${path}.${key}`,
      ));
      return paths;
    }
    return [path];
  };
  const aliasPreviewOpenMenu = aliasPreviewClone.calls.find(call => call.name === 'OpenMenu');
  const aliasCanonicalOpenMenu = aliasCanonicalModel.calls.find(call => call.name === 'OpenMenu');
  if (!aliasPreviewOpenMenu || !aliasCanonicalOpenMenu) throw new Error('B119 alias OpenMenu call missing');
  const aliasPreviewOpenMenuArgument = asRecord(aliasPreviewOpenMenu.arguments[0]);
  const aliasCanonicalOpenMenuArgument = asRecord(aliasCanonicalOpenMenu.arguments[0]);
  if (!aliasPreviewOpenMenuArgument || !aliasCanonicalOpenMenuArgument) {
    throw new Error('B119 alias OpenMenu argument model missing');
  }
  const aliasModelDifferencePaths = modelDifferencePaths(aliasPreviewClone, aliasCanonicalModel);
  const modelViewDiffIsSourceLiteralOnly = aliasModelDifferencePaths.length > 0
    && aliasModelDifferencePaths.every(path => path.endsWith('.sourceLiteral'));
  const aliasTarget = createX4UiLayoutTargetCatalog(aliasRawModel).targets.find(candidate =>
    candidate.kind === 'function' && candidate.name === 'menu.display');
  if (!aliasTarget) throw new Error('B119 alias source fixture menu.display target missing');
  const aliasPreview = projectX4UiPreviewPipeline({
    source: aliasSource,
    corpus: canonicalCorpus,
    selection: {
      sourceIndex: aliasSourceFile.index,
      path: aliasSourceFile.path,
      sourceIdentity: createX4UiLayoutTargetCatalog(aliasRawModel).sourceIdentity,
      target: aliasTarget,
    },
    profile: {
      id: 'b119-alias-source-layout-profile',
      provenance: 'B119 alias-bearing exact-source layout selftest profile',
      truthGrade: 'supplied',
      source: aliasTarget.sourceIdentity,
      drawable: { width: 1920, height: 1080 },
      uiScale: 1,
    },
  } satisfies X4UiPreviewPipelineInput);
  const aliasPreviewProgram = (aliasPreview as unknown as { program?: unknown }).program as {
    readonly status?: unknown;
    readonly program?: X4UiLayoutProgram;
    readonly evidenceAuthority?: X4UiLayoutEvidenceAuthority;
  } | undefined;
  if (aliasPreviewProgram?.program === undefined || aliasPreviewProgram.evidenceAuthority === undefined) {
    throw new Error(`B119 alias canonical preview refused: ${JSON.stringify({ status: aliasPreview.status, gaps: aliasPreview.gaps })}`);
  }
  const aliasContext: SourceEditFixtureContext = {
    workspace: aliasWorkspace,
    source: aliasSource,
    program: aliasPreviewProgram.program,
    evidenceAuthority: aliasPreviewProgram.evidenceAuthority,
  };
  const aliasCatalog = catalogFor(aliasContext);
  const aliasTextEntry = aliasCatalog.editableEntries.find(entry =>
    entry.valueType === 'string' && entry.provenance.callName === 'createText');
  const aliasBeforeText = sourceText(aliasContext);
  const aliasApply = aliasTextEntry === undefined
    ? undefined
    : applyX4UiSourceEdit(aliasContext.workspace, aliasContext.source, aliasCatalog, aliasTextEntry.id, 'FIXED');
  const aliasPairValidation = validateX4UiLayoutEvidencePair(
    aliasPreviewProgram.program,
    aliasPreviewProgram.evidenceAuthority,
  );
  const aliasProgramSnapshot = JSON.stringify(aliasPreviewProgram.program);
  const aliasEvidenceSnapshot = JSON.stringify(aliasPreviewProgram.evidenceAuthority);
  const aliasMutatedModel = structuredClone(aliasCanonicalModel) as X4UiCallModel;
  const aliasMutatedOpenMenu = aliasMutatedModel.calls.find(call => call.name === 'OpenMenu');
  if (!aliasMutatedOpenMenu) throw new Error('B119 alias mutated model call missing');
  const aliasMutatedArgument = asRecord(aliasMutatedOpenMenu.arguments[0]);
  if (!aliasMutatedArgument) throw new Error('B119 alias mutated model argument missing');
  aliasMutatedArgument.expression = 'forgedAlias';
  const aliasStaleModel = structuredClone(aliasCanonicalModel) as X4UiCallModel;
  (aliasStaleModel.file as unknown as { text: string }).text += '\n';
  const aliasSemanticModel = structuredClone(aliasCanonicalModel) as X4UiCallModel;
  const aliasTextCall = aliasSemanticModel.calls.find(call => call.name === 'createText');
  const aliasTextArgument = asRecord(aliasTextCall?.arguments[0]);
  if (!aliasTextArgument) throw new Error('B119 alias direct-literal call missing');
  aliasTextArgument.expression = '"SEMANTICALLY_DIFFERENT"';
  const aliasDuplicateModel = structuredClone(aliasCanonicalModel) as X4UiCallModel;
  (aliasDuplicateModel as unknown as { calls: X4UiCallModel['calls'] }).calls = [
    ...aliasDuplicateModel.calls,
    aliasDuplicateModel.calls[0],
  ];
  const aliasForgedProgram = structuredClone(aliasPreviewProgram.program) as X4UiLayoutProgram;
  const aliasForgedEvidence = structuredClone(aliasPreviewProgram.evidenceAuthority) as X4UiLayoutEvidenceAuthority;
  const aliasPostFixReceipt = {
    sourceHash: aliasPreviewProgram.program.target.sourceIdentity.sha256,
    target: aliasPreviewProgram.program.target.name,
    previewStatus: aliasPreview.status,
    programStatus: aliasPreviewProgram.program.status,
    issuedCanonicalModel: isIssuedX4UiLayoutEvidencePairForModel(
      aliasPreviewProgram.program,
      aliasPreviewProgram.evidenceAuthority,
      aliasSourceEditModel,
    ),
    catalog: {
      status: aliasCatalog.status,
      reason: aliasCatalog.reason,
      detail: aliasCatalog.detail,
      editableEntries: aliasCatalog.editableEntries.length,
    },
    gameTruth: aliasPreview.gameTruth,
  };
  console.log(`x4UiSourceEdits B119 fail-first causal receipt: ${JSON.stringify({
    sourceHash: aliasPreviewProgram.program.target.sourceIdentity.sha256,
    target: aliasPreviewProgram.program.target.name,
    rawSourceLiteralKeys: countSourceLiteralKeys(aliasPreviewClone),
    sourceEditSourceLiteralKeys: countSourceLiteralKeys(aliasSourceEditModel),
    modelViewDiffIsSourceLiteralOnly,
    aliasModelDifferencePaths,
    preFixCatalog: {
      status: 'locked',
      reason: 'provenance-drift',
      detail: 'layout evidence pair was not issued for the canonical complete source call model',
      contextSuffix: 'catalog:source:missing',
    },
  })}`);
  console.log(`x4UiSourceEdits B119 post-fix causal receipt: ${JSON.stringify(aliasPostFixReceipt)}`);
  aliasPreviewOpenMenuArgument.expression = 'forgedAlias';
  const aliasPreviewCloneMutationRejected = !isIssuedX4UiLayoutEvidencePairForModel(
    aliasPreviewProgram.program,
    aliasPreviewProgram.evidenceAuthority,
    aliasPreviewClone,
  );
  check('B119 fail-first fixture isolates the pre-fix model-view mismatch to one alias sourceLiteral',
    aliasPreviewProgram.program.target.sourceIdentity.sha256 === 'C6224D9D9E31DB88B0E74B4B947D9A2F6B82B06B9AD4D4DD43A69E2413AFCDF2'
      && countSourceLiteralKeys(aliasPreviewClone) > countSourceLiteralKeys(aliasSourceEditModel)
      && Object.prototype.hasOwnProperty.call(aliasPreviewOpenMenuArgument, 'sourceLiteral')
      && !Object.prototype.hasOwnProperty.call(aliasCanonicalOpenMenuArgument, 'sourceLiteral')
      && modelViewDiffIsSourceLiteralOnly,
    JSON.stringify({
      sourceHash: aliasPreviewProgram.program.target.sourceIdentity.sha256,
      rawSourceLiteralKeys: countSourceLiteralKeys(aliasPreviewClone),
      sourceEditSourceLiteralKeys: countSourceLiteralKeys(aliasSourceEditModel),
      modelViewDiffIsSourceLiteralOnly,
    }));
  check('B119 repaired PreviewPipeline issuance reconciles SourceEdits without provenance drift',
    aliasPostFixReceipt.issuedCanonicalModel
      && JSON.stringify(aliasSourceEditModel) === JSON.stringify(aliasCanonicalModel)
      && aliasCatalog.status === 'ready'
      && aliasCatalog.reason === undefined
      && aliasCatalog.editableEntries.length > 0
      && aliasCatalog.detail === 'direct source literals are available for bounded CAS editing'
      && aliasApply?.accepted === true
      && aliasApply.changed
      && sourceText(aliasContext) === aliasBeforeText,
    JSON.stringify(aliasPostFixReceipt));
  check('B119 repaired pair preserves identity, source/target binding, complete proof, and game-truth invariant',
    isIssuedX4UiLayoutEvidencePair(aliasPreviewProgram.program, aliasPreviewProgram.evidenceAuthority)
      && aliasPairValidation.valid
      && aliasPreviewProgram.program.target.id === aliasPreviewProgram.evidenceAuthority.targetId
      && JSON.stringify(aliasPreviewProgram.program.target.source) === JSON.stringify(aliasPreviewProgram.evidenceAuthority.targetSource)
      && JSON.stringify(aliasPreviewProgram.program.target.sourceIdentity) === JSON.stringify(aliasCatalog.sourceIdentity)
      && aliasPreviewProgram.program.analysis.parsed
      && aliasPreviewProgram.program.analysis.profile === 'complete'
      && aliasPreviewProgram.program.verification.game === 'Not verified in game'
      && aliasPreviewProgram.evidenceAuthority.version === 3,
    JSON.stringify({ validation: aliasPairValidation, target: aliasPreviewProgram.program.target }));
  check('B119 mutated, stale, semantic, duplicate, and forged authorities remain rejected',
    !isIssuedX4UiLayoutEvidencePairForModel(aliasPreviewProgram.program, aliasPreviewProgram.evidenceAuthority, aliasMutatedModel)
      && !isIssuedX4UiLayoutEvidencePairForModel(aliasPreviewProgram.program, aliasPreviewProgram.evidenceAuthority, aliasStaleModel)
      && !isIssuedX4UiLayoutEvidencePairForModel(aliasPreviewProgram.program, aliasPreviewProgram.evidenceAuthority, aliasSemanticModel)
      && aliasPreviewCloneMutationRejected
      && normalizationMessage(aliasDuplicateModel) === 'source edit layout model contains duplicate call/evidence'
      && !isIssuedX4UiLayoutEvidencePairForModel(aliasPreviewProgram.program, aliasPreviewProgram.evidenceAuthority, aliasDuplicateModel)
      && !isIssuedX4UiLayoutEvidencePair(aliasForgedProgram, aliasPreviewProgram.evidenceAuthority)
      && !isIssuedX4UiLayoutEvidencePair(aliasPreviewProgram.program, aliasForgedEvidence),
    JSON.stringify({
      mutated: isIssuedX4UiLayoutEvidencePairForModel(aliasPreviewProgram.program, aliasPreviewProgram.evidenceAuthority, aliasMutatedModel),
      stale: isIssuedX4UiLayoutEvidencePairForModel(aliasPreviewProgram.program, aliasPreviewProgram.evidenceAuthority, aliasStaleModel),
      semantic: isIssuedX4UiLayoutEvidencePairForModel(aliasPreviewProgram.program, aliasPreviewProgram.evidenceAuthority, aliasSemanticModel),
      previewCloneMutationRejected: aliasPreviewCloneMutationRejected,
      duplicate: normalizationMessage(aliasDuplicateModel),
      forgedProgram: isIssuedX4UiLayoutEvidencePair(aliasForgedProgram, aliasPreviewProgram.evidenceAuthority),
      forgedEvidence: isIssuedX4UiLayoutEvidencePair(aliasPreviewProgram.program, aliasForgedEvidence),
    }));
  check('B119 model normalization retains direct-literal provenance and issued snapshots remain immutable',
    Object.prototype.hasOwnProperty.call(aliasTextArgument, 'sourceLiteral')
      && JSON.stringify(aliasTextArgument.sourceLiteral) === JSON.stringify(aliasTextArgument.location)
      && JSON.stringify(aliasSourceEditModel) === JSON.stringify(aliasCanonicalModel)
      && aliasPreviewCloneMutationRejected
      && JSON.stringify(aliasPreviewProgram.program) === aliasProgramSnapshot
      && JSON.stringify(aliasPreviewProgram.evidenceAuthority) === aliasEvidenceSnapshot,
    JSON.stringify({
      directLiteralSourceLiteral: aliasTextArgument.sourceLiteral,
      previewCloneMutationRejected: aliasPreviewCloneMutationRejected,
      programSnapshotStable: JSON.stringify(aliasPreviewProgram.program) === aliasProgramSnapshot,
      evidenceSnapshotStable: JSON.stringify(aliasPreviewProgram.evidenceAuthority) === aliasEvidenceSnapshot,
    }));
  }
  const canonicalRawAttackRows = [
    {
      name: 'raw selected call identity drift',
      mutate: (model: X4UiCallModel): void => {
        const call = model.calls.find(candidate => candidate.order === 67);
        if (!call) throw new Error('canonical raw identity attack call missing');
        (call as unknown as { name: string }).name = 'setText';
      },
    },
    {
      name: 'raw selected call order drift',
      mutate: (model: X4UiCallModel): void => {
        const call = model.calls.find(candidate => candidate.order === 67);
        if (!call) throw new Error('canonical raw order attack call missing');
        (call as unknown as { order: number }).order += 1;
      },
    },
    {
      name: 'raw selected call source drift',
      mutate: (model: X4UiCallModel): void => {
        const call = model.calls.find(candidate => candidate.order === 67);
        if (!call) throw new Error('canonical raw source attack call missing');
        const source = structuredClone(call.source) as { start: { column: number; offset: number } };
        source.start = { ...source.start, column: source.start.column + 1, offset: source.start.offset + 1 };
        (call as unknown as { source: unknown }).source = source;
      },
    },
    {
      name: 'raw canonical helper binding drift',
      mutate: (model: X4UiCallModel): void => {
        const call = model.calls.find(candidate => candidate.order === 67);
        if (!call) throw new Error('canonical raw helper attack call missing');
        const options = structuredClone(call.semantics.options) as { expression: string };
        options.expression = 'Helper.otherProperties';
        (call.semantics as unknown as { options: unknown }).options = options;
      },
    },
  ].map(attack => {
    const attackModel = structuredClone(exactPipelineModel) as X4UiCallModel;
    attack.mutate(attackModel);
    const attackContext = contextWithSourceFileCallModel(exactPipeline, 'ui/pipeline_test.lua', attackModel);
    const outcome = invokePublic(() => catalogFor(attackContext));
    return {
      name: attack.name,
      threw: outcome.threw,
      status: outcome.value?.status,
      reason: outcome.value?.reason,
      editableEntries: outcome.value?.editableEntries.length,
      detail: outcome.value?.detail,
    };
  });
  const canonicalProgramMetadataAttack = structuredClone(exactPipeline.program) as X4UiLayoutProgram;
  const canonicalProgramMetadataOperation = canonicalProgramMetadataAttack.operations.find(operation => operation.modelOrder === 67);
  if (!canonicalProgramMetadataOperation) throw new Error('canonical operation metadata attack operation missing');
  (canonicalProgramMetadataOperation as unknown as { metadata: unknown }).metadata = {
    ...asRecord(canonicalProgramMetadataOperation.metadata),
    __canonicalAttack: true,
  };
  const canonicalBindingMetadataAttack = structuredClone(exactPipeline.evidenceAuthority) as X4UiLayoutEvidenceAuthority;
  const canonicalBindingMetadata = canonicalBindingMetadataAttack.sourceBindings.find(binding => binding.streamIndex === 0);
  if (!canonicalBindingMetadata) throw new Error('canonical binding metadata attack binding missing');
  (canonicalBindingMetadata as unknown as { metadata: unknown }).metadata = {
    ...asRecord(canonicalBindingMetadata.metadata),
    __canonicalAttack: true,
  };
  const canonicalReorderedProgramAttack = structuredClone(exactPipeline.program) as X4UiLayoutProgram;
  (canonicalReorderedProgramAttack.operations as X4UiLayoutOperation[]).reverse();
  const canonicalAuthorityAttackRows = [
    {
      name: 'enriched operation metadata drift',
      context: { ...exactPipeline, program: canonicalProgramMetadataAttack },
    },
    {
      name: 'evidence binding metadata drift',
      context: { ...exactPipeline, evidenceAuthority: canonicalBindingMetadataAttack },
    },
    {
      name: 'issued operation order drift',
      context: { ...exactPipeline, program: canonicalReorderedProgramAttack },
    },
    {
      name: 'unissued cloned program and evidence',
      context: {
        ...exactPipeline,
        program: structuredClone(exactPipeline.program) as X4UiLayoutProgram,
        evidenceAuthority: structuredClone(exactPipeline.evidenceAuthority) as X4UiLayoutEvidenceAuthority,
      },
    },
  ].map(attack => {
    const outcome = invokePublic(() => catalogFor(attack.context));
    return {
      name: attack.name,
      threw: outcome.threw,
      status: outcome.value?.status,
      reason: outcome.value?.reason,
      editableEntries: outcome.value?.editableEntries.length,
      detail: outcome.value?.detail,
    };
  });
  console.log(`x4UiSourceEdits B119 canonical authority attacks: ${JSON.stringify({ raw: canonicalRawAttackRows, issued: canonicalAuthorityAttackRows })}`);
  check('B119 canonical selected-operation raw identity/order/source attacks remain locked',
    canonicalRawAttackRows.every(row => row.threw === false
      && row.status === 'locked'
      && (row.reason === 'unsupported-provenance' || row.reason === 'provenance-drift')
      && row.editableEntries === 0),
    JSON.stringify(canonicalRawAttackRows));
  check('B119 canonical enriched metadata/binding/order/issuance attacks remain locked',
    canonicalAuthorityAttackRows.every(row => row.threw === false
      && row.status === 'locked'
      && (row.reason === 'unsupported-provenance' || row.reason === 'provenance-drift')
      && row.editableEntries === 0),
    JSON.stringify(canonicalAuthorityAttackRows));
  const positionalCatalogOutcome = invokePublic(() => discoverX4UiSourceEdits(
    initial.workspace,
    initial.source,
    initial.program,
    initial.evidenceAuthority,
  ));
  const positionalCountEntry = initialCatalog.editableEntries.find(entry => entry.provenance.callName === 'addTable'
    && entry.provenance.fields.includes('semantics.count'));
  if (!positionalCountEntry) throw new Error('positional fail-first count entry missing');
  const positionalApplyOutcome = invokePublic(() => applyX4UiSourceEdit(
    initial.workspace,
    initial.source,
    initialCatalog,
    positionalCountEntry.id,
    2,
  ));
  let positionalProxyReads = 0;
  const positionalWorkspaceProxy = new Proxy(initial.workspace, {
    get(): never {
      positionalProxyReads += 1;
      throw new Error('positional workspace proxy getter executed');
    },
    getPrototypeOf(): never {
      positionalProxyReads += 1;
      throw new Error('positional workspace proxy prototype trap executed');
    },
  });
  const positionalProxyOutcome = invokePublic(() => discoverX4UiSourceEdits(
    positionalWorkspaceProxy,
    initial.source,
    initial.program,
    initial.evidenceAuthority,
  ));
  const positionalFailFirst = {
    exactDiscovery: {
      threw: positionalCatalogOutcome.threw,
      status: positionalCatalogOutcome.value?.status,
      editable: positionalCatalogOutcome.value?.editable,
    },
    exactApply: {
      threw: positionalApplyOutcome.threw,
      accepted: positionalApplyOutcome.value?.accepted,
      changed: positionalApplyOutcome.value?.changed,
      reason: positionalApplyOutcome.value?.accepted === false ? positionalApplyOutcome.value.reason : undefined,
      detail: positionalApplyOutcome.value?.accepted === false ? positionalApplyOutcome.value.detail : undefined,
    },
    proxyDiscovery: {
      threw: positionalProxyOutcome.threw,
      status: positionalProxyOutcome.value?.status,
      reads: positionalProxyReads,
    },
  };
  console.log(`x4UiSourceEdits 7B-C positional fail-first: ${JSON.stringify(positionalFailFirst)}`);
  check('7B-C positional authority requires issued primitive boundaries before semantic inspection',
    positionalCatalogOutcome.threw === false
      && positionalCatalogOutcome.value?.status === 'ready'
      && positionalCatalogOutcome.value.editable
      && positionalApplyOutcome.threw === false
      && positionalApplyOutcome.value?.accepted === true
      && positionalApplyOutcome.value.changed
      && positionalProxyOutcome.threw === false
      && positionalProxyOutcome.value?.status === 'locked'
      && positionalProxyReads === 0,
    JSON.stringify(positionalFailFirst));
  check('accepted source/call/layout provenance yields editable scalar catalog',
    initialCatalog.status === 'ready'
      && initialCatalog.editableEntries.some(entry => entry.valueType === 'number')
      && initialCatalog.editableEntries.some(entry => entry.valueType === 'string')
      && initialCatalog.editableEntries.some(entry => entry.valueType === 'boolean'),
    JSON.stringify(initialCatalog.entries));
  check('catalog entries are frozen and source ranges match exact UTF-16 bytes',
    Object.isFrozen(initialCatalog)
      && initialCatalog.entries.every(entry => Object.isFrozen(entry))
      && initialCatalog.editableEntries.every(entry => entry.expectedText === sourceText(initial).slice(entry.startOffset, entry.endOffset)),
    JSON.stringify(initialCatalog.editableEntries));
  check('direct call insertion/deletion is absent from the public edit shape',
    !('insert' in initialCatalog) && !('delete' in initialCatalog) && initialCatalog.entries.every(entry => entry.kind === 'editable' || entry.kind === 'locked'));

  const b119Context = contextFor(b119EditBoxLua);
  const b119Catalog = catalogFor(b119Context);
  const b119SimpleHeight = editableField(
    b119Catalog,
    'number',
    'semantics.properties.height',
    '4',
    'setDefaultCellProperties',
  );
  const b119ComplexHotkey = editableField(
    b119Catalog,
    'string',
    'semantics.properties.hotkey',
    '"DEFAULT"',
    'setDefaultComplexCellProperties',
  );
  const b119DirectHotkey = editableField(
    b119Catalog,
    'string',
    'arguments[0]',
    '"DIRECT"',
    'setHotkey',
  );
  const b119DirectDisplayIcon = editableField(
    b119Catalog,
    'boolean',
    'semantics.displayIcon',
    'false',
    'setHotkey',
  );
  const b119BeforeSource = sourceText(b119Context);
  const b119Edited = accepted(apply(b119Context, b119Catalog, b119SimpleHeight, 6));
  check('B119 bounded defaults and direct hotkey fields issue exact source-edit entries and reparse',
    b119Catalog.status === 'ready'
      && b119Catalog.editableEntries.some(entry => entry.provenance.callName === 'setDefaultCellProperties')
      && b119Catalog.editableEntries.some(entry => entry.provenance.callName === 'setDefaultComplexCellProperties')
      && b119Catalog.editableEntries.some(entry => entry.provenance.callName === 'setHotkey')
      && b119SimpleHeight.provenance.callOrder < b119ComplexHotkey.provenance.callOrder
      && b119ComplexHotkey.provenance.callOrder < b119DirectHotkey.provenance.callOrder
      && b119DirectDisplayIcon.provenance.callOrder === b119DirectHotkey.provenance.callOrder
      && b119Edited.changed
      && b119Edited.reparsed
      && b119Edited.provenanceReestablished
      && b119BeforeSource.slice(b119SimpleHeight.startOffset, b119SimpleHeight.endOffset) === '4'
      && sourceText(b119Edited).slice(b119Edited.entry.startOffset, b119Edited.entry.endOffset) === '6',
    JSON.stringify({
      entries: b119Catalog.editableEntries.map(entry => ({
        call: entry.provenance.callName,
        fields: entry.provenance.fields,
        expectedText: entry.expectedText,
      })),
      edited: {
        changed: b119Edited.changed,
        reparsed: b119Edited.reparsed,
        replacement: b119Edited.replacement,
      },
    }));

  const b119AuthorityBeforeBytes = workspaceBytes(b119Context.workspace);
  const b119AuthorityBeforeSource = sourceText(b119Context);
  const b119ForgedCases = [
    {
      name: 'owner',
      catalog: catalogWithEntry(b119Catalog, b119SimpleHeight.id, {
        ...b119SimpleHeight,
        provenance: { ...b119SimpleHeight.provenance, targetId: 'foreign-target' },
      }),
    },
    {
      name: 'order',
      catalog: catalogWithEntry(b119Catalog, b119SimpleHeight.id, {
        ...b119SimpleHeight,
        provenance: { ...b119SimpleHeight.provenance, callOrder: b119SimpleHeight.provenance.callOrder + 1 },
      }),
    },
    {
      name: 'state',
      catalog: catalogWithEntry(b119Catalog, b119SimpleHeight.id, {
        ...b119SimpleHeight,
        expectedText: '99',
        expression: '99',
      }),
    },
    {
      name: 'source pin',
      catalog: catalogWithEntry(b119Catalog, b119SimpleHeight.id, {
        ...b119SimpleHeight,
        provenance: {
          ...b119SimpleHeight.provenance,
          targetSource: {
            ...b119SimpleHeight.provenance.targetSource,
            start: { ...b119SimpleHeight.provenance.targetSource.start, offset: b119SimpleHeight.provenance.targetSource.start.offset + 1 },
          },
        },
      }),
    },
  ];
  check('B119 source-edit authority rejects forged owner, order, state, and source pins before mutation',
    b119ForgedCases.every(item => refusalPreservesInput(
      applyById(b119Context, item.catalog, b119SimpleHeight.id, 7),
      b119Context,
      item.catalog,
      b119AuthorityBeforeBytes,
      b119AuthorityBeforeSource,
    )),
    JSON.stringify(b119ForgedCases.map(item => ({ name: item.name, status: item.catalog.status }))));

  const numberContext = contextFor();
  const numberCatalog = catalogFor(numberContext);
  const numberEntry = editableField(numberCatalog, 'number', 'semantics.count', '1', 'addTable');
  const numberBefore = sourceText(numberContext);
  const numberResult = accepted(apply(numberContext, numberCatalog, numberEntry, 2));
  const numberAfter = sourceText(numberResult);
  check('number edit accepts finite replacement and reparses complete document',
    numberResult.changed
      && numberResult.reparsed
      && numberResult.provenanceReestablished
      && numberAfter === numberBefore.slice(0, numberEntry.startOffset) + '2' + numberBefore.slice(numberEntry.endOffset)
      && numberResult.entry.expectedText === '2',
    JSON.stringify(numberResult));
  check('number edit changes one exact source range and preserves all other passthrough bytes',
    samePassthroughValue(numberResult.workspace.passthroughFiles?.[0], numberContext.workspace.passthroughFiles?.[0])
      && samePassthroughValue(numberResult.workspace.passthroughFiles?.[1], numberContext.workspace.passthroughFiles?.[1])
      && numberResult.workspace.passthroughFiles?.[2] !== numberContext.workspace.passthroughFiles?.[2]
      && numberResult.source.projection?.uiXml === numberContext.source.projection?.uiXml
      && numberResult.source.projection?.luaFiles.filter((file, index) => file.text !== numberContext.source.projection?.luaFiles[index].text).length === 1);
  const secondEditEntry = editableField(
    numberResult.catalog,
    'boolean',
    'semantics.properties.scaling',
    'false',
    'addTable',
  );
  const secondEditResult = accepted(applyX4UiSourceEdit(
    numberResult.workspace,
    numberResult.source,
    numberResult.catalog,
    secondEditEntry.id,
    true,
  ));
  check('reparse-issued workspace/source/catalog authority remains usable for a second valid edit',
    secondEditResult.changed
      && secondEditResult.reparsed
      && secondEditResult.provenanceReestablished
      && sourceText(secondEditResult).includes('addTable(2, { width = 80, scaling = true })'),
    JSON.stringify(secondEditResult));

  const stringSingleContext = contextFor();
  const stringSingleCatalog = catalogFor(stringSingleContext);
  const stringSingle = editableField(stringSingleCatalog, 'string', 'arguments[0]', "'old\\n\"quote\"'", 'createText');
  const singleValue = "new 'single'\n\"double\" \\ path\tend";
  const stringSingleResult = accepted(apply(stringSingleContext, stringSingleCatalog, stringSingle, singleValue));
  check('single-quoted string preserves quote style, escapes quotes, slash, controls, and newline',
    stringSingleResult.replacement.startsWith("'")
      && stringSingleResult.replacement.endsWith("'")
      && stringSingleResult.replacement.includes("\\'single\\'")
      && stringSingleResult.replacement.includes('"double"')
      && stringSingleResult.replacement.includes('\\\\ path')
      && stringSingleResult.replacement.includes('\\n')
      && stringSingleResult.replacement.includes('\\t')
      && sourceText(stringSingleResult).slice(stringSingle.startOffset, stringSingleResult.entry.endOffset) === stringSingleResult.replacement,
    stringSingleResult.replacement);

  const doubleLua = baseLua.replace("'old\\n\"quote\"'", '"old \'quote\' \\\\ path"');
  const stringDoubleContext = contextFor(doubleLua);
  const stringDoubleCatalog = catalogFor(stringDoubleContext);
  const stringDouble = editableField(stringDoubleCatalog, 'string', 'arguments[0]', '"old \'quote\' \\\\ path"', 'createText');
  const stringDoubleResult = accepted(apply(stringDoubleContext, stringDoubleCatalog, stringDouble, "double \"quote\" 'single' \\ path"));
  check('double-quoted string preserves double quote style and Lua escaping',
    stringDoubleResult.replacement.startsWith('"')
      && stringDoubleResult.replacement.endsWith('"')
      && stringDoubleResult.replacement.includes('\\"quote\\"')
      && stringDoubleResult.replacement.includes("'single'")
      && stringDoubleResult.replacement.includes('\\\\ path'),
    stringDoubleResult.replacement);

  const booleanContext = contextFor();
  const booleanCatalog = catalogFor(booleanContext);
  const booleanEntry = editableField(booleanCatalog, 'boolean', 'semantics.properties.scaling', 'false', 'addTable');
  const booleanResult = accepted(apply(booleanContext, booleanCatalog, booleanEntry, true));
  check('boolean edit accepts only Lua boolean spelling and reparses provenance',
    booleanResult.replacement === 'true'
      && sourceText(booleanResult).slice(booleanEntry.startOffset, booleanEntry.startOffset + 4) === 'true'
      && booleanResult.reparsed,
    JSON.stringify(booleanResult));

  const noEditContext = contextFor();
  const noEditCatalog = catalogFor(noEditContext);
  const noEditEntry = editableField(noEditCatalog, 'number', 'semantics.count', '1', 'addTable');
  const noEdit = accepted(apply(noEditContext, noEditCatalog, noEditEntry, noEditEntry.value));
  const noEditInputObjects = [
    ...objectGraph(noEditContext.workspace),
    ...objectGraph(noEditContext.source),
    ...objectGraph(noEditCatalog),
  ];
  const noEditMutableInputObjects = noEditInputObjects.filter(value => !Object.isFrozen(value));
  check('no-edit preserves bytes while returning frozen detached authority surfaces',
    !noEdit.changed
      && deepFrozen(noEdit)
      && noEdit.workspace !== noEditContext.workspace
      && noEdit.source !== noEditContext.source
      && noEdit.catalog !== noEditCatalog
      && noEdit.entry !== noEditEntry
      && !graphShares(noEdit.workspace, new Set(noEditInputObjects))
      && !graphShares(noEdit.source, new Set(noEditInputObjects))
      && !graphShares(noEdit.catalog, new Set(noEditInputObjects))
      && allUnfrozen(noEditMutableInputObjects)
      && sourceText(noEdit) === sourceText(noEditContext),
    JSON.stringify({
      changed: noEdit.changed,
      returnedFrozen: deepFrozen(noEdit),
      workspaceDetached: noEdit.workspace !== noEditContext.workspace && !graphShares(noEdit.workspace, new Set(noEditInputObjects)),
      sourceDetached: noEdit.source !== noEditContext.source && !graphShares(noEdit.source, new Set(noEditInputObjects)),
      catalogDetached: noEdit.catalog !== noEditCatalog && !graphShares(noEdit.catalog, new Set(noEditInputObjects)),
      entryDetached: noEdit.entry !== noEditEntry,
      inputsMutable: allUnfrozen(noEditMutableInputObjects),
      bytesUnchanged: sourceText(noEdit) === sourceText(noEditContext),
    }));

  const authorityContext = contextFor();
  const authorityCatalog = catalogFor(authorityContext);
  const authorityCount = editableField(authorityCatalog, 'number', 'semantics.count', '1', 'addTable');
  const authorityWidth = editableField(authorityCatalog, 'number', 'semantics.properties.width', '80', 'addTable');
  check('addTable count authority is field-exact and excludes same-call width and options evidence',
    authorityCount.provenance.fields.includes('arguments[0]')
      && authorityCount.provenance.fields.includes('semantics.count')
      && authorityCount.provenance.fields.every(field => field === 'arguments[0]' || field === 'semantics.count')
      && authorityWidth.provenance.fields.every(field => field !== 'arguments[0]' && field !== 'semantics.count'),
    JSON.stringify({ count: authorityCount.provenance.fields, width: authorityWidth.provenance.fields }));
  const authorityBeforeBytes = workspaceBytes(authorityContext.workspace);
  const authorityBeforeSource = sourceText(authorityContext);
  const retargetedCount: X4UiEditableSourceEditEntry = {
    ...authorityCount,
    value: authorityWidth.value,
    expression: authorityWidth.expression,
    expectedText: authorityWidth.expectedText,
    startOffset: authorityWidth.startOffset,
    endOffset: authorityWidth.endOffset,
    source: authorityWidth.source,
    sourceLiteral: authorityWidth.sourceLiteral,
    provenance: {
      ...authorityCount.provenance,
      fields: authorityWidth.provenance.fields,
    },
  };
  const retargetedCatalog = catalogWithEntry(authorityCatalog, authorityCount.id, retargetedCount);
  const retargetedResult = applyById(authorityContext, retargetedCatalog, authorityCount.id, 2);
  const wrongPathCatalog = {
    ...authorityCatalog,
    sourcePath: 'ui/foreign.lua',
  } as X4UiSourceEditCatalog;
  const wrongPathResult = applyById(authorityContext, wrongPathCatalog, authorityCount.id, 2);
  const wrongOperationEntry: X4UiEditableSourceEditEntry = {
    ...authorityCount,
    provenance: { ...authorityCount.provenance, operationId: 'foreign-operation-id' },
  };
  const wrongOperationCatalog = catalogWithEntry(authorityCatalog, authorityCount.id, wrongOperationEntry);
  const wrongOperationResult = applyById(authorityContext, wrongOperationCatalog, authorityCount.id, 2);
  const wrongOrderEntry: X4UiEditableSourceEditEntry = {
    ...authorityCount,
    provenance: { ...authorityCount.provenance, callOrder: authorityCount.provenance.callOrder + 1 },
  };
  const wrongOrderCatalog = catalogWithEntry(authorityCatalog, authorityCount.id, wrongOrderEntry);
  const wrongOrderResult = applyById(authorityContext, wrongOrderCatalog, authorityCount.id, 2);
  const duplicateEntryCatalog = {
    ...authorityCatalog,
    entries: [...authorityCatalog.entries, authorityCount],
    editableEntries: [...authorityCatalog.editableEntries, authorityCount],
  } as X4UiSourceEditCatalog;
  const duplicateResult = applyById(authorityContext, duplicateEntryCatalog, authorityCount.id, 2);
  const prototypeCatalog = Object.create(authorityCatalog) as X4UiSourceEditCatalog;
  const prototypeCatalogResult = applyById(authorityContext, prototypeCatalog, authorityCount.id, 2);
  const prototypeEntry = Object.create(authorityCount) as X4UiEditableSourceEditEntry;
  const prototypeEntryCatalog = catalogWithEntry(authorityCatalog, authorityCount.id, prototypeEntry);
  const prototypeEntryResult = applyById(authorityContext, prototypeEntryCatalog, authorityCount.id, 2);
  const clonedWorkspace = {
    ...authorityContext.workspace,
    passthroughFiles: authorityContext.workspace.passthroughFiles?.map(file => ({ ...file })),
  } as ModWorkspace;
  const clonedWorkspaceContext: SourceEditFixtureContext = { ...authorityContext, workspace: clonedWorkspace };
  const clonedWorkspaceBeforeBytes = workspaceBytes(clonedWorkspaceContext.workspace);
  const clonedWorkspaceResult = applyById(clonedWorkspaceContext, authorityCatalog, authorityCount.id, 2);
  const clonedSourceContext: SourceEditFixtureContext = {
    ...authorityContext,
    source: { ...authorityContext.source },
  };
  const clonedSourceBeforeBytes = workspaceBytes(clonedSourceContext.workspace);
  const clonedSourceResult = applyById(clonedSourceContext, authorityCatalog, authorityCount.id, 2);
  const clonedProgramContext: SourceEditFixtureContext = {
    ...authorityContext,
    program: { ...authorityContext.program },
  };
  const clonedProgramCatalog = catalogFor(clonedProgramContext);
  const clonedProgramBeforeBytes = workspaceBytes(clonedProgramContext.workspace);
  const clonedProgramResult = applyById(clonedProgramContext, clonedProgramCatalog, authorityCount.id, 2);
  const foreignAuthorityContext = contextFor();
  const foreignAuthorityCatalog = catalogFor(foreignAuthorityContext);
  const foreignAuthorityEntry = editableField(foreignAuthorityCatalog, 'number', 'semantics.count', '1', 'addTable');
  const foreignBeforeBytes = workspaceBytes(authorityContext.workspace);
  const foreignResult = applyById(authorityContext, foreignAuthorityCatalog, foreignAuthorityEntry.id, 2);
  const authorityAttackCases = [
    { name: 'retargeted count to same-call width', result: retargetedResult, context: authorityContext, catalog: retargetedCatalog, beforeBytes: authorityBeforeBytes, beforeSource: authorityBeforeSource },
    { name: 'wrong catalog source path', result: wrongPathResult, context: authorityContext, catalog: wrongPathCatalog, beforeBytes: authorityBeforeBytes, beforeSource: authorityBeforeSource },
    { name: 'wrong operation id', result: wrongOperationResult, context: authorityContext, catalog: wrongOperationCatalog, beforeBytes: authorityBeforeBytes, beforeSource: authorityBeforeSource },
    { name: 'wrong call order', result: wrongOrderResult, context: authorityContext, catalog: wrongOrderCatalog, beforeBytes: authorityBeforeBytes, beforeSource: authorityBeforeSource },
    { name: 'duplicate entry id', result: duplicateResult, context: authorityContext, catalog: duplicateEntryCatalog, beforeBytes: authorityBeforeBytes, beforeSource: authorityBeforeSource },
    { name: 'prototype-backed catalog', result: prototypeCatalogResult, context: authorityContext, catalog: prototypeCatalog, beforeBytes: authorityBeforeBytes, beforeSource: authorityBeforeSource },
    { name: 'prototype-backed entry', result: prototypeEntryResult, context: authorityContext, catalog: prototypeEntryCatalog, beforeBytes: authorityBeforeBytes, beforeSource: authorityBeforeSource },
    { name: 'cloned workspace', result: clonedWorkspaceResult, context: clonedWorkspaceContext, catalog: authorityCatalog, beforeBytes: clonedWorkspaceBeforeBytes, beforeSource: authorityBeforeSource },
    { name: 'cloned source', result: clonedSourceResult, context: clonedSourceContext, catalog: authorityCatalog, beforeBytes: clonedSourceBeforeBytes, beforeSource: authorityBeforeSource },
    { name: 'cloned program', result: clonedProgramResult, context: clonedProgramContext, catalog: clonedProgramCatalog, beforeBytes: clonedProgramBeforeBytes, beforeSource: authorityBeforeSource },
    { name: 'foreign catalog/context combination', result: foreignResult, context: authorityContext, catalog: foreignAuthorityCatalog, beforeBytes: foreignBeforeBytes, beforeSource: authorityBeforeSource },
  ];
  check('only exact producer-issued catalog/context/entry authority can mutate one scalar range',
    authorityAttackCases.every(item => refusalPreservesInput(item.result, item.context, item.catalog, item.beforeBytes, item.beforeSource)),
    JSON.stringify(authorityAttackCases.map(item => ({
      name: item.name,
      accepted: item.result.accepted,
      reason: item.result.accepted === false ? item.result.reason : 'accepted',
    }))));

  const negativeZeroContext = contextFor();
  const negativeZeroCatalog = catalogFor(negativeZeroContext);
  const negativeZeroCountEntry = editableField(negativeZeroCatalog, 'number', 'semantics.count', '1', 'addTable');
  const negativeZeroCount = refused(apply(negativeZeroContext, negativeZeroCatalog, negativeZeroCountEntry, -0));
  check('negative zero on an invalid count field fails closed after provenance revalidation',
    negativeZeroCount.reason === 'reparse-provenance-drift'
      && negativeZeroCount.workspace === negativeZeroContext.workspace
      && sourceText(negativeZeroContext) === baseLua,
    JSON.stringify(negativeZeroCount));
  const negativeZeroEncoding = encodeX4UiSourceEditReplacement(negativeZeroCountEntry, -0);
  check('negative zero encoding is deterministic and independent of workspace mutation',
    negativeZeroEncoding.ok && negativeZeroEncoding.replacement === '0'
      && sourceText(negativeZeroContext) === baseLua,
    JSON.stringify(negativeZeroEncoding));
  const nonFiniteContext = contextFor();
  const nonFiniteCatalog = catalogFor(nonFiniteContext);
  const nonFiniteEntry = editableField(nonFiniteCatalog, 'number', 'semantics.count', '1', 'addTable');
  const nan = refused(apply(nonFiniteContext, nonFiniteCatalog, nonFiniteEntry, Number.NaN));
  const infinity = refused(apply(nonFiniteContext, nonFiniteCatalog, nonFiniteEntry, Number.POSITIVE_INFINITY));
  const negative = refused(apply(nonFiniteContext, nonFiniteCatalog, nonFiniteEntry, -1));
  check('nonfinite and parser-unsupported negative numeric replacements refuse without mutation',
    nan.reason === 'invalid-replacement'
      && infinity.reason === 'invalid-replacement'
      && negative.reason === 'unsupported-number-replacement'
      && nan.workspace === nonFiniteContext.workspace
      && infinity.workspace === nonFiniteContext.workspace
      && negative.workspace === nonFiniteContext.workspace,
    JSON.stringify({ nan, infinity, negative }));

  const staleContext = contextFor();
  const staleCatalog = catalogFor(staleContext);
  const staleEntry = editableField(staleCatalog, 'number', 'semantics.count', '1', 'addTable');
  const staleText = refused(apply(staleContext, staleCatalog, staleEntry, 2, { expectedText: 'stale' }));
  const staleRange = refused(apply(staleContext, staleCatalog, staleEntry, 2, { startOffset: staleEntry.startOffset + 1 }));
  check('stale expected text and range refuse with exact original workspace identity',
    staleText.reason === 'stale-expected-text'
      && staleRange.reason === 'stale-range'
      && staleText.workspace === staleContext.workspace
      && staleRange.workspace === staleContext.workspace
      && sourceText(staleContext) === baseLua,
    JSON.stringify({ staleText, staleRange }));

  const concurrentContext = contextFor();
  const concurrentCatalog = catalogFor(concurrentContext);
  const concurrentEntry = editableField(concurrentCatalog, 'number', 'semantics.count', '1', 'addTable');
  const concurrentWorkspace = {
    ...concurrentContext.workspace,
    passthroughFiles: concurrentContext.workspace.passthroughFiles?.map((file, index) => index === 2
      ? { ...file, content: `${file.content || ''}-- concurrent\n` }
      : file),
  } as ModWorkspace;
  const concurrent = refused(apply({ ...concurrentContext, workspace: concurrentWorkspace }, concurrentCatalog, concurrentEntry, 2));
  check('concurrent passthrough drift refuses before mutation and returns exact supplied workspace',
    concurrent.reason === 'workspace-source-mismatch'
      && concurrent.workspace === concurrentWorkspace,
    JSON.stringify(concurrent));

  const dynamicContext = contextFor([
    'local menu = { name = "Dynamic", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local table = frame:addTable(runtimeCount, { width = getWidth(), scaling = runtimeScaling })',
    'local row = table:addRow(runtimeRow, {})',
    'row[1]:createText(runtimeText, { width = 10 + 1 })',
    '',
  ].join('\n'));
  const dynamicCatalog = catalogFor(dynamicContext);
  check('exact issued partial program with dynamic and unsupported values is wholly non-actionable',
    dynamicContext.program.status === 'partial'
      && dynamicCatalog.status === 'locked'
      && dynamicCatalog.reason === 'operation-not-applied'
      && dynamicCatalog.editableEntries.length === 0
      && dynamicCatalog.lockedEntries.every(entry => entry.reason === 'operation-not-applied'),
    JSON.stringify(dynamicCatalog.lockedEntries));

  const appliedPartialContext = contextFor([
    'local menu = { name = getWidth(), layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local table = frame:addTable(1, { width = 80, scaling = false })',
    'local row = table:addRow(false, {})',
    'row[1]:createText("partial", {})',
    'frame:display()',
    '',
  ].join('\n'));
  const appliedPartialCatalog = catalogFor(appliedPartialContext);
  const appliedPartialWidth = appliedPartialCatalog.editableEntries.find(entry => entry.provenance.callName === 'addTable'
    && entry.provenance.fields.includes('semantics.properties.width'));
  const appliedPartialBeforeSource = sourceText(appliedPartialContext);
  const appliedPartialApplyOutcome = invokePublic(() => applyX4UiSourceEdit(
    appliedPartialContext.workspace,
    appliedPartialContext.source,
    appliedPartialCatalog,
    appliedPartialWidth?.id || 'missing-applied-partial-width',
    81,
    appliedPartialWidth?.path,
    appliedPartialWidth?.startOffset,
    appliedPartialWidth?.endOffset,
    appliedPartialWidth?.expectedText,
  ));
  const appliedPartialFailFirstReceipt = {
    programStatus: appliedPartialContext.program.status,
    operationStatuses: appliedPartialContext.program.operations.map(operation => operation.status),
    catalogStatus: appliedPartialCatalog.status,
    catalogReason: appliedPartialCatalog.reason,
    editableEntries: appliedPartialCatalog.editableEntries.length,
    widthEntry: appliedPartialWidth ? {
      id: appliedPartialWidth.id,
      expectedText: appliedPartialWidth.expectedText,
      fields: appliedPartialWidth.provenance.fields,
    } : undefined,
    structuralEntries: appliedPartialCatalog.structuralEntries?.length || 0,
    apply: {
      threw: appliedPartialApplyOutcome.threw,
      accepted: appliedPartialApplyOutcome.value?.accepted,
      changed: appliedPartialApplyOutcome.value?.changed,
      reason: appliedPartialApplyOutcome.value?.accepted === false ? appliedPartialApplyOutcome.value.reason : undefined,
      detail: appliedPartialApplyOutcome.value?.accepted === false ? appliedPartialApplyOutcome.value.detail : undefined,
    },
  };
  check('B119 applied-partial scalar source authority is causal and geometry-editable',
    appliedPartialContext.program.status === 'partial'
      && appliedPartialContext.program.operations.length > 0
      && appliedPartialContext.program.operations.every(operation => operation.status === 'applied')
      && appliedPartialCatalog.status === 'ready'
      && appliedPartialCatalog.editable
      && appliedPartialWidth !== undefined
      && appliedPartialWidth.provenance.callName === 'addTable'
      && appliedPartialWidth.provenance.fields.includes('semantics.properties.width')
      && (appliedPartialCatalog.structuralEntries || []).length > 0
      && (appliedPartialCatalog.structuralEntries || []).every(entry => entry.kind === 'delete-statement')
      && appliedPartialApplyOutcome.threw === false
      && appliedPartialApplyOutcome.value?.accepted === true
      && appliedPartialApplyOutcome.value.changed === true,
    JSON.stringify(appliedPartialFailFirstReceipt));

  const appliedPartialResult = accepted(appliedPartialApplyOutcome.value as X4UiSourceEditResult);
  const appliedPartialAfterSource = sourceText(appliedPartialResult);
  const appliedPartialAfterProjection = projectedProgramFor(appliedPartialResult.source);
  check('B119 applied-partial scalar replacement is byte-local, reparsed, and reissues partial authority',
    appliedPartialResult.changed
      && appliedPartialResult.reparsed
      && appliedPartialResult.provenanceReestablished
      && appliedPartialResult.catalog.verification === 'Not verified in game'
      && appliedPartialResult.catalog.status === 'ready'
      && appliedPartialResult.catalog.editable
      && (appliedPartialResult.catalog.structuralEntries || []).length > 0
      && (appliedPartialResult.catalog.structuralEntries || []).every(entry => entry.kind === 'delete-statement')
      && appliedPartialAfterProjection !== undefined
      && appliedPartialAfterProjection.program.status === 'partial'
      && appliedPartialAfterProjection.program.operations.length > 0
      && appliedPartialAfterProjection.program.operations.every(operation => operation.status === 'applied')
      && appliedPartialAfterSource === appliedPartialBeforeSource.slice(0, appliedPartialWidth!.startOffset)
        + '81'
        + appliedPartialBeforeSource.slice(appliedPartialWidth!.endOffset)
      && appliedPartialResult.catalog.editableEntries.some(entry => entry.provenance.callName === 'addTable'
        && entry.provenance.fields.includes('semantics.properties.width')
        && entry.expectedText === '81'),
    JSON.stringify({
      before: appliedPartialBeforeSource,
      after: appliedPartialAfterSource,
      result: appliedPartialResult,
      afterProjection: appliedPartialAfterProjection
        ? {
          status: appliedPartialAfterProjection.program.status,
          operationStatuses: appliedPartialAfterProjection.program.operations.map(operation => operation.status),
        }
        : undefined,
    }));

  const appliedPartialStructuralRefusal = applyX4UiSourceStructuralEdit(
    appliedPartialContext.workspace,
    appliedPartialContext.source,
    appliedPartialCatalog,
    'missing-applied-partial-structural-action',
  );
  check('B119 applied-partial authority retains complete deletion actions and rejects unknown structural action',
    (appliedPartialCatalog.structuralEntries || []).length > 0
      && (appliedPartialCatalog.structuralEntries || []).every(entry => entry.kind === 'delete-statement')
      && appliedPartialStructuralRefusal.accepted === false
      && appliedPartialStructuralRefusal.reason === 'unsupported-provenance'
      && appliedPartialStructuralRefusal.changed === false
      && appliedPartialStructuralRefusal.workspace === appliedPartialContext.workspace
      && appliedPartialStructuralRefusal.source === appliedPartialContext.source,
    JSON.stringify({
      structuralEntries: appliedPartialCatalog.structuralEntries,
      accepted: appliedPartialStructuralRefusal.accepted,
      reason: appliedPartialStructuralRefusal.accepted === false ? appliedPartialStructuralRefusal.reason : undefined,
      detail: appliedPartialStructuralRefusal.accepted === false ? appliedPartialStructuralRefusal.detail : undefined,
    }));

  const conditionalContext = contextFor([
    'local menu = { name = "Conditional", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'if runtimeCondition then',
    '  local table = frame:addTable(1, { width = 80, scaling = false })',
    '  local row = table:addRow(false, {})',
    '  row[1]:createText("conditional", {})',
    'end',
    'frame:display()',
    '',
  ].join('\n'));
  const rejectedContext = contextFor([
    'local menu = { name = "Rejected", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local table = frame:addTable(0, { width = 80, scaling = false })',
    'local row = table:addRow(false, {})',
    'row[1]:createText("rejected", {})',
    'frame:display()',
    '',
  ].join('\n'));
  const mixedContext = contextFor([
    'local menu = { name = "Mixed", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local table = frame:addTable(1, { width = 80, scaling = false })',
    'local row = table:addRow(false, {})',
    'row[1]:createText("mixed", {})',
    'if runtimeCondition then frame:display() end',
    '',
  ].join('\n'));
  const unreachableContext = contextFor([
    'local menu = { name = "Unreachable", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'if false then',
    '  local table = frame:addTable(1, { width = 80, scaling = false })',
    '  local row = table:addRow(false, {})',
    '  row[1]:createText("unreachable", {})',
    'end',
    'frame:display()',
    '',
  ].join('\n'));
  const unreachableCatalog = catalogFor(unreachableContext);
  const emptyWorkspace = workspace('local menu = { name = "Empty", layer = 1 }\n');
  const emptySource = buildX4UiWorkspaceSource(emptyWorkspace);
  if (!emptySource.bundle) throw new Error('empty source fixture did not build a bundle');
  const emptyFile = emptySource.bundle.sourceFiles.find(file => file.path === 'ui/edit.lua');
  if (!emptyFile) throw new Error('empty source fixture Lua file missing');
  const emptyModel = normalizeX4UiSourceEditLayoutModel(emptyFile.callModel);
  const emptyTarget = createX4UiLayoutTargetCatalog(emptyModel).targets.find(candidate => candidate.kind === 'top-level');
  if (!emptyTarget) throw new Error('empty source fixture top-level target missing');
  const emptyProjection = projectX4UiLayoutProgram(emptyModel, emptyTarget, profileFor(emptyModel));
  const emptyDiscoveryOutcome = invokeDiscoveryBoundary(
    emptyWorkspace,
    emptySource,
    emptyProjection.program,
    undefined,
  );
  const emptyApplyOutcome = emptyDiscoveryOutcome.value
    ? invokeApplyBoundary(emptyWorkspace, emptySource, emptyDiscoveryOutcome.value, 'missing-empty-entry', 81)
    : { threw: false };
  const partialStatusCases = [
    { name: 'conditional', context: conditionalContext, catalog: catalogFor(conditionalContext), status: 'conditional' },
    { name: 'rejected', context: rejectedContext, catalog: catalogFor(rejectedContext), status: 'rejected' },
    { name: 'unresolved', context: dynamicContext, catalog: dynamicCatalog, status: 'unresolved' },
    { name: 'mixed', context: mixedContext, catalog: catalogFor(mixedContext), status: 'conditional' },
    { name: 'unreachable', context: unreachableContext, catalog: unreachableCatalog, status: 'unreachable' },
  ] as const;
  const partialStatusReceipts = partialStatusCases.map(item => {
    const applyOutcome = invokePublic(() => applyX4UiSourceEdit(
      item.context.workspace,
      item.context.source,
      item.catalog,
      item.catalog.entries[0]?.id || `missing-${item.name}-entry`,
      81,
    ));
    return {
      name: item.name,
      programStatus: item.context.program.status,
      operationStatuses: item.context.program.operations.map(operation => operation.status),
      catalogStatus: item.catalog.status,
      catalogReason: item.catalog.reason,
      apply: {
        threw: applyOutcome.threw,
        accepted: applyOutcome.value?.accepted,
        changed: applyOutcome.value?.changed,
        reason: applyOutcome.value?.accepted === false ? applyOutcome.value.reason : undefined,
      },
      expectedStatusPresent: item.context.program.operations.some(operation => operation.status === item.status),
    };
  });
  check('B119 conditional, rejected, unresolved, and mixed streams stay non-actionable',
    partialStatusCases.every(item => item.context.program.status === 'partial'
      && item.context.program.operations.length > 0
      && item.context.program.operations.some(operation => operation.status === item.status)
      && !item.context.program.operations.every(operation => operation.status === 'applied')
      && item.catalog.status === 'locked'
      && item.catalog.reason === 'operation-not-applied')
    && partialStatusReceipts.every(receipt => receipt.apply.threw === false
        && receipt.apply.accepted === false
        && receipt.apply.changed === false
        && receipt.apply.reason === 'unsupported-provenance'),
    JSON.stringify(partialStatusReceipts));
  check('B119 unreachable and empty operation streams stay non-actionable',
    unreachableContext.program.status === 'partial'
      && unreachableContext.program.operations.length > 0
      && unreachableContext.program.operations.some(operation => operation.status === 'unreachable')
      && unreachableContext.program.operations.some(operation => operation.status === 'applied')
      && unreachableCatalog.status === 'locked'
      && emptyProjection.status === 'refused'
      && emptyProjection.program?.operations.length === 0
      && emptyDiscoveryOutcome.threw === false
      && emptyDiscoveryOutcome.value?.status === 'locked'
      && emptyDiscoveryOutcome.value.editable === false
      && emptyApplyOutcome.threw === false
      && emptyApplyOutcome.value?.accepted === false
      && emptyApplyOutcome.value.changed === false,
    JSON.stringify({
      unreachable: {
        programStatus: unreachableContext.program.status,
        operationStatuses: unreachableContext.program.operations.map(operation => operation.status),
      },
      empty: {
        projectionStatus: emptyProjection.status,
        operationCount: emptyProjection.program?.operations.length,
        discoveryStatus: emptyDiscoveryOutcome.value?.status,
        applyAccepted: emptyApplyOutcome.value?.accepted,
        applyChanged: emptyApplyOutcome.value?.changed,
        applyReason: emptyApplyOutcome.value?.accepted === false ? emptyApplyOutcome.value.reason : undefined,
      },
    }));

  const namedFunctionLua = [
    'local menu = {}',
    'function menu.display()',
    '  local descriptor = { name = getWidth(), layer = 1 }',
    '  local frame = Helper.createFrameHandle(descriptor, { width = 100, height = 80 })',
    '  local table = frame:addTable(1, { x = 10, y = 20, width = 80, scaling = false })',
    '  local row = table:addRow(false, {})',
    '  row[1]:createText("named partial", {})',
    '  frame:display()',
    'end',
    '',
  ].join('\n');
  const namedFunctionWorkspace = workspace(namedFunctionLua);
  const namedFunctionSource = buildX4UiWorkspaceSource(namedFunctionWorkspace);
  const namedFunctionFile = namedFunctionSource.bundle?.sourceFiles.find(file => file.path === 'ui/edit.lua');
  if (!namedFunctionFile) throw new Error('named-function source fixture Lua file missing');
  const namedFunctionRawModel = namedFunctionFile.callModel;
  const namedFunctionFirstCall = namedFunctionRawModel.calls[0];
  const namedFunctionHandlerDescriptor = namedFunctionFirstCall
    ? Object.getOwnPropertyDescriptor(namedFunctionFirstCall.context, 'handler')
    : undefined;
  const namedFunctionNormalization = invokePublic(() => normalizeX4UiSourceEditLayoutModel(namedFunctionRawModel));
  const namedFunctionFallbackModel = structuredClone(namedFunctionRawModel);
  for (const call of namedFunctionFallbackModel.calls) {
    const descriptor = Object.getOwnPropertyDescriptor(call.context, 'handler');
    if (descriptor && 'value' in descriptor && descriptor.value === undefined) delete call.context.handler;
  }
  const namedFunctionIssuanceModel = namedFunctionNormalization.value
    || normalizeX4UiSourceEditLayoutModel(namedFunctionFallbackModel);
  const namedFunctionTarget = createX4UiLayoutTargetCatalog(namedFunctionIssuanceModel).targets
    .find(candidate => candidate.kind === 'function');
  const namedFunctionProjection = namedFunctionTarget
    ? projectX4UiLayoutProgram(namedFunctionIssuanceModel, namedFunctionTarget, profileFor(namedFunctionIssuanceModel))
    : undefined;
  const namedFunctionContext = namedFunctionProjection
    && namedFunctionProjection.status !== 'refused'
    && namedFunctionProjection.program
    ? {
      workspace: namedFunctionWorkspace,
      source: namedFunctionSource,
      program: namedFunctionProjection.program,
      evidenceAuthority: namedFunctionProjection.evidenceAuthority,
    } satisfies SourceEditFixtureContext
    : undefined;
  const namedFunctionCatalogOutcome = namedFunctionContext
    ? invokePublic(() => catalogFor(namedFunctionContext))
    : { threw: false };
  const namedFunctionCatalog = namedFunctionCatalogOutcome.value;
  const namedFunctionDeletes = namedFunctionCatalog?.structuralEntries?.filter(entry => entry.kind === 'delete-statement') || [];
  const namedFunctionRows = namedFunctionCatalog?.structuralEntries?.filter(entry => entry.kind === 'insert-row') || [];
  const namedFunctionRow = namedFunctionProjection?.program?.rows[0];
  const namedFunctionReceipt = {
    firstCallName: namedFunctionFirstCall?.name,
    firstCallContext: namedFunctionFirstCall ? {
      ownKeys: Object.getOwnPropertyNames(namedFunctionFirstCall.context),
      kind: namedFunctionFirstCall.context.kind,
      name: namedFunctionFirstCall.context.name,
      source: namedFunctionFirstCall.context.source,
      branchPathIsArray: Array.isArray(namedFunctionFirstCall.context.branchPath),
      loopPathIsArray: Array.isArray(namedFunctionFirstCall.context.loopPath),
      reachability: namedFunctionFirstCall.context.reachability,
    } : undefined,
    handlerDescriptor: namedFunctionHandlerDescriptor ? {
      own: Object.prototype.hasOwnProperty.call(namedFunctionFirstCall?.context, 'handler'),
      data: 'value' in namedFunctionHandlerDescriptor,
      enumerable: namedFunctionHandlerDescriptor.enumerable,
      valueIsUndefined: 'value' in namedFunctionHandlerDescriptor && namedFunctionHandlerDescriptor.value === undefined,
    } : undefined,
    normalization: {
      threw: namedFunctionNormalization.threw,
      error: namedFunctionNormalization.error,
    },
    projection: namedFunctionProjection ? {
      status: namedFunctionProjection.status,
      programStatus: namedFunctionProjection.program?.status,
      operationStatuses: namedFunctionProjection.program?.operations.map(operation => operation.status),
    } : undefined,
    discovery: {
      threw: namedFunctionCatalogOutcome.threw,
      error: namedFunctionCatalogOutcome.error,
      status: namedFunctionCatalog?.status,
      reason: namedFunctionCatalog?.reason,
      detail: namedFunctionCatalog?.detail,
      editableEntries: namedFunctionCatalog?.editableEntries.length,
      structuralEntries: namedFunctionCatalog?.structuralEntries?.length,
    },
  };
  check('B119 named-function parser-owned handler undefined normalizes into applied-partial scalar authority',
    namedFunctionFirstCall?.context.kind === 'function'
      && namedFunctionFirstCall.context.name === 'menu.display'
      && namedFunctionHandlerDescriptor !== undefined
      && 'value' in namedFunctionHandlerDescriptor
      && namedFunctionHandlerDescriptor.value === undefined
      && namedFunctionNormalization.threw === false
      && namedFunctionProjection?.status === 'partial'
      && namedFunctionProjection.program !== undefined
      && namedFunctionProjection.program.operations.length > 0
      && namedFunctionProjection.program.operations.every(operation => operation.status === 'applied')
      && namedFunctionCatalogOutcome.threw === false
      && namedFunctionCatalog?.status === 'ready'
      && namedFunctionCatalog.editableEntries.some(entry => entry.provenance.callName === 'addTable'
        && entry.provenance.fields.includes('semantics.properties.width'))
      && namedFunctionDeletes.length === 2
      && namedFunctionDeletes.some(entry => entry.expectedText.includes('row[1]:createText("named partial", {})'))
      && namedFunctionDeletes.some(entry => entry.expectedText.trim() === 'frame:display()')
      && namedFunctionRows.length === 1
      && namedFunctionRow !== undefined
      && namedFunctionRows[0].rowId === namedFunctionRow.id
      && namedFunctionRows[0].tableId === namedFunctionRow.tableId
      && namedFunctionRows[0].rowIndex === namedFunctionRow.rowIndex
      && namedFunctionRows[0].provenance.rowOwner.rowId === namedFunctionRow.id
      && namedFunctionRows[0].provenance.owner.ownerId === namedFunctionRow.tableId
      && namedFunctionRows[0].provenance.owner.frameId === namedFunctionRows[0].frameId
      && namedFunctionRows[0].startOffset === namedFunctionLua.indexOf('  frame:display()')
      && namedFunctionRows[0].endOffset === namedFunctionRows[0].startOffset
      && namedFunctionCatalog.structuralEntries?.length === namedFunctionDeletes.length + namedFunctionRows.length,
    JSON.stringify(namedFunctionReceipt));

  const namedFunctionWidth = namedFunctionCatalog?.editableEntries.find(entry => entry.provenance.callName === 'addTable'
    && entry.provenance.fields.includes('semantics.properties.width'));
  const namedFunctionBeforeSource = namedFunctionContext ? sourceText(namedFunctionContext) : undefined;
  const namedFunctionApplyOutcome = namedFunctionContext && namedFunctionCatalog && namedFunctionWidth
    ? invokePublic(() => applyX4UiSourceEdit(
      namedFunctionContext.workspace,
      namedFunctionContext.source,
      namedFunctionCatalog,
      namedFunctionWidth.id,
      81,
      namedFunctionWidth.path,
      namedFunctionWidth.startOffset,
      namedFunctionWidth.endOffset,
      namedFunctionWidth.expectedText,
    ))
    : { threw: false };
  const namedFunctionResult = namedFunctionApplyOutcome.value?.accepted === true
    ? namedFunctionApplyOutcome.value
    : undefined;
  const namedFunctionAfterSource = namedFunctionResult ? sourceText(namedFunctionResult) : undefined;
  const namedFunctionAfterFile = namedFunctionResult?.source.bundle?.sourceFiles.find(file => file.path === 'ui/edit.lua');
  const namedFunctionAfterHandlerDescriptor = namedFunctionAfterFile?.callModel.calls[0]
    ? Object.getOwnPropertyDescriptor(namedFunctionAfterFile.callModel.calls[0].context, 'handler')
    : undefined;
  const namedFunctionAfterModel = namedFunctionAfterFile
    ? normalizeX4UiSourceEditLayoutModel(namedFunctionAfterFile.callModel)
    : undefined;
  const namedFunctionAfterTarget = namedFunctionAfterModel
    ? createX4UiLayoutTargetCatalog(namedFunctionAfterModel).targets.find(candidate => candidate.kind === 'function')
    : undefined;
  const namedFunctionAfterProjection = namedFunctionAfterModel && namedFunctionAfterTarget
    ? projectX4UiLayoutProgram(namedFunctionAfterModel, namedFunctionAfterTarget, profileFor(namedFunctionAfterModel))
    : undefined;
  const namedFunctionAfterDeletes = namedFunctionResult?.catalog.deleteEntries || [];
  const namedFunctionAfterRows = namedFunctionResult?.catalog.insertEntries?.filter(entry => entry.kind === 'insert-row') || [];
  const namedFunctionAfterRow = namedFunctionAfterProjection?.program?.rows[0];
  check('B119 named-function geometry CAS is byte-local and reissues applied-partial scalar authority',
    namedFunctionNormalization.value === namedFunctionIssuanceModel
      && namedFunctionWidth !== undefined
      && namedFunctionBeforeSource !== undefined
      && namedFunctionApplyOutcome.threw === false
      && namedFunctionResult !== undefined
      && namedFunctionResult.changed
      && namedFunctionResult.reparsed
      && namedFunctionResult.provenanceReestablished
      && namedFunctionResult.catalog.status === 'ready'
      && namedFunctionResult.catalog.editable
      && namedFunctionResult.catalog.verification === 'Not verified in game'
      && namedFunctionAfterDeletes.length === namedFunctionDeletes.length
      && namedFunctionAfterDeletes.every((entry, index) => entry.kind === 'delete-statement'
        && entry.expectedText === namedFunctionDeletes[index].expectedText
        && entry.startOffset === namedFunctionDeletes[index].startOffset && entry.endOffset === namedFunctionDeletes[index].endOffset)
      && namedFunctionAfterRows.length === 1 && namedFunctionAfterRow !== undefined
      && namedFunctionAfterRows[0].rowId === namedFunctionAfterRow.id
      && namedFunctionAfterRows[0].tableId === namedFunctionAfterRow.tableId
      && namedFunctionAfterRows[0].rowIndex === namedFunctionAfterRow.rowIndex
      && namedFunctionAfterRows[0].provenance.rowOwner.rowId === namedFunctionAfterRow.id
      && namedFunctionAfterRows[0].provenance.owner.ownerId === namedFunctionAfterRow.tableId
      && namedFunctionAfterRows[0].provenance.owner.frameId === namedFunctionAfterRows[0].frameId
      && namedFunctionAfterRows[0].startOffset === namedFunctionAfterSource?.indexOf('  frame:display()')
      && namedFunctionAfterRows[0].endOffset === namedFunctionAfterRows[0].startOffset
      && namedFunctionResult.catalog.structuralEntries?.length === namedFunctionAfterDeletes.length + namedFunctionAfterRows.length
      && namedFunctionAfterSource === namedFunctionBeforeSource.slice(0, namedFunctionWidth.startOffset)
        + '81'
        + namedFunctionBeforeSource.slice(namedFunctionWidth.endOffset)
      && namedFunctionAfterHandlerDescriptor !== undefined
      && 'value' in namedFunctionAfterHandlerDescriptor
      && namedFunctionAfterHandlerDescriptor.value === undefined
      && namedFunctionAfterProjection?.status === 'partial'
      && namedFunctionAfterProjection.program !== undefined
      && namedFunctionAfterProjection.program.operations.length > 0
      && namedFunctionAfterProjection.program.operations.every(operation => operation.status === 'applied')
      && namedFunctionResult.catalog.editableEntries.some(entry => entry.provenance.callName === 'addTable'
        && entry.provenance.fields.includes('semantics.properties.width')
        && entry.expectedText === '81'),
    JSON.stringify({
      apply: {
        threw: namedFunctionApplyOutcome.threw,
        error: namedFunctionApplyOutcome.error,
        accepted: namedFunctionApplyOutcome.value?.accepted,
        changed: namedFunctionApplyOutcome.value?.changed,
      },
      after: {
        source: namedFunctionAfterSource,
        reparsed: namedFunctionResult?.reparsed,
        provenanceReestablished: namedFunctionResult?.provenanceReestablished,
        programStatus: namedFunctionAfterProjection?.program?.status,
        operationStatuses: namedFunctionAfterProjection?.program?.operations.map(operation => operation.status),
        structuralEntries: namedFunctionResult?.catalog.structuralEntries?.length,
      },
    }));

  const malformedFunctionContextCases = [
    { name: 'top-level kind', mutate: (context: Record<string, unknown>) => { context.kind = 'top-level'; } },
    { name: 'handler kind', mutate: (context: Record<string, unknown>) => { context.kind = 'handler'; } },
    { name: 'missing name', mutate: (context: Record<string, unknown>) => { delete context.name; } },
    { name: 'empty name', mutate: (context: Record<string, unknown>) => { context.name = ''; } },
    { name: 'non-string name', mutate: (context: Record<string, unknown>) => { context.name = 7; } },
    { name: 'missing source', mutate: (context: Record<string, unknown>) => { delete context.source; } },
    { name: 'invalid source', mutate: (context: Record<string, unknown>) => { context.source = { file: 'ui/edit.lua', start: {} }; } },
    { name: 'invalid source path', mutate: (context: Record<string, unknown>) => {
      const source = context.source as Record<string, unknown>;
      source.sourcePath = 7;
    } },
    { name: 'missing branch path', mutate: (context: Record<string, unknown>) => { delete context.branchPath; } },
    { name: 'non-array branch path', mutate: (context: Record<string, unknown>) => { context.branchPath = {}; } },
    { name: 'missing loop path', mutate: (context: Record<string, unknown>) => { delete context.loopPath; } },
    { name: 'non-array loop path', mutate: (context: Record<string, unknown>) => { context.loopPath = {}; } },
    { name: 'missing reachability', mutate: (context: Record<string, unknown>) => { delete context.reachability; } },
    { name: 'invalid reachability', mutate: (context: Record<string, unknown>) => { context.reachability = 'unknown'; } },
    { name: 'unrelated undefined', mutate: (context: Record<string, unknown>) => { context.auditUndefined = undefined; } },
    { name: 'custom prototype', mutate: (context: Record<string, unknown>) => { Object.setPrototypeOf(context, { inherited: true }); } },
    { name: 'symbol field', mutate: (context: Record<string, unknown>) => { Object.defineProperty(context, Symbol('named-function'), { enumerable: true, value: true }); } },
    { name: 'cycle', mutate: (context: Record<string, unknown>) => { context.self = context; } },
    { name: 'sparse branch path', mutate: (context: Record<string, unknown>) => { context.branchPath = new Array(1); } },
  ] as const;
  const malformedFunctionContextRows: Array<{ name: string; message: string }> = malformedFunctionContextCases.map(item => {
    const model = structuredClone(namedFunctionRawModel);
    const context = model.calls[0]?.context as unknown as Record<string, unknown> | undefined;
    if (!context) throw new Error(`named-function malformed fixture missing context for ${item.name}`);
    item.mutate(context);
    return {
      name: item.name,
      message: normalizationMessage(model),
    };
  });
  let namedFunctionAccessorReads = 0;
  const namedFunctionAccessorModel = structuredClone(namedFunctionRawModel);
  Object.defineProperty(namedFunctionAccessorModel.calls[0].context, 'name', {
    configurable: true,
    enumerable: true,
    get: () => {
      namedFunctionAccessorReads += 1;
      return 'menu.display';
    },
  });
  malformedFunctionContextRows.push({
    name: 'name accessor',
    message: normalizationMessage(namedFunctionAccessorModel),
  });
  check('B119 parser-owned function-context exception rejects malformed lookalikes without accessor reads',
    malformedFunctionContextRows.every(row => row.message === 'source edit layout model must be closed plain own data')
      && namedFunctionAccessorReads === 0,
    JSON.stringify({ rows: malformedFunctionContextRows, accessorReads: namedFunctionAccessorReads }));

  const dynamicHandlerLua = [
    'local menu = {}',
    'function menu.display()',
    '  local descriptor = { name = getWidth(), layer = 1 }',
    '  local frame = Helper.createFrameHandle(descriptor, { width = 100, height = 80 })',
    '  local table = frame:addTable(1, { x = 10, y = 20, width = 80, scaling = false })',
    '  local row = table:addRow(false, {})',
    '  row[1]:createText("dynamic handler", {})',
    '  frame.onClick = runtimeHandler',
    '  frame:display()',
    'end',
    '',
  ].join('\n');
  const dynamicHandlerWorkspace = workspace(dynamicHandlerLua);
  const dynamicHandlerSource = buildX4UiWorkspaceSource(dynamicHandlerWorkspace);
  const dynamicHandlerFile = dynamicHandlerSource.bundle?.sourceFiles.find(file => file.path === 'ui/edit.lua');
  if (!dynamicHandlerFile) throw new Error('dynamic-handler source fixture Lua file missing');
  const dynamicHandlerRawModel = dynamicHandlerFile.callModel;
  const dynamicHandlerRawRecord = dynamicHandlerRawModel.handlers[0];
  if (!dynamicHandlerRawRecord) throw new Error('dynamic-handler fixture emitted no handler record');
  const dynamicHandlerOptionalKeys = ['functionSource', 'bodySource', 'parameters'] as const;
  const dynamicHandlerOptionalDescriptors = Object.fromEntries(dynamicHandlerOptionalKeys.map(key => {
    const descriptor = Object.getOwnPropertyDescriptor(dynamicHandlerRawRecord, key);
    return [key, descriptor ? {
      own: Object.prototype.hasOwnProperty.call(dynamicHandlerRawRecord, key),
      enumerable: descriptor.enumerable,
      data: 'value' in descriptor,
      valueIsUndefined: 'value' in descriptor && descriptor.value === undefined,
    } : undefined];
  }));
  const dynamicHandlerNormalization = invokePublic(() => normalizeX4UiSourceEditLayoutModel(dynamicHandlerRawModel));
  const dynamicHandlerNormalizedRecord = dynamicHandlerNormalization.value?.handlers[0];
  const dynamicHandlerGap = dynamicHandlerRawModel.verificationGaps.find(gap =>
    gap.category === 'data-flow'
      && gap.reason === 'onClick handler function body is dynamic or unknown');
  const dynamicHandlerDefinedEvidence = Object.fromEntries(
    Object.entries(dynamicHandlerRawRecord).filter(([, value]) => value !== undefined),
  );
  const dynamicHandlerReceipt = {
    raw: {
      recordType: dynamicHandlerRawRecord.recordType,
      name: dynamicHandlerRawRecord.name,
      path: dynamicHandlerRawRecord.path,
      sourceOrder: dynamicHandlerRawRecord.sourceOrder,
      order: dynamicHandlerRawRecord.order,
      value: dynamicHandlerRawRecord.value,
      context: dynamicHandlerRawRecord.context,
      optionalDescriptors: dynamicHandlerOptionalDescriptors,
      gap: dynamicHandlerGap,
      gaps: dynamicHandlerRawModel.verificationGaps,
    },
    normalization: {
      threw: dynamicHandlerNormalization.threw,
      error: dynamicHandlerNormalization.error,
      normalizedHandlerCount: dynamicHandlerNormalization.value?.handlers.length,
      normalizedOwnKeys: dynamicHandlerNormalizedRecord
        ? Object.getOwnPropertyNames(dynamicHandlerNormalizedRecord)
        : undefined,
    },
  };
  check('B119 dynamic onClick parser-owned optional trio normalizes without losing handler evidence',
    dynamicHandlerRawRecord.recordType === 'handler'
      && dynamicHandlerRawRecord.name === 'onClick'
      && dynamicHandlerOptionalKeys.every(key => {
        const descriptor = Object.getOwnPropertyDescriptor(dynamicHandlerRawRecord, key);
        return descriptor !== undefined
          && descriptor.enumerable
          && 'value' in descriptor
          && descriptor.value === undefined;
      })
      && dynamicHandlerGap !== undefined
      && dynamicHandlerNormalization.threw === false
      && dynamicHandlerNormalizedRecord !== undefined
      && dynamicHandlerOptionalKeys.every(key => !Object.prototype.hasOwnProperty.call(dynamicHandlerNormalizedRecord, key))
      && JSON.stringify(dynamicHandlerNormalizedRecord) === JSON.stringify(dynamicHandlerDefinedEvidence)
      && JSON.stringify(dynamicHandlerNormalization.value?.verificationGaps)
        === JSON.stringify(dynamicHandlerRawModel.verificationGaps),
    JSON.stringify(dynamicHandlerReceipt));

  const dynamicHandlerTarget = dynamicHandlerNormalization.value
    ? createX4UiLayoutTargetCatalog(dynamicHandlerNormalization.value).targets.find(candidate => candidate.kind === 'function')
    : undefined;
  const dynamicHandlerProjection = dynamicHandlerNormalization.value && dynamicHandlerTarget
    ? projectX4UiLayoutProgram(
      dynamicHandlerNormalization.value,
      dynamicHandlerTarget,
      profileFor(dynamicHandlerNormalization.value),
    )
    : undefined;
  const dynamicHandlerContext = dynamicHandlerProjection
    && dynamicHandlerProjection.status !== 'refused'
    && dynamicHandlerProjection.program
    ? {
      workspace: dynamicHandlerWorkspace,
      source: dynamicHandlerSource,
      program: dynamicHandlerProjection.program,
      evidenceAuthority: dynamicHandlerProjection.evidenceAuthority,
    } satisfies SourceEditFixtureContext
    : undefined;
  const dynamicHandlerCatalogOutcome = dynamicHandlerContext
    ? invokePublic(() => catalogFor(dynamicHandlerContext))
    : { threw: false };
  const dynamicHandlerCatalog = dynamicHandlerCatalogOutcome.value;
  const dynamicHandlerWidth = dynamicHandlerCatalog?.editableEntries.find(entry => entry.provenance.callName === 'addTable'
    && entry.provenance.fields.includes('semantics.properties.width'));
  const dynamicHandlerBeforeSource = dynamicHandlerContext ? sourceText(dynamicHandlerContext) : undefined;
  const dynamicHandlerApplyOutcome: PublicCallOutcome<X4UiSourceEditResult> = dynamicHandlerContext
    && dynamicHandlerCatalog
    && dynamicHandlerWidth
    ? invokePublic(() => applyX4UiSourceEdit(
      dynamicHandlerContext.workspace,
      dynamicHandlerContext.source,
      dynamicHandlerCatalog,
      dynamicHandlerWidth.id,
      81,
      dynamicHandlerWidth.path,
      dynamicHandlerWidth.startOffset,
      dynamicHandlerWidth.endOffset,
      dynamicHandlerWidth.expectedText,
    ))
    : { threw: false };
  const dynamicHandlerResult = dynamicHandlerApplyOutcome.value?.accepted === true
    ? dynamicHandlerApplyOutcome.value
    : undefined;
  const dynamicHandlerAfterSource = dynamicHandlerResult ? sourceText(dynamicHandlerResult) : undefined;
  const dynamicHandlerAfterFile = dynamicHandlerResult?.source.bundle?.sourceFiles.find(file => file.path === 'ui/edit.lua');
  const dynamicHandlerAfterRawRecord = dynamicHandlerAfterFile?.callModel.handlers[0];
  const dynamicHandlerAfterModel = dynamicHandlerAfterFile
    ? normalizeX4UiSourceEditLayoutModel(dynamicHandlerAfterFile.callModel)
    : undefined;
  const dynamicHandlerAfterTarget = dynamicHandlerAfterModel
    ? createX4UiLayoutTargetCatalog(dynamicHandlerAfterModel).targets.find(candidate => candidate.kind === 'function')
    : undefined;
  const dynamicHandlerAfterProjection = dynamicHandlerAfterModel && dynamicHandlerAfterTarget
    ? projectX4UiLayoutProgram(dynamicHandlerAfterModel, dynamicHandlerAfterTarget, profileFor(dynamicHandlerAfterModel))
    : undefined;
  const dynamicHandlerCensus = (catalog: X4UiSourceEditCatalog | undefined, program: X4UiLayoutProgram | undefined,
    text: string | undefined) => {
    const deletes = catalog?.deleteEntries || [];
    const rows = catalog?.insertEntries?.filter(entry => entry.kind === 'insert-row') || [];
    const row = program?.rows[0];
    return deletes.length === 2 && deletes.every(entry => entry.kind === 'delete-statement')
      && deletes.some(entry => entry.expectedText.includes('row[1]:createText("dynamic handler", {})'))
      && deletes.some(entry => entry.expectedText.trim() === 'frame:display()')
      && rows.length === 1 && row !== undefined && rows[0].rowId === row.id
      && rows[0].tableId === row.tableId && rows[0].rowIndex === row.rowIndex
      && rows[0].provenance.rowOwner.rowId === row.id && rows[0].provenance.owner.ownerId === row.tableId
      && rows[0].provenance.owner.frameId === rows[0].frameId
      && rows[0].startOffset === text?.indexOf('  frame:display()') && rows[0].endOffset === rows[0].startOffset
      && catalog?.structuralEntries?.length === deletes.length + rows.length;
  };
  check('B119 dynamic-handler named applied-partial geometry remains scalar-actionable through CAS and reparse',
    dynamicHandlerProjection?.status === 'partial'
      && dynamicHandlerProjection.program !== undefined
      && dynamicHandlerProjection.program.operations.length > 0
      && dynamicHandlerProjection.program.operations.every(operation => operation.status === 'applied')
      && dynamicHandlerCatalogOutcome.threw === false
      && dynamicHandlerCatalog?.status === 'ready'
      && dynamicHandlerCatalog.editable
      && dynamicHandlerWidth !== undefined
      && dynamicHandlerBeforeSource !== undefined
      && dynamicHandlerCensus(dynamicHandlerCatalog, dynamicHandlerProjection.program, dynamicHandlerBeforeSource)
      && dynamicHandlerApplyOutcome.threw === false
      && dynamicHandlerResult !== undefined
      && dynamicHandlerResult.changed
      && dynamicHandlerResult.reparsed
      && dynamicHandlerResult.provenanceReestablished
      && dynamicHandlerResult.catalog.status === 'ready'
      && dynamicHandlerResult.catalog.editable
      && dynamicHandlerResult.catalog.verification === 'Not verified in game'
      && dynamicHandlerCensus(dynamicHandlerResult.catalog, dynamicHandlerAfterProjection?.program, dynamicHandlerAfterSource)
      && dynamicHandlerAfterSource === dynamicHandlerBeforeSource.slice(0, dynamicHandlerWidth.startOffset)
        + '81'
        + dynamicHandlerBeforeSource.slice(dynamicHandlerWidth.endOffset)
      && dynamicHandlerAfterRawRecord !== undefined
      && dynamicHandlerOptionalKeys.every(key => {
        const descriptor = Object.getOwnPropertyDescriptor(dynamicHandlerAfterRawRecord, key);
        return descriptor !== undefined
          && descriptor.enumerable
          && 'value' in descriptor
          && descriptor.value === undefined;
      })
      && dynamicHandlerAfterProjection?.status === 'partial'
      && dynamicHandlerAfterProjection.program !== undefined
      && dynamicHandlerAfterProjection.program.operations.length > 0
      && dynamicHandlerAfterProjection.program.operations.every(operation => operation.status === 'applied')
      && dynamicHandlerResult.catalog.editableEntries.some(entry => entry.provenance.callName === 'addTable'
        && entry.provenance.fields.includes('semantics.properties.width')
        && entry.expectedText === '81'),
    JSON.stringify({
      projection: dynamicHandlerProjection ? {
        status: dynamicHandlerProjection.status,
        programStatus: dynamicHandlerProjection.program?.status,
        operationStatuses: dynamicHandlerProjection.program?.operations.map(operation => operation.status),
      } : undefined,
      catalog: dynamicHandlerCatalog ? {
        status: dynamicHandlerCatalog.status,
        editableEntries: dynamicHandlerCatalog.editableEntries.length,
        structuralEntries: dynamicHandlerCatalog.structuralEntries?.length,
      } : undefined,
      apply: {
        threw: dynamicHandlerApplyOutcome.threw,
        error: dynamicHandlerApplyOutcome.error,
        accepted: dynamicHandlerApplyOutcome.value?.accepted,
        changed: dynamicHandlerApplyOutcome.value?.changed,
      },
      after: {
        source: dynamicHandlerAfterSource,
        programStatus: dynamicHandlerAfterProjection?.program?.status,
        operationStatuses: dynamicHandlerAfterProjection?.program?.operations.map(operation => operation.status),
        catalogStatus: dynamicHandlerResult?.catalog.status,
        structuralEntries: dynamicHandlerResult?.catalog.structuralEntries?.length,
      },
    }));

  const malformedDynamicHandlerCases: readonly {
    readonly name: string;
    readonly mutate: (handler: Record<string, unknown>, observe: () => void) => void;
  }[] = [
    { name: 'missing record type', mutate: handler => { delete handler.recordType; } },
    { name: 'wrong record type', mutate: handler => { handler.recordType = 'property'; } },
    { name: 'missing name', mutate: handler => { delete handler.name; } },
    { name: 'wrong name', mutate: handler => { handler.name = 'onChange'; } },
    { name: 'missing path', mutate: handler => { delete handler.path; } },
    { name: 'empty path', mutate: handler => { handler.path = ''; } },
    { name: 'missing source', mutate: handler => { delete handler.source; } },
    { name: 'malformed source', mutate: handler => {
      const source = handler.source as Record<string, unknown>;
      const start = source.start as Record<string, unknown>;
      start.line = '3';
    } },
    { name: 'missing source order', mutate: handler => { delete handler.sourceOrder; } },
    { name: 'nonfinite source order', mutate: handler => { handler.sourceOrder = Number.NaN; } },
    { name: 'missing order', mutate: handler => { delete handler.order; } },
    { name: 'nonfinite order', mutate: handler => { handler.order = Number.POSITIVE_INFINITY; } },
    { name: 'missing value', mutate: handler => { delete handler.value; } },
    { name: 'malformed value', mutate: handler => { handler.value = 'runtimeHandler'; } },
    { name: 'invalid value status', mutate: handler => {
      const value = handler.value as Record<string, unknown>;
      value.status = 'refused';
    } },
    { name: 'missing context', mutate: handler => { delete handler.context; } },
    { name: 'wrong context kind', mutate: handler => {
      const context = handler.context as Record<string, unknown>;
      context.kind = 'function';
    } },
    { name: 'wrong context handler', mutate: handler => {
      const context = handler.context as Record<string, unknown>;
      context.handler = 'onChange';
    } },
    { name: 'missing trio descriptor', mutate: handler => { delete handler.parameters; } },
    { name: 'mixed trio values', mutate: handler => { handler.functionSource = structuredClone(handler.source); } },
    { name: 'non-enumerable trio descriptor', mutate: handler => {
      Object.defineProperty(handler, 'bodySource', {
        configurable: true,
        enumerable: false,
        writable: true,
        value: undefined,
      });
    } },
    { name: 'trio accessor', mutate: (handler, observe) => {
      Object.defineProperty(handler, 'functionSource', {
        configurable: true,
        enumerable: true,
        get: () => {
          observe();
          return undefined;
        },
      });
    } },
    { name: 'name accessor', mutate: (handler, observe) => {
      Object.defineProperty(handler, 'name', {
        configurable: true,
        enumerable: true,
        get: () => {
          observe();
          return 'onClick';
        },
      });
    } },
    { name: 'value accessor', mutate: (handler, observe) => {
      const value = handler.value;
      Object.defineProperty(handler, 'value', {
        configurable: true,
        enumerable: true,
        get: () => {
          observe();
          return value;
        },
      });
    } },
    { name: 'context accessor', mutate: (handler, observe) => {
      const context = handler.context;
      Object.defineProperty(handler, 'context', {
        configurable: true,
        enumerable: true,
        get: () => {
          observe();
          return context;
        },
      });
    } },
    { name: 'custom prototype', mutate: handler => { Object.setPrototypeOf(handler, { inherited: true }); } },
    { name: 'symbol field', mutate: handler => {
      Object.defineProperty(handler, Symbol('dynamic-handler'), { enumerable: true, value: true });
    } },
    { name: 'cycle', mutate: handler => { handler.self = handler; } },
    { name: 'sparse branch path', mutate: handler => {
      const context = handler.context as Record<string, unknown>;
      context.branchPath = new Array(1);
    } },
    { name: 'unrelated undefined', mutate: handler => { handler.auditUndefined = undefined; } },
  ];
  const malformedDynamicHandlerRows = malformedDynamicHandlerCases.map(item => {
    const model = structuredClone(dynamicHandlerRawModel);
    const handler = model.handlers[0] as unknown as Record<string, unknown> | undefined;
    if (!handler) throw new Error(`dynamic-handler malformed fixture missing handler for ${item.name}`);
    let accessorReads = 0;
    item.mutate(handler, () => { accessorReads += 1; });
    return {
      name: item.name,
      message: normalizationMessage(model),
      accessorReads,
    };
  });
  check('B119 dynamic-handler optional trio rejects malformed and hostile lookalikes without reads',
    malformedDynamicHandlerRows.length === 30
      && malformedDynamicHandlerRows.every(row =>
        row.message === 'source edit layout model must be closed plain own data'
          && row.accessorReads === 0),
    JSON.stringify(malformedDynamicHandlerRows));

  const aliasLua = [
    'local menu = { name = "Alias", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local width = 20',
    'local table = frame:addTable(1, { width = width, scaling = false })',
    'local row = table:addRow(false, {})',
    'row[1]:createText("alias", { width = width })',
    '',
  ].join('\n');
  const aliasContext = contextFor(aliasLua);
  const aliasCatalog = catalogFor(aliasContext);
  check('aliased literals remain visible but locked rather than editable at the use site',
    aliasContext.program.status === 'projected'
      && aliasCatalog.status === 'ready'
      && aliasCatalog.lockedEntries.some(entry => entry.reason === 'aliased-value')
      && aliasCatalog.editableEntries.every(entry => entry.expectedText !== 'width'),
    JSON.stringify(aliasCatalog.lockedEntries));

  const unsupportedStringContext = contextFor(baseLua.replace("'old\\n\"quote\"'", '[[long string]]'));
  const unsupportedStringCatalog = catalogFor(unsupportedStringContext);
  check('unsupported long-bracket string style remains non-actionable',
    unsupportedStringContext.program.status === 'projected'
      && unsupportedStringCatalog.lockedEntries.some(entry => entry.reason === 'unsupported-string-style')
      && unsupportedStringCatalog.editableEntries.every(entry => entry.expectedText !== '[[long string]]'),
    JSON.stringify(unsupportedStringCatalog.lockedEntries));

  const shadowContext = contextFor(baseLua, { uiWidgets: [{
    id: 'generated', type: 'button', x: 1, y: 1, w: 10, h: 10, label: 'generated', properties: {},
  }] as ModWorkspace['uiWidgets'] });
  const shadowCatalog = catalogFor(shadowContext);
  const shadowResult = refused(applyX4UiSourceEdit(
    shadowContext.workspace,
    shadowContext.source,
    shadowCatalog,
    shadowCatalog.entries[0].id,
    2,
  ));
  check('generated-shadowed source is locked and cannot mutate the workspace',
    shadowContext.source.status === 'generated-shadowing-source'
      && shadowCatalog.reason === 'generated-shadowed-source'
      && shadowResult.workspace === shadowContext.workspace,
    JSON.stringify(shadowCatalog));

  const foreignContext = contextFor();
  const foreignProgramContext = contextFor(baseLua.replace('name = "Edit"', 'name = "Foreign"'));
  const foreignCatalog = catalogFor({ ...foreignContext, program: foreignProgramContext.program });
  check('crossed program/evidence producer pairs produce a deterministic locked catalog',
    foreignCatalog.status === 'locked'
      && foreignCatalog.reason === 'unsupported-provenance'
      && foreignCatalog.editableEntries.length === 0
      && foreignCatalog.lockedEntries[0].reason === 'unsupported-provenance',
    JSON.stringify(foreignCatalog));

  const unregisteredWorkspace = {
    ...workspace(baseLua),
    passthroughFiles: [
      passthrough('ui.xml', '<addon><environment type="menus"></environment></addon>'),
      passthrough('ui/edit.lua', baseLua),
    ],
  } as ModWorkspace;
  const unregisteredSource = buildX4UiWorkspaceSource(unregisteredWorkspace);
  const unregisteredContext: SourceEditFixtureContext = { ...foreignContext, workspace: unregisteredWorkspace, source: unregisteredSource };
  const unregisteredCatalog = catalogFor(unregisteredContext);
  check('unregistered source remains locked and is never selected for editing',
    unregisteredCatalog.status === 'locked'
      && (unregisteredCatalog.reason === 'unregistered-source' || unregisteredCatalog.reason === 'source-locked'),
    JSON.stringify(unregisteredCatalog));

  const duplicateWorkspace = {
    ...workspace(baseLua),
    passthroughFiles: [
      passthrough('ui.xml', '<addon><environment type="menus"><file name="ui/edit.lua"/><file name="ui/edit.lua"/></environment></addon>'),
      passthrough('ui/edit.lua', baseLua),
    ],
  } as ModWorkspace;
  const duplicateSource = buildX4UiWorkspaceSource(duplicateWorkspace);
  const duplicateCatalog = catalogFor({ ...foreignContext, workspace: duplicateWorkspace, source: duplicateSource });
  check('ambiguous registration remains locked with no source mutation path',
    duplicateCatalog.status === 'locked'
      && duplicateCatalog.reason === 'ambiguous-registration'
      && duplicateCatalog.lockedEntries.every(entry => entry.reason === 'ambiguous-registration'),
    JSON.stringify(duplicateCatalog));

  const syntaxContext = contextFor();
  const syntaxCatalog = catalogFor(syntaxContext);
  const syntaxEntry = editableField(syntaxCatalog, 'string', 'arguments[0]', "'old\\n\"quote\"'", 'createText');
  const syntaxBefore = sourceText(syntaxContext);
  const forgedEndOffset = syntaxEntry.startOffset + 1;
  const forgedEntry: X4UiEditableSourceEditEntry = {
    ...syntaxEntry,
    expectedText: syntaxBefore.slice(syntaxEntry.startOffset, forgedEndOffset),
    sourceLiteral: {
      ...syntaxEntry.sourceLiteral,
      end: {
        ...syntaxEntry.sourceLiteral.start,
        column: syntaxEntry.sourceLiteral.start.column + 1,
        offset: forgedEndOffset,
      },
    },
    endOffset: forgedEndOffset,
  };
  const forgedSyntaxCatalog: X4UiSourceEditCatalog = {
    ...syntaxCatalog,
    entries: syntaxCatalog.entries.map(entry => entry.id === forgedEntry.id ? forgedEntry : entry),
    editableEntries: syntaxCatalog.editableEntries.map(entry => entry.id === forgedEntry.id ? forgedEntry : entry),
  };
  const syntaxRefusal = refused(apply(syntaxContext, forgedSyntaxCatalog, forgedEntry, 'broken'));
  check('forged syntax-breaking range refuses before partial mutation',
    (syntaxRefusal.reason === 'replacement-parse-failure' || syntaxRefusal.reason === 'unsupported-provenance')
      && syntaxRefusal.workspace === syntaxContext.workspace
      && sourceText(syntaxContext) === syntaxBefore,
    JSON.stringify(syntaxRefusal));

  const refusalOrigins = [
    { result: staleText, workspace: staleContext.workspace, source: staleContext.source, catalog: staleCatalog },
    { result: staleRange, workspace: staleContext.workspace, source: staleContext.source, catalog: staleCatalog },
    { result: nan, workspace: nonFiniteContext.workspace, source: nonFiniteContext.source, catalog: nonFiniteCatalog },
    { result: infinity, workspace: nonFiniteContext.workspace, source: nonFiniteContext.source, catalog: nonFiniteCatalog },
    { result: negative, workspace: nonFiniteContext.workspace, source: nonFiniteContext.source, catalog: nonFiniteCatalog },
    { result: negativeZeroCount, workspace: negativeZeroContext.workspace, source: negativeZeroContext.source, catalog: negativeZeroCatalog },
    { result: concurrent, workspace: concurrentWorkspace, source: concurrentContext.source, catalog: concurrentCatalog },
    { result: shadowResult, workspace: shadowContext.workspace, source: shadowContext.source, catalog: shadowCatalog },
    { result: syntaxRefusal, workspace: syntaxContext.workspace, source: syntaxContext.source, catalog: forgedSyntaxCatalog },
  ];
  check('every refusal preserves exact original workspace identity and source bytes',
    refusalOrigins.every(({ result, workspace: expectedWorkspace, source: expectedSource, catalog: expectedCatalog }) =>
      !result.accepted
      && result.changed === false
      && result.workspace === expectedWorkspace
      && result.source === expectedSource
      && result.catalog === expectedCatalog),
    JSON.stringify(refusalOrigins.map(({ result }) => ({ reason: result.reason, changed: result.changed }))));

  const validModel = initial.source.bundle?.sourceFiles.find(file => file.path === 'ui/edit.lua')?.callModel;
  if (!validModel) throw new Error('source fixture call model missing');
  const validEvidence = validModel.calls[0];
  const definedNodeCount = (value: unknown): number => value === undefined ? 0
    : 1 + (value !== null && typeof value === 'object'
      ? Object.values(value).reduce<number>((sum, child) => sum + definedNodeCount(child), 0) : 0);
  const locationPadding = { file: 'padding.lua', sourcePath: undefined,
    start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 1, offset: 1 } };
  const paddingCount = Math.floor((249_000 - definedNodeCount(validModel) - 1) / definedNodeCount(locationPadding));
  const optionalHeavyModel = { ...validModel, boundaryProbe: Array(paddingCount).fill(locationPadding) };
  check('canonical data budget does not charge parser-owned omitted optional fields',
    normalizationMessage(optionalHeavyModel) === 'accepted',
    JSON.stringify({ paddingCount, canonicalNodes: definedNodeCount(optionalHeavyModel), result: normalizationMessage(optionalHeavyModel) }));
  const overBudgetModel = { ...validModel, boundaryProbe: Array(250_001).fill(0) };
  const invalidOptionalModel = { ...validModel, boundaryProbe: { ...locationPadding, extra: undefined } };
  let deepPadding: unknown = 0;
  for (let i = 0; i < 514; i += 1) deepPadding = { child: deepPadding };
  const deepBudgetModel = { ...validModel, boundaryProbe: deepPadding };
  for (const [name, candidate] of [['oversized data', overBudgetModel], ['unknown undefined', invalidOptionalModel], ['deep data', deepBudgetModel]] as const) {
    check(`canonical data traversal rejects ${name}`, normalizationMessage(candidate) === 'source edit layout model must be closed plain own data', normalizationMessage(candidate));
  }
  const canonicalUndefinedPaths = ownUndefinedPaths(validModel);
  const canonicalUndefinedFields = [...new Set(canonicalUndefinedPaths.map(path => path.slice(path.lastIndexOf('.') + 1)))].sort();
  const expectedCanonicalUndefinedFields = ['index', 'parentPath', 'reason', 'reference', 'result', 'sourcePath', 'symbol'];
  const normalizedModel = normalizeX4UiSourceEditLayoutModel(validModel);
  check('closed normalization removes only explicit undefined fields and preserves defined evidence',
    normalizedModel !== validModel
      && isIssuedX4UiLayoutEvidencePairForModel(initial.program, initial.evidenceAuthority, normalizedModel)
      && normalizedModel.file.text === validModel.file.text
      && normalizedModel.calls.length === validModel.calls.length
      && normalizedModel.calls[0]?.name === validEvidence?.name
      && validEvidence !== undefined
      && canonicalUndefinedPaths.length > 0
      && canonicalUndefinedFields.join('|') === expectedCanonicalUndefinedFields.join('|')
      && Object.keys(validEvidence).every(key => Object.prototype.hasOwnProperty.call(validEvidence, key)),
    JSON.stringify({ canonicalUndefinedFields, normalized: normalizedModel, original: validModel }));

  const prototypeModel = Object.create(validModel) as typeof validModel;
  const nestedPrototypeModel = {
    ...validModel,
    calls: validModel.calls.map((call, index) => index === 0 ? Object.create(call) : call),
  } as typeof validModel;
  const accessorModel = { ...validModel } as typeof validModel;
  Object.defineProperty(accessorModel, 'parsed', { enumerable: true, configurable: true, get: () => true });
  const sparseModel = { ...validModel, calls: new Array(Math.max(1, validModel.calls.length)) } as typeof validModel;
  const cyclicModel = structuredClone(validModel);
  Object.defineProperty(cyclicModel.calls[0].semantics, 'cycle', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: cyclicModel,
  });
  class CustomModel {}
  const customModel = structuredClone(validModel);
  Object.setPrototypeOf(customModel, CustomModel.prototype);
  const nonOwnModel = Object.create({ ...validModel }) as typeof validModel;
  const malformedModels = [
    { name: 'prototype-backed model', model: prototypeModel },
    { name: 'nested prototype-backed call', model: nestedPrototypeModel },
    { name: 'accessor model', model: accessorModel },
    { name: 'sparse call array', model: sparseModel },
    { name: 'cyclic model', model: cyclicModel },
    { name: 'custom model', model: customModel },
    { name: 'non-own model', model: nonOwnModel },
  ];
  const malformedMessages = malformedModels.map(item => ({
    ...item,
    message: normalizationMessage(item.model),
  }));
  check('malformed nested normalization is deterministic and never silently accepted',
    malformedMessages.every(item => item.message === 'source edit layout model must be closed plain own data'),
    JSON.stringify(malformedMessages.map(item => ({ name: item.name, message: item.message }))));

  const duplicateCallModel = {
    ...validModel,
    calls: [...validModel.calls, validModel.calls[0]],
  } as typeof validModel;
  const malformedDiscoverInputs = [
    ...malformedModels,
    { name: 'duplicate call evidence', model: duplicateCallModel },
  ];
  const malformedDiscoverResults = malformedDiscoverInputs.map(item => {
    const malformedContext = contextWithCallModel(initial, item.model);
    const beforeBytes = workspaceBytes(malformedContext.workspace);
    const beforeSource = sourceText(malformedContext);
    try {
      const catalog = catalogFor(malformedContext);
      const result = applyById(malformedContext, catalog, authorityCount.id, 2);
      return {
        name: item.name,
        threw: false,
        catalog,
        result,
        context: malformedContext,
        beforeBytes,
        beforeSource,
      };
    } catch (error) {
      return {
        name: item.name,
        threw: true,
        error: error instanceof Error ? error.message : String(error),
        catalog: undefined,
        result: undefined,
        context: malformedContext,
        beforeBytes,
        beforeSource,
      };
    }
  });
  check('malformed model, duplicate call, and layout refusal paths return typed non-mutating source-edit results',
    malformedDiscoverResults.every(item => !item.threw
      && item.catalog !== undefined
      && item.catalog.status === 'locked'
      && item.result !== undefined
      && refusalPreservesInput(item.result, item.context, item.catalog, item.beforeBytes, item.beforeSource)),
    JSON.stringify(malformedDiscoverResults.map(item => ({
      name: item.name,
      threw: item.threw,
      catalog: item.catalog?.reason,
      result: item.result?.accepted ? 'accepted' : item.result?.reason,
      error: item.error,
    }))));

  const reversedCallsModel = structuredClone(normalizedModel);
  reversedCallsModel.calls.reverse();
  const reversedRecordsModel = structuredClone(normalizedModel);
  reversedRecordsModel.records.reverse();
  const retargetedModel = structuredClone(normalizedModel);
  const retargetedCall = retargetedModel.calls.find(call => call.name === 'addTable');
  const retargetedWidth = retargetedCall?.semantics.properties?.find(property => property.normalizedName === 'width');
  if (!retargetedCall || !retargetedWidth || retargetedCall.arguments.length === 0) {
    throw new Error('wrong-literal retarget fixture could not find addTable count and width evidence');
  }
  retargetedCall.arguments[0] = retargetedWidth.value;
  retargetedCall.semantics.count = retargetedWidth.value;
  const addedRecordModel = structuredClone(normalizedModel);
  const addedRecord = addedRecordModel.records.find(record => record.recordType !== 'call');
  if (!addedRecord) throw new Error('complete-model added-record fixture requires a non-call record');
  addedRecordModel.records.push(structuredClone(addedRecord));
  const removedRecordModel = structuredClone(normalizedModel);
  const removedRecordIndex = removedRecordModel.records.findIndex(record => record.recordType !== 'call');
  if (removedRecordIndex < 0) throw new Error('complete-model removed-record fixture requires a non-call record');
  removedRecordModel.records.splice(removedRecordIndex, 1);

  const projectIssuedModelAttack = (name: string, model: X4UiCallModel) => {
    const normalizedAttackModel = normalizeX4UiSourceEditLayoutModel(model);
    const target = createX4UiLayoutTargetCatalog(normalizedAttackModel).targets.find(candidate => candidate.kind === 'top-level');
    if (!target) throw new Error(`${name} fixture top-level target missing`);
    const projection = projectX4UiLayoutProgram(
      normalizedAttackModel,
      target,
      profileFor(normalizedAttackModel),
    );
    if (projection.status !== 'projected' || !projection.program) {
      throw new Error(`${name} fixture did not produce an exact projected pair: ${JSON.stringify(projection)}`);
    }
    return {
      name,
      model: normalizedAttackModel,
      context: {
        workspace: initial.workspace,
        source: initial.source,
        program: projection.program,
        evidenceAuthority: projection.evidenceAuthority,
      } satisfies SourceEditFixtureContext,
    };
  };
  const completeModelAttacks = [
    projectIssuedModelAttack('exact issued pair for reversed calls', reversedCallsModel),
    projectIssuedModelAttack('exact issued pair for reversed records', reversedRecordsModel),
    projectIssuedModelAttack('exact issued pair for same-call wrong-literal retarget', retargetedModel),
    projectIssuedModelAttack('exact issued pair for added complete-model record', addedRecordModel),
    projectIssuedModelAttack('exact issued pair for removed complete-model record', removedRecordModel),
  ];
  const completeModelAttackRows = completeModelAttacks.map(item => {
    const beforeBytes = workspaceBytes(item.context.workspace);
    const beforeSource = sourceText(item.context);
    const alteredPairIssued = isIssuedX4UiLayoutEvidencePairForModel(
      item.context.program,
      item.context.evidenceAuthority,
      item.model,
    );
    const canonicalPairIssued = isIssuedX4UiLayoutEvidencePairForModel(
      item.context.program,
      item.context.evidenceAuthority,
      normalizedModel,
    );
    const catalogOutcome = invokePublic(() => catalogFor(item.context));
    const catalog = catalogOutcome.value;
    const applyOutcome = catalog
      ? invokePublic(() => applyById(
        item.context,
        catalog,
        catalog.editableEntries[0]?.id || authorityCount.id,
        item.name.includes('wrong-literal') ? 90 : 2,
      ))
      : { threw: false };
    const result = applyOutcome.value;
    return {
      name: item.name,
      alteredPairIssued,
      canonicalPairIssued,
      exactCanonicalWorkspace: item.context.workspace === initial.workspace,
      exactCanonicalSource: item.context.source === initial.source,
      discoverThrew: catalogOutcome.threw,
      catalogStatus: catalog?.status,
      catalogReason: catalog?.reason,
      catalogDetail: catalog?.detail,
      editableIssued: catalog?.editableEntries.length || 0,
      applyThrew: applyOutcome.threw,
      accepted: result?.accepted,
      changed: result?.changed,
      applyReason: result?.accepted === false ? result.reason : undefined,
      applyDetail: result?.accepted === false ? result.detail : undefined,
      closed: alteredPairIssued
        && !canonicalPairIssued
        && item.context.workspace === initial.workspace
        && item.context.source === initial.source
        && catalogOutcome.threw === false
        && catalog?.status === 'locked'
        && catalog.reason === 'provenance-drift'
        && catalog.detail === 'layout evidence pair was not issued for the canonical complete source call model'
        && catalog.editableEntries.length === 0
        && applyOutcome.threw === false
        && result?.accepted === false
        && result.changed === false
        && result.reason === 'unsupported-provenance'
        && result.detail === 'catalog layout authority does not match the canonical complete source call model'
        && result.workspace === item.context.workspace
        && result.source === item.context.source
        && result.catalog === catalog
        && workspaceBytes(item.context.workspace) === beforeBytes
        && sourceText(item.context) === beforeSource,
    };
  });

  const malformedNestedInputs = [
    { name: 'non-whitelisted nested undefined', value: undefined, field: 'context.auditUndefined' },
    { name: 'undefined array slot', value: undefined, field: 'assignedTo[0]' },
    { name: 'NaN', value: Number.NaN, field: 'order' },
    { name: '+Infinity', value: Number.POSITIVE_INFINITY, field: 'order' },
    { name: '-Infinity', value: Number.NEGATIVE_INFINITY, field: 'order' },
  ];
  const malformedNestedRows = malformedNestedInputs.map(attack => {
    const model = structuredClone(validModel);
    const call = model.calls.find(candidate => candidate.name === 'addTable');
    if (!call) throw new Error(`malformed nested fixture missing addTable for ${attack.name}`);
    if (attack.field === 'context.auditUndefined') {
      Object.defineProperty(call.context, 'auditUndefined', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: attack.value,
      });
    } else if (attack.field === 'assignedTo[0]') {
      if (!call.assignedTo?.length) throw new Error('malformed nested undefined fixture missing assignedTo evidence');
      Object.defineProperty(call.assignedTo, '0', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: attack.value,
      });
    } else {
      Object.defineProperty(call, 'order', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: attack.value,
      });
    }
    const normalization = normalizationMessage(model);
    const context = contextWithCallModel(initial, model);
    const beforeBytes = workspaceBytes(context.workspace);
    const beforeSource = sourceText(context);
    const catalogOutcome = invokePublic(() => catalogFor(context));
    const catalog = catalogOutcome.value;
    const countEntry = catalog?.editableEntries.find(entry => entry.provenance.callName === 'addTable'
      && entry.provenance.fields.includes('semantics.count'));
    const applyOutcome = catalog
      ? invokePublic(() => applyById(context, catalog, countEntry?.id || authorityCount.id, 2))
      : { threw: false };
    const result = applyOutcome.value;
    return {
      name: attack.name,
      normalization,
      discoverThrew: catalogOutcome.threw,
      catalogStatus: catalog?.status,
      catalogReason: catalog?.reason,
      actionable: countEntry !== undefined,
      applyThrew: applyOutcome.threw,
      accepted: result?.accepted,
      changed: result?.changed,
      closed: normalization === 'source edit layout model must be closed plain own data'
        && catalogOutcome.threw === false
        && catalog?.status === 'locked'
        && countEntry === undefined
        && applyOutcome.threw === false
        && result?.accepted === false
        && result.changed === false
        && result.workspace === context.workspace
        && result.source === context.source
        && workspaceBytes(context.workspace) === beforeBytes
        && sourceText(context) === beforeSource,
    };
  });

  const refusedProgram: X4UiLayoutProgram = {
    ...initial.program,
    status: 'refused',
  };
  const refusedProgramContext: SourceEditFixtureContext = {
    ...initial,
    program: refusedProgram,
  };
  const refusedProgramBeforeBytes = workspaceBytes(refusedProgramContext.workspace);
  const refusedProgramBeforeSource = sourceText(refusedProgramContext);
  const refusedProgramCatalogOutcome = invokePublic(() => catalogFor(refusedProgramContext));
  const refusedProgramCatalog = refusedProgramCatalogOutcome.value;
  const refusedProgramEntry = refusedProgramCatalog?.editableEntries.find(entry => entry.provenance.callName === 'addTable'
    && entry.provenance.fields.includes('semantics.count'));
  const refusedProgramApplyOutcome = refusedProgramCatalog
    ? invokePublic(() => applyById(refusedProgramContext, refusedProgramCatalog, refusedProgramEntry?.id || authorityCount.id, 2))
    : { threw: false };
  const refusedProgramResult = refusedProgramApplyOutcome.value;
  const refusedProgramRows = [{
    name: 'refused layout program retaining target and operations',
    discoverThrew: refusedProgramCatalogOutcome.threw,
    catalogStatus: refusedProgramCatalog?.status,
    catalogReason: refusedProgramCatalog?.reason,
    entryIssued: refusedProgramEntry !== undefined,
    applyThrew: refusedProgramApplyOutcome.threw,
    accepted: refusedProgramResult?.accepted,
    changed: refusedProgramResult?.changed,
  }];
  const refusedProgramClosed = refusedProgramCatalogOutcome.threw === false
    && refusedProgramCatalog?.status === 'locked'
    && refusedProgramEntry === undefined
    && refusedProgramApplyOutcome.threw === false
    && refusedProgramResult?.accepted === false
    && refusedProgramResult.changed === false
    && refusedProgramResult.workspace === refusedProgramContext.workspace
    && refusedProgramResult.source === refusedProgramContext.source
    && workspaceBytes(refusedProgramContext.workspace) === refusedProgramBeforeBytes
    && sourceText(refusedProgramContext) === refusedProgramBeforeSource;

  check('public aliases expose only the positional primitive signatures',
    discoverX4UiSourceEdits.length === 4
      && buildX4UiSourceEditCatalog === discoverX4UiSourceEdits
      && catalogX4UiSourceEdits === discoverX4UiSourceEdits
      && buildX4UiSourceEditCatalog.length === 4
      && catalogX4UiSourceEdits.length === 4
      && applyX4UiSourceEdit.length === 9
      && applyX4UiSourceEditRequest === applyX4UiSourceEdit
      && commitX4UiSourceEdit === applyX4UiSourceEdit
      && applyX4UiSourceEditRequest.length === 9
      && commitX4UiSourceEdit.length === 9);

  const foreignBoundaryContext = contextFor();
  const actualRefusedProjection = projectX4UiLayoutProgram(
    validModel,
    {
      kind: initial.program.target.kind,
      source: initial.program.target.source,
      id: `${initial.program.target.id}:mismatched`,
    },
    profileFor(validModel),
  );
  const actualRefusedDiscovery = actualRefusedProjection.status === 'refused'
    ? invokeDiscoveryBoundary(
      initial.workspace,
      initial.source,
      actualRefusedProjection.program,
      undefined,
    )
    : invokeDiscoveryBoundary(
      initial.workspace,
      initial.source,
      frozenClone(actualRefusedProjection.program),
      frozenClone(actualRefusedProjection.evidenceAuthority),
    );
  const frozenQuartet = {
    workspace: frozenClone(initial.workspace),
    source: frozenClone(initial.source),
    program: frozenClone(initial.program),
    evidence: frozenClone(initial.evidenceAuthority),
  };
  const discoveryWorkspaceProxyCounter: TrapCounter = { reads: 0 };
  const discoverySourceProxyCounter: TrapCounter = { reads: 0 };
  const discoveryProgramProxyCounter: TrapCounter = { reads: 0 };
  const discoveryEvidenceProxyCounter: TrapCounter = { reads: 0 };
  const discoveryWorkspaceProxy = hostileProxy(initial.workspace, discoveryWorkspaceProxyCounter);
  const discoverySourceProxy = hostileProxy(initial.source, discoverySourceProxyCounter);
  const discoveryProgramProxy = hostileProxy(initial.program, discoveryProgramProxyCounter);
  const discoveryEvidenceProxy = hostileProxy(initial.evidenceAuthority, discoveryEvidenceProxyCounter);
  const customPrototypeWorkspace = Object.create(initial.workspace);

  let accessorWorkspaceReads = 0;
  const accessorWorkspace = Object.defineProperty({}, 'passthroughFiles', {
    enumerable: true,
    get(): never {
      accessorWorkspaceReads += 1;
      throw new Error('workspace accessor executed');
    },
  });
  let accessorSourceReads = 0;
  const accessorSource = Object.defineProperty({}, 'bundle', {
    enumerable: true,
    get(): never {
      accessorSourceReads += 1;
      throw new Error('source accessor executed');
    },
  });
  let accessorProgramReads = 0;
  const accessorProgram = Object.defineProperty({}, 'status', {
    enumerable: true,
    get(): never {
      accessorProgramReads += 1;
      throw new Error('program accessor executed');
    },
  });
  let accessorEvidenceReads = 0;
  const accessorEvidence = Object.defineProperty({}, 'calls', {
    enumerable: true,
    get(): never {
      accessorEvidenceReads += 1;
      throw new Error('evidence accessor executed');
    },
  });

  const discoveryBoundaryCases = [
    {
      name: 'deeply cloned and frozen coherent quartet',
      outcome: invokeDiscoveryBoundary(frozenQuartet.workspace, frozenQuartet.source, frozenQuartet.program, frozenQuartet.evidence),
      reads: 0,
    },
    { name: 'one-sided workspace clone', outcome: invokeDiscoveryBoundary(frozenClone(initial.workspace), initial.source, initial.program, initial.evidenceAuthority), reads: 0 },
    { name: 'one-sided source clone', outcome: invokeDiscoveryBoundary(initial.workspace, frozenClone(initial.source), initial.program, initial.evidenceAuthority), reads: 0 },
    { name: 'one-sided program clone', outcome: invokeDiscoveryBoundary(initial.workspace, initial.source, frozenClone(initial.program), initial.evidenceAuthority), reads: 0 },
    { name: 'one-sided evidence clone', outcome: invokeDiscoveryBoundary(initial.workspace, initial.source, initial.program, frozenClone(initial.evidenceAuthority)), reads: 0 },
    { name: 'crossed workspace/source pair', outcome: invokeDiscoveryBoundary(initial.workspace, foreignBoundaryContext.source, initial.program, initial.evidenceAuthority), reads: 0 },
    { name: 'reverse-crossed workspace/source pair', outcome: invokeDiscoveryBoundary(foreignBoundaryContext.workspace, initial.source, initial.program, initial.evidenceAuthority), reads: 0 },
    { name: 'crossed program/evidence pair', outcome: invokeDiscoveryBoundary(initial.workspace, initial.source, foreignBoundaryContext.program, initial.evidenceAuthority), reads: 0 },
    { name: 'reverse-crossed program/evidence pair', outcome: invokeDiscoveryBoundary(initial.workspace, initial.source, initial.program, foreignBoundaryContext.evidenceAuthority), reads: 0 },
    { name: 'workspace proxy', outcome: invokeDiscoveryBoundary(discoveryWorkspaceProxy, initial.source, initial.program, initial.evidenceAuthority), reads: discoveryWorkspaceProxyCounter.reads },
    { name: 'source proxy', outcome: invokeDiscoveryBoundary(initial.workspace, discoverySourceProxy, initial.program, initial.evidenceAuthority), reads: discoverySourceProxyCounter.reads },
    { name: 'program proxy', outcome: invokeDiscoveryBoundary(initial.workspace, initial.source, discoveryProgramProxy, initial.evidenceAuthority), reads: discoveryProgramProxyCounter.reads },
    { name: 'evidence proxy', outcome: invokeDiscoveryBoundary(initial.workspace, initial.source, initial.program, discoveryEvidenceProxy), reads: discoveryEvidenceProxyCounter.reads },
    { name: 'workspace accessor object', outcome: invokeDiscoveryBoundary(accessorWorkspace, initial.source, initial.program, initial.evidenceAuthority), reads: accessorWorkspaceReads },
    { name: 'source accessor object', outcome: invokeDiscoveryBoundary(initial.workspace, accessorSource, initial.program, initial.evidenceAuthority), reads: accessorSourceReads },
    { name: 'program accessor object', outcome: invokeDiscoveryBoundary(initial.workspace, initial.source, accessorProgram, initial.evidenceAuthority), reads: accessorProgramReads },
    { name: 'evidence accessor object', outcome: invokeDiscoveryBoundary(initial.workspace, initial.source, initial.program, accessorEvidence), reads: accessorEvidenceReads },
    { name: 'custom-prototype workspace wrapper', outcome: invokeDiscoveryBoundary(customPrototypeWorkspace, initial.source, initial.program, initial.evidenceAuthority), reads: 0 },
    { name: 'null workspace', outcome: invokeDiscoveryBoundary(null, initial.source, initial.program, initial.evidenceAuthority), reads: 0 },
    { name: 'primitive source', outcome: invokeDiscoveryBoundary(initial.workspace, 1, initial.program, initial.evidenceAuthority), reads: 0 },
    { name: 'primitive program', outcome: invokeDiscoveryBoundary(initial.workspace, initial.source, 'program', initial.evidenceAuthority), reads: 0 },
    { name: 'primitive evidence', outcome: invokeDiscoveryBoundary(initial.workspace, initial.source, initial.program, false), reads: 0 },
    { name: 'exact issued partial pair', outcome: invokeDiscoveryBoundary(dynamicContext.workspace, dynamicContext.source, dynamicContext.program, dynamicContext.evidenceAuthority), reads: 0 },
    { name: 'actual producer refused result', outcome: actualRefusedDiscovery, reads: 0 },
    { name: 'caller-authored refused lookalike', outcome: refusedProgramCatalogOutcome, reads: 0 },
  ];
  const discoveryBoundariesClosed = actualRefusedProjection.status === 'refused'
    && discoveryBoundaryCases.every(item => item.outcome.threw === false
      && item.outcome.value?.status === 'locked'
      && item.outcome.value.editable === false
      && item.reads === 0);

  const applyBoundaryContext = contextFor();
  const applyBoundaryCatalog = catalogFor(applyBoundaryContext);
  const applyBoundaryEntry = editableField(applyBoundaryCatalog, 'number', 'semantics.count', '1', 'addTable');
  const applyBoundaryBeforeBytes = workspaceBytes(applyBoundaryContext.workspace);
  const applyBoundaryBeforeSource = sourceText(applyBoundaryContext);
  const exactCasOutcome = invokeApplyBoundary(
    applyBoundaryContext.workspace,
    applyBoundaryContext.source,
    applyBoundaryCatalog,
    applyBoundaryEntry.id,
    2,
    applyBoundaryEntry.path,
    applyBoundaryEntry.startOffset,
    applyBoundaryEntry.endOffset,
    applyBoundaryEntry.expectedText,
  );
  const clonedApplyCatalog = frozenClone(applyBoundaryCatalog);
  const applyCatalogProxyCounter: TrapCounter = { reads: 0 };
  const applyWorkspaceProxyCounter: TrapCounter = { reads: 0 };
  const applySourceProxyCounter: TrapCounter = { reads: 0 };
  const applyCatalogProxy = hostileProxy(applyBoundaryCatalog, applyCatalogProxyCounter);
  const applyWorkspaceProxy = hostileProxy(applyBoundaryContext.workspace, applyWorkspaceProxyCounter);
  const applySourceProxy = hostileProxy(applyBoundaryContext.source, applySourceProxyCounter);
  let applyCatalogAccessorReads = 0;
  const applyCatalogAccessor = Object.defineProperty({}, 'entries', {
    enumerable: true,
    get(): never {
      applyCatalogAccessorReads += 1;
      throw new Error('catalog accessor executed');
    },
  });
  let hostileReplacementReads = 0;
  const hostileReplacement = Object.defineProperty({}, 'value', {
    enumerable: true,
    get(): never {
      hostileReplacementReads += 1;
      throw new Error('replacement accessor executed');
    },
  });
  const customPrototypeReplacement = Object.create({ scalar: 2 });
  const crossApplyContext = contextFor();
  const crossApplyCatalog = catalogFor(crossApplyContext);
  const applyBoundaryCases = [
    { name: 'exact issued partial catalog', outcome: invokeApplyBoundary(dynamicContext.workspace, dynamicContext.source, dynamicCatalog, dynamicCatalog.entries[0].id, 2), workspace: dynamicContext.workspace, source: dynamicContext.source, catalog: dynamicCatalog, reads: 0 },
    { name: 'cloned catalog', outcome: invokeApplyBoundary(applyBoundaryContext.workspace, applyBoundaryContext.source, clonedApplyCatalog, applyBoundaryEntry.id, 2), workspace: applyBoundaryContext.workspace, source: applyBoundaryContext.source, catalog: clonedApplyCatalog, reads: 0 },
    { name: 'catalog proxy', outcome: invokeApplyBoundary(applyBoundaryContext.workspace, applyBoundaryContext.source, applyCatalogProxy, applyBoundaryEntry.id, 2), workspace: applyBoundaryContext.workspace, source: applyBoundaryContext.source, catalog: applyCatalogProxy, reads: applyCatalogProxyCounter.reads },
    { name: 'catalog accessor object', outcome: invokeApplyBoundary(applyBoundaryContext.workspace, applyBoundaryContext.source, applyCatalogAccessor, applyBoundaryEntry.id, 2), workspace: applyBoundaryContext.workspace, source: applyBoundaryContext.source, catalog: applyCatalogAccessor, reads: applyCatalogAccessorReads },
    { name: 'cross-context catalog', outcome: invokeApplyBoundary(applyBoundaryContext.workspace, applyBoundaryContext.source, crossApplyCatalog, applyBoundaryEntry.id, 2), workspace: applyBoundaryContext.workspace, source: applyBoundaryContext.source, catalog: crossApplyCatalog, reads: 0 },
    { name: 'workspace proxy', outcome: invokeApplyBoundary(applyWorkspaceProxy, applyBoundaryContext.source, applyBoundaryCatalog, applyBoundaryEntry.id, 2), workspace: applyWorkspaceProxy, source: applyBoundaryContext.source, catalog: applyBoundaryCatalog, reads: applyWorkspaceProxyCounter.reads },
    { name: 'source proxy', outcome: invokeApplyBoundary(applyBoundaryContext.workspace, applySourceProxy, applyBoundaryCatalog, applyBoundaryEntry.id, 2), workspace: applyBoundaryContext.workspace, source: applySourceProxy, catalog: applyBoundaryCatalog, reads: applySourceProxyCounter.reads },
    { name: 'unknown entry', outcome: invokeApplyBoundary(applyBoundaryContext.workspace, applyBoundaryContext.source, applyBoundaryCatalog, 'unknown-entry', 2), workspace: applyBoundaryContext.workspace, source: applyBoundaryContext.source, catalog: applyBoundaryCatalog, reads: 0 },
    { name: 'non-string entry id', outcome: invokeApplyBoundary(applyBoundaryContext.workspace, applyBoundaryContext.source, applyBoundaryCatalog, 7, 2), workspace: applyBoundaryContext.workspace, source: applyBoundaryContext.source, catalog: applyBoundaryCatalog, reads: 0 },
    { name: 'undefined replacement', outcome: invokeApplyBoundary(applyBoundaryContext.workspace, applyBoundaryContext.source, applyBoundaryCatalog, applyBoundaryEntry.id, undefined), workspace: applyBoundaryContext.workspace, source: applyBoundaryContext.source, catalog: applyBoundaryCatalog, reads: 0 },
    { name: 'null replacement', outcome: invokeApplyBoundary(applyBoundaryContext.workspace, applyBoundaryContext.source, applyBoundaryCatalog, applyBoundaryEntry.id, null), workspace: applyBoundaryContext.workspace, source: applyBoundaryContext.source, catalog: applyBoundaryCatalog, reads: 0 },
    { name: 'wrong string replacement type', outcome: invokeApplyBoundary(applyBoundaryContext.workspace, applyBoundaryContext.source, applyBoundaryCatalog, applyBoundaryEntry.id, '2'), workspace: applyBoundaryContext.workspace, source: applyBoundaryContext.source, catalog: applyBoundaryCatalog, reads: 0 },
    { name: 'wrong boolean replacement type', outcome: invokeApplyBoundary(applyBoundaryContext.workspace, applyBoundaryContext.source, applyBoundaryCatalog, applyBoundaryEntry.id, true), workspace: applyBoundaryContext.workspace, source: applyBoundaryContext.source, catalog: applyBoundaryCatalog, reads: 0 },
    { name: 'hostile object replacement', outcome: invokeApplyBoundary(applyBoundaryContext.workspace, applyBoundaryContext.source, applyBoundaryCatalog, applyBoundaryEntry.id, hostileReplacement), workspace: applyBoundaryContext.workspace, source: applyBoundaryContext.source, catalog: applyBoundaryCatalog, reads: hostileReplacementReads },
    { name: 'custom-prototype replacement', outcome: invokeApplyBoundary(applyBoundaryContext.workspace, applyBoundaryContext.source, applyBoundaryCatalog, applyBoundaryEntry.id, customPrototypeReplacement), workspace: applyBoundaryContext.workspace, source: applyBoundaryContext.source, catalog: applyBoundaryCatalog, reads: 0 },
    { name: 'NaN replacement', outcome: invokeApplyBoundary(applyBoundaryContext.workspace, applyBoundaryContext.source, applyBoundaryCatalog, applyBoundaryEntry.id, Number.NaN), workspace: applyBoundaryContext.workspace, source: applyBoundaryContext.source, catalog: applyBoundaryCatalog, reads: 0 },
    { name: '+Infinity replacement', outcome: invokeApplyBoundary(applyBoundaryContext.workspace, applyBoundaryContext.source, applyBoundaryCatalog, applyBoundaryEntry.id, Number.POSITIVE_INFINITY), workspace: applyBoundaryContext.workspace, source: applyBoundaryContext.source, catalog: applyBoundaryCatalog, reads: 0 },
    { name: '-Infinity replacement', outcome: invokeApplyBoundary(applyBoundaryContext.workspace, applyBoundaryContext.source, applyBoundaryCatalog, applyBoundaryEntry.id, Number.NEGATIVE_INFINITY), workspace: applyBoundaryContext.workspace, source: applyBoundaryContext.source, catalog: applyBoundaryCatalog, reads: 0 },
    { name: 'wrong expected path', outcome: invokeApplyBoundary(applyBoundaryContext.workspace, applyBoundaryContext.source, applyBoundaryCatalog, applyBoundaryEntry.id, 2, 'ui/wrong.lua'), workspace: applyBoundaryContext.workspace, source: applyBoundaryContext.source, catalog: applyBoundaryCatalog, reads: 0 },
    { name: 'wrong expected start', outcome: invokeApplyBoundary(applyBoundaryContext.workspace, applyBoundaryContext.source, applyBoundaryCatalog, applyBoundaryEntry.id, 2, undefined, applyBoundaryEntry.startOffset + 1), workspace: applyBoundaryContext.workspace, source: applyBoundaryContext.source, catalog: applyBoundaryCatalog, reads: 0 },
    { name: 'wrong expected end', outcome: invokeApplyBoundary(applyBoundaryContext.workspace, applyBoundaryContext.source, applyBoundaryCatalog, applyBoundaryEntry.id, 2, undefined, undefined, applyBoundaryEntry.endOffset + 1), workspace: applyBoundaryContext.workspace, source: applyBoundaryContext.source, catalog: applyBoundaryCatalog, reads: 0 },
    { name: 'wrong expected text', outcome: invokeApplyBoundary(applyBoundaryContext.workspace, applyBoundaryContext.source, applyBoundaryCatalog, applyBoundaryEntry.id, 2, undefined, undefined, undefined, 'stale'), workspace: applyBoundaryContext.workspace, source: applyBoundaryContext.source, catalog: applyBoundaryCatalog, reads: 0 },
    { name: 'non-string expected path', outcome: invokeApplyBoundary(applyBoundaryContext.workspace, applyBoundaryContext.source, applyBoundaryCatalog, applyBoundaryEntry.id, 2, 1), workspace: applyBoundaryContext.workspace, source: applyBoundaryContext.source, catalog: applyBoundaryCatalog, reads: 0 },
    { name: 'non-integer expected start', outcome: invokeApplyBoundary(applyBoundaryContext.workspace, applyBoundaryContext.source, applyBoundaryCatalog, applyBoundaryEntry.id, 2, undefined, 1.5), workspace: applyBoundaryContext.workspace, source: applyBoundaryContext.source, catalog: applyBoundaryCatalog, reads: 0 },
    { name: 'negative expected end', outcome: invokeApplyBoundary(applyBoundaryContext.workspace, applyBoundaryContext.source, applyBoundaryCatalog, applyBoundaryEntry.id, 2, undefined, undefined, -1), workspace: applyBoundaryContext.workspace, source: applyBoundaryContext.source, catalog: applyBoundaryCatalog, reads: 0 },
    { name: 'non-string expected text', outcome: invokeApplyBoundary(applyBoundaryContext.workspace, applyBoundaryContext.source, applyBoundaryCatalog, applyBoundaryEntry.id, 2, undefined, undefined, undefined, hostileReplacement), workspace: applyBoundaryContext.workspace, source: applyBoundaryContext.source, catalog: applyBoundaryCatalog, reads: hostileReplacementReads },
  ];
  const applyBoundariesClosed = exactCasOutcome.threw === false
    && exactCasOutcome.value?.accepted === true
    && exactCasOutcome.value.changed
    && applyBoundaryCases.every(item => item.outcome.threw === false
      && item.outcome.value?.accepted === false
      && item.outcome.value.changed === false
      && item.outcome.value.workspace === item.workspace
      && item.outcome.value.source === item.source
      && item.outcome.value.catalog === item.catalog
      && item.reads === 0)
    && workspaceBytes(applyBoundaryContext.workspace) === applyBoundaryBeforeBytes
    && sourceText(applyBoundaryContext) === applyBoundaryBeforeSource;

  let hostileWrapperReads = 0;
  const hostileWrapper = Object.defineProperties({}, {
    workspace: { enumerable: true, get(): never { hostileWrapperReads += 1; throw new Error('wrapper workspace getter executed'); } },
    source: { enumerable: true, get(): never { hostileWrapperReads += 1; throw new Error('wrapper source getter executed'); } },
    catalog: { enumerable: true, get(): never { hostileWrapperReads += 1; throw new Error('wrapper catalog getter executed'); } },
    request: { enumerable: true, get(): never { hostileWrapperReads += 1; throw new Error('wrapper request getter executed'); } },
  });
  const hostileWrapperOutcome = invokePublic(() => {
    // @ts-expect-error The removed object-wrapper overload must remain unrepresentable and inert at runtime.
    return applyX4UiSourceEdit(hostileWrapper);
  });
  const wrapperOverloadClosed = hostileWrapperOutcome.threw === false
    && hostileWrapperReads === 0
    && hostileWrapperOutcome.value?.accepted === false
    && hostileWrapperOutcome.value.changed === false
    && hostileWrapperOutcome.value.workspace === hostileWrapper;

  const publicBoundaryRows = [
    ...discoveryBoundaryCases.map(item => ({
      name: `discover ${item.name}`,
      threw: item.outcome.threw,
      status: item.outcome.value?.status,
      reads: item.reads,
    })),
    ...applyBoundaryCases.map(item => ({
      name: `apply ${item.name}`,
      threw: item.outcome.threw,
      accepted: item.outcome.value?.accepted,
      reads: item.reads,
    })),
    {
      name: 'removed nested request wrapper overload',
      threw: hostileWrapperOutcome.threw,
      accepted: hostileWrapperOutcome.value?.accepted,
      reads: hostileWrapperReads,
    },
  ];
  const publicBoundariesClosed = discoveryBoundariesClosed
    && applyBoundariesClosed
    && wrapperOverloadClosed;

  const round2Families = {
    canonicalOptionalUndefined: canonicalUndefinedFields,
    completeModelAuthority: { total: completeModelAttackRows.length, rows: completeModelAttackRows },
    malformedNestedEvidence: { total: malformedNestedRows.length, rows: malformedNestedRows },
    refusedProgram: { total: refusedProgramRows.length, rows: refusedProgramRows },
    publicBoundaryContainment: { total: publicBoundaryRows.length, rows: publicBoundaryRows },
  };
  console.log(`x4UiSourceEdits 7B-C.1 causal families: ${JSON.stringify(round2Families)}`);
  check('five real producer-issued altered complete models refuse against the exact canonical workspace/source pair',
    completeModelAttackRows.length === 5
      && completeModelAttackRows.every(row => row.closed),
    JSON.stringify(completeModelAttackRows));
  check('7B-C.1 complete-model authority and containment families fail closed without weakening valid source edits',
    completeModelAttackRows.every(row => row.closed)
      && malformedNestedRows.every(row => row.closed)
      && refusedProgramClosed
      && publicBoundariesClosed,
    JSON.stringify(round2Families));

  const model = buildX4UiCallModel({ rel: 'selftest/direct.lua', text: 'local value = 1\n' });
  const modelTarget = createX4UiLayoutTargetCatalog(model).targets[0];
  check('selftest fixture uses the existing parser/model owners only',
    modelTarget !== undefined && model.file.text === 'local value = 1\n' && typeof projectX4UiLayoutProgram === 'function');

  const schemaColorLocation = (startOffset: number, endOffset: number) => ({
    file: 'ui/edit.lua',
    sourcePath: 'fixture://ui/edit.lua',
    start: { line: 1, column: startOffset, offset: startOffset },
    end: { line: 1, column: endOffset, offset: endOffset },
  });
  const schemaSourceLiteralColor = {
    kind: 'color' as const,
    domain: 'source-literal-percent-alpha' as const,
    r: 1,
    g: 2,
    b: 3,
    a: 4,
    declarationExpression: '{ r = 1, g = 2, b = 3, a = 4 }',
    declarationSource: schemaColorLocation(0, 40),
    channels: {
      r: { value: 1, expression: '1', source: schemaColorLocation(10, 11), keySource: schemaColorLocation(4, 5) },
      g: { value: 2, expression: '2', source: schemaColorLocation(18, 19), keySource: schemaColorLocation(12, 13) },
      b: { value: 3, expression: '3', source: schemaColorLocation(26, 27), keySource: schemaColorLocation(20, 21) },
      a: { value: 4, expression: '4', source: schemaColorLocation(34, 35), keySource: schemaColorLocation(28, 29) },
    },
    gameVerification: 'Not verified in game' as const,
  };
  const schemaCanonicalColor = {
    kind: 'color' as const,
    domain: 'canonical-xml-byte-alpha' as const,
    canonicalIdentity: 'x4-9.00' as const,
    requestedId: 'white',
    resolvedBaseId: 'white',
    r: 255,
    g: 255,
    b: 255,
    a: 255,
    glow: 0,
    baseSource: { path: X4_UI_CORPUS_COLORS_XML_PATH, index: 0, id: 'white' },
    sourceIdentities: {
      xml: {
        path: X4_UI_CORPUS_COLORS_XML_PATH,
        relativePath: X4_UI_CORPUS_COLORS_XML_PATH,
        sha256: X4_UI_CORPUS_COLORS_XML_SHA256,
        size: X4_UI_CORPUS_COLORS_XML_SIZE,
      },
      xsd: {
        path: X4_UI_CORPUS_COLORS_XSD_PATH,
        relativePath: X4_UI_CORPUS_COLORS_XSD_PATH,
        sha256: X4_UI_CORPUS_COLORS_XSD_SHA256,
        size: X4_UI_CORPUS_COLORS_XSD_SIZE,
      },
    },
    gameVerification: 'Not verified in game' as const,
  };
  const cloneSchemaColor = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  const sourceColorExtra = cloneSchemaColor(schemaSourceLiteralColor) as Record<string, unknown>;
  sourceColorExtra.extraRoot = true;
  const sourceColorMissingChannelKey = cloneSchemaColor(schemaSourceLiteralColor) as Record<string, unknown>;
  delete ((sourceColorMissingChannelKey.channels as Record<string, unknown>).r as Record<string, unknown>).keySource;
  const sourceColorCustomPrototype = cloneSchemaColor(schemaSourceLiteralColor) as Record<string, unknown>;
  Object.setPrototypeOf(
    (sourceColorCustomPrototype.channels as Record<string, unknown>).r,
    { inherited: true },
  );
  const sourceColorOutOfRange = cloneSchemaColor(schemaSourceLiteralColor) as Record<string, unknown>;
  sourceColorOutOfRange.r = 256;
  ((sourceColorOutOfRange.channels as Record<string, unknown>).r as Record<string, unknown>).value = 256;
  const canonicalColorExtra = cloneSchemaColor(schemaCanonicalColor) as Record<string, unknown>;
  canonicalColorExtra.extraRoot = true;
  const canonicalColorIdentity = cloneSchemaColor(schemaCanonicalColor) as Record<string, unknown>;
  canonicalColorIdentity.canonicalIdentity = 'x4-8.00';
  const canonicalColorHash = cloneSchemaColor(schemaCanonicalColor) as Record<string, unknown>;
  ((canonicalColorHash.sourceIdentities as Record<string, unknown>).xml as Record<string, unknown>).sha256 = '0'.repeat(64);
  const canonicalColorOutOfRange = cloneSchemaColor(schemaCanonicalColor) as Record<string, unknown>;
  canonicalColorOutOfRange.r = 256;
  const exactColorOwnerRows = [
    { name: 'source literal valid', candidate: schemaSourceLiteralColor, expected: true },
    { name: 'canonical valid', candidate: schemaCanonicalColor, expected: true },
    { name: 'source literal extra root key', candidate: sourceColorExtra, expected: false },
    { name: 'source literal missing channel keySource', candidate: sourceColorMissingChannelKey, expected: false },
    { name: 'source literal custom channel prototype', candidate: sourceColorCustomPrototype, expected: false },
    { name: 'source literal channel range', candidate: sourceColorOutOfRange, expected: false },
    { name: 'canonical extra root key', candidate: canonicalColorExtra, expected: false },
    { name: 'canonical identity constant', candidate: canonicalColorIdentity, expected: false },
    { name: 'canonical source hash', candidate: canonicalColorHash, expected: false },
    { name: 'canonical channel range', candidate: canonicalColorOutOfRange, expected: false },
  ];
  const exactColorOwnerResults = exactColorOwnerRows.map(row => ({
    name: row.name,
    expected: row.expected,
    actual: isExactX4UiLayoutColorValue(row.candidate),
  }));
  check('B119 exact color owner validates both domains and rejects malformed schema/semantic controls',
    exactColorOwnerResults.length === 10
      && exactColorOwnerResults.every(row => row.actual === row.expected),
    JSON.stringify(exactColorOwnerResults));

  const scalarChecksBeforeBatch8B = checks.length;
  const structuralChecks: Check[] = [
    {
      name: '8B structural source-edit owner exposes typed discovery and application entry points',
      pass: typeof discoverX4UiSourceEdits === 'function'
        && typeof applyX4UiSourceStructuralEdit === 'function',
    },
  ];
  checks.push(...structuralChecks);
  const structuralInitialCatalog = catalogFor(initial);
  check('8B discovery issues root structural actions from the exact source/layout authority',
    structuralInitialCatalog.status === 'ready'
      && (structuralInitialCatalog.deleteEntries || []).some(entry => entry.provenance.callBindings.some(binding => binding.callName === 'display'))
      && (structuralInitialCatalog.insertEntries || []).some(entry => entry.anchor === 'fallback-display'),
    JSON.stringify({ status: structuralInitialCatalog.status, deletes: structuralInitialCatalog.deleteEntries, inserts: structuralInitialCatalog.insertEntries }));
  const causalReplaceLua = [
    'local menu = { name = "Replace", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local table = frame:addTable(2, {})',
    'local row = table:addRow(false, {})',
    'row[2]:createText("body", {})',
    'frame:display()',
    '',
  ].join('\n');
  const causalReplaceContext = contextFor(causalReplaceLua);
  const causalReplaceCatalog = catalogFor(causalReplaceContext);
  const causalReplaceEntries = (causalReplaceCatalog.structuralEntries || []).filter(entry =>
    (entry as unknown as { readonly kind?: string }).kind === 'replace-statement');
  check('B119 causal fail-first: owner issues one row-local replace-statement entry',
    causalReplaceEntries.length === 1,
    JSON.stringify({ structuralEntries: causalReplaceCatalog.structuralEntries }));
  const causalReplaceEntry = structuralReplace(causalReplaceCatalog, entry =>
    entry.callBindings.length === 1 && entry.callBindings[0].callName === 'createText');
  const causalReplacePayload = 'row[1]:setColSpan(2):createText("body", {})';
  const causalReplaceBefore = sourceText(causalReplaceContext);
  const causalReplaceBeforeBytes = workspaceBytes(causalReplaceContext.workspace);
  const causalReplaceBeforeFile = causalReplaceContext.source.bundle?.sourceFiles.find(file => file.path === 'ui/edit.lua');
  const causalReplaceBeforeCalls = causalReplaceBeforeFile?.callModel.calls || [];
  const causalReplaceBeforeOperations = causalReplaceContext.program.operations;
  const causalReplaceResult = structuralApply(
    causalReplaceContext,
    causalReplaceCatalog,
    causalReplaceEntry,
    causalReplacePayload,
  );
  const causalReplaceAfterFile = causalReplaceResult.accepted
    ? causalReplaceResult.source.bundle?.sourceFiles.find(file => file.path === 'ui/edit.lua')
    : undefined;
  const causalReplaceAfterOperations = causalReplaceResult.accepted
    ? projectedProgramFor(causalReplaceResult.source)?.program.operations || []
    : [];
  const causalReplaceAfterRangeCalls = causalReplaceAfterFile?.callModel.calls.filter(call =>
    call.source.start.offset >= causalReplaceEntry.startOffset
      && call.source.end.offset <= causalReplaceEntry.startOffset + causalReplacePayload.length) || [];
  const causalReplaceAfterRangeOperations = causalReplaceAfterOperations.filter(operation =>
    operation.source.start.offset >= causalReplaceEntry.startOffset
      && operation.source.end.offset <= causalReplaceEntry.startOffset + causalReplacePayload.length);
  const causalReplaceRemovedCallOrders = new Set(causalReplaceEntry.callBindings.map(binding => binding.callOrder));
  const causalReplaceRemovedOperationIds = new Set(causalReplaceEntry.callBindings.map(binding => binding.operationId));
  const causalReplaceAfterEntry = causalReplaceResult.accepted
    ? structuralReplace(causalReplaceResult.catalog, entry => entry.startOffset === causalReplaceEntry.startOffset
      && entry.expectedText === causalReplacePayload)
    : undefined;
  check('B119 row-local replacement is atomic, exact-delta, same-chain, reparsed, and parent-immutable',
    causalReplaceResult.accepted
      && causalReplaceResult.changed
      && causalReplaceResult.reparsed
      && causalReplaceResult.provenanceReestablished
      && sourceText(causalReplaceResult) === causalReplaceBefore.slice(0, causalReplaceEntry.startOffset)
        + causalReplacePayload
        + causalReplaceBefore.slice(causalReplaceEntry.endOffset)
      && sourceText(causalReplaceResult).includes(causalReplacePayload)
      && !sourceText(causalReplaceResult).includes('row[2]:createText("body", {})')
      && workspaceBytes(causalReplaceContext.workspace) === causalReplaceBeforeBytes
      && causalReplaceResult.catalog !== causalReplaceCatalog
      && causalReplaceResult.catalog.sourceIdentity.sha256 !== causalReplaceCatalog.sourceIdentity.sha256
      && causalReplaceBeforeCalls.length + 1 === (causalReplaceAfterFile?.callModel.calls.length || 0)
      && causalReplaceBeforeOperations.length + 1 === causalReplaceAfterOperations.length
      && causalReplaceEntry.callBindings.every(binding =>
        !causalReplaceAfterFile?.callModel.calls.some(call => call.name === binding.callName
          && call.source.start.offset === binding.callSource.start.offset
          && call.source.end.offset === binding.callSource.end.offset))
      && causalReplaceEntry.callBindings.every(binding =>
        !causalReplaceAfterOperations.some(operation => operation.id === binding.operationId))
      && causalReplaceAfterRangeCalls.map(call => call.name).join('|') === 'setColSpan|createText'
      && causalReplaceAfterRangeOperations.map(operation => operation.kind).join('|') === 'setColSpan|createText'
      && causalReplaceAfterRangeOperations.every(operation => operation.status === 'applied')
      && causalReplaceAfterEntry?.provenance.rowOwner?.frameId === causalReplaceEntry.provenance.rowOwner.frameId
      && causalReplaceAfterEntry.provenance.rowOwner?.tableId === causalReplaceEntry.provenance.rowOwner.tableId
      && causalReplaceAfterEntry.provenance.rowOwner?.rowId === causalReplaceEntry.provenance.rowOwner.rowId
      && causalReplaceRemovedCallOrders.size === 1
      && causalReplaceRemovedOperationIds.size === 1,
    JSON.stringify({
      entry: causalReplaceEntry,
      result: causalReplaceResult,
      beforeCalls: causalReplaceBeforeCalls.length,
      afterCalls: causalReplaceAfterFile?.callModel.calls.length,
      beforeOperations: causalReplaceBeforeOperations.length,
      afterOperations: causalReplaceAfterOperations.length,
      replacementCalls: causalReplaceAfterRangeCalls.map(call => call.name),
      replacementOperations: causalReplaceAfterRangeOperations.map(operation => operation.kind),
    }));
  const replacementPayloadRefusalCases: readonly {
    readonly name: string;
    readonly payload?: string;
    readonly reason: string;
  }[] = [
    { name: 'missing payload', reason: 'invalid-request' },
    { name: 'malformed payload', payload: 'row[1]:createText("body", {}', reason: 'replacement-parse-failure' },
    { name: 'multiple statements', payload: 'row[1]:createText("body", {}); row[2]:createText("other", {})', reason: 'replacement-parse-failure' },
    { name: 'newline payload', payload: 'row[1]:createText("body", {})\nrow[2]:createText("other", {})', reason: 'invalid-request' },
    { name: 'oversized payload', payload: 'x'.repeat(32769), reason: 'invalid-request' },
    { name: 'nested non-UI invocation', payload: 'row[1]:createText(measureHeight(), {})', reason: 'replacement-parse-failure' },
    { name: 'assignment', payload: 'local replacement = row[1]:createText("body", {})', reason: 'replacement-parse-failure' },
    { name: 'control flow', payload: 'if enabled then row[1]:createText("body", {}) end', reason: 'replacement-parse-failure' },
    { name: 'non-UI call', payload: 'os.execute("unsafe")', reason: 'replacement-parse-failure' },
    { name: 'unsupported direct UI call', payload: 'row[1]:setColWidthPercent(1, 50)', reason: 'replacement-parse-failure' },
  ];
  const replacementPayloadRefusalReceipts = replacementPayloadRefusalCases.map(item => {
    const context = contextFor(causalReplaceLua);
    const catalog = catalogFor(context);
    const entry = structuralReplace(catalog, candidate => candidate.callBindings.length === 1);
    const beforeSource = sourceText(context);
    const beforeBytes = workspaceBytes(context.workspace);
    const result = structuralApply(context, catalog, entry, item.payload);
    return {
      name: item.name,
      reason: structuralResultReason(result),
      pass: structuralRefusalPreservesInput(result, context, catalog, beforeBytes, beforeSource)
        && structuralResultReason(result) === item.reason,
    };
  });
  check('B119 replacement parser rejects malformed, multi-statement, oversized, hidden, assignment, control-flow, and non-UI payloads without mutation',
    replacementPayloadRefusalReceipts.every(receipt => receipt.pass),
    JSON.stringify(replacementPayloadRefusalReceipts));

  const replacementOwnerLua = [
    'local menu = { name = "Replacement owners", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local table = frame:addTable(2, {})',
    'local rowA = table:addRow(false, {})',
    'local rowB = table:addRow(false, {})',
    'local otherTable = frame:addTable(2, {})',
    'local otherRow = otherTable:addRow(false, {})',
    'local otherFrame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local foreignTable = otherFrame:addTable(2, {})',
    'local foreignRow = foreignTable:addRow(false, {})',
    'rowA[2]:createText("body", {})',
    'frame:display()',
    'otherFrame:display()',
    '',
  ].join('\n');
  const replacementOwnerCases = [
    { name: 'different row', payload: 'rowB[1]:createText("body", {})' },
    { name: 'different table', payload: 'otherRow[1]:createText("body", {})' },
    { name: 'different frame', payload: 'foreignRow[1]:createText("body", {})' },
  ] as const;
  const replacementOwnerReceipts = replacementOwnerCases.map(item => {
    const context = contextFor(replacementOwnerLua);
    const catalog = catalogFor(context);
    const entry = structuralReplace(catalog, candidate => candidate.callBindings.some(binding => binding.callName === 'createText'));
    const beforeSource = sourceText(context);
    const beforeBytes = workspaceBytes(context.workspace);
    const result = structuralApply(context, catalog, entry, item.payload);
    return {
      name: item.name,
      reason: structuralResultReason(result),
      pass: structuralRefusalPreservesInput(result, context, catalog, beforeBytes, beforeSource)
        && structuralResultReason(result) === 'reparse-provenance-drift',
    };
  });
  check('B119 replacement reparse refuses a different row, table, or frame owner chain without mutation',
    replacementOwnerReceipts.every(receipt => receipt.pass),
    JSON.stringify(replacementOwnerReceipts));

  const staleReplacementContext = contextFor(causalReplaceLua.replace('row[2]:createText', 'row[1]:createText'));
  const staleReplacementBeforeSource = sourceText(staleReplacementContext);
  const staleReplacementBeforeBytes = workspaceBytes(staleReplacementContext.workspace);
  const staleReplacementResult = structuralApply(
    staleReplacementContext,
    causalReplaceCatalog,
    causalReplaceEntry,
    causalReplacePayload,
  );
  const foreignReplacementCatalog = frozenClone(causalReplaceCatalog) as X4UiSourceEditCatalog;
  const foreignReplacementEntry = structuralReplace(foreignReplacementCatalog, candidate => candidate.callBindings.length === 1);
  const foreignReplacementBeforeSource = sourceText(causalReplaceContext);
  const foreignReplacementBeforeBytes = workspaceBytes(causalReplaceContext.workspace);
  const foreignReplacementResult = structuralApply(
    causalReplaceContext,
    foreignReplacementCatalog,
    foreignReplacementEntry,
    causalReplacePayload,
  );
  const casReplacementContext = contextFor(causalReplaceLua);
  const casReplacementCatalog = catalogFor(casReplacementContext);
  const casReplacementEntry = structuralReplace(casReplacementCatalog, candidate => candidate.callBindings.length === 1);
  const casReplacementBeforeSource = sourceText(casReplacementContext);
  const casReplacementBeforeBytes = workspaceBytes(casReplacementContext.workspace);
  const casReplacementResult = structuralApply(
    casReplacementContext,
    casReplacementCatalog,
    casReplacementEntry,
    causalReplacePayload,
    { startOffset: casReplacementEntry.startOffset + 1 },
  );
  const rangeReplacementContext = contextFor(causalReplaceLua);
  const rangeReplacementCatalog = catalogFor(rangeReplacementContext);
  const rangeReplacementEntry = structuralReplace(rangeReplacementCatalog, candidate => candidate.callBindings.length === 1);
  const rangeReplacementBeforeSource = sourceText(rangeReplacementContext);
  const rangeReplacementBeforeBytes = workspaceBytes(rangeReplacementContext.workspace);
  const rangeReplacementResult = structuralApply(
    rangeReplacementContext,
    rangeReplacementCatalog,
    rangeReplacementEntry,
    causalReplacePayload,
    { endOffset: rangeReplacementBeforeSource.length + 1 },
  );
  check('B119 stale/foreign replacement authority, CAS, and out-of-range byte requests refuse without mutation',
    structuralRefusalPreservesInput(staleReplacementResult, staleReplacementContext, causalReplaceCatalog, staleReplacementBeforeBytes, staleReplacementBeforeSource)
      && structuralRefusalPreservesInput(foreignReplacementResult, causalReplaceContext, foreignReplacementCatalog, foreignReplacementBeforeBytes, foreignReplacementBeforeSource)
      && structuralRefusalPreservesInput(casReplacementResult, casReplacementContext, casReplacementCatalog, casReplacementBeforeBytes, casReplacementBeforeSource)
      && structuralRefusalPreservesInput(rangeReplacementResult, rangeReplacementContext, rangeReplacementCatalog, rangeReplacementBeforeBytes, rangeReplacementBeforeSource)
      && structuralResultReason(staleReplacementResult) === 'unsupported-provenance'
      && structuralResultReason(foreignReplacementResult) === 'unsupported-provenance'
      && structuralResultReason(casReplacementResult) === 'stale-range'
      && structuralResultReason(rangeReplacementResult) === 'stale-range',
    JSON.stringify({
      stale: structuralResultReason(staleReplacementResult),
      foreign: structuralResultReason(foreignReplacementResult),
      cas: structuralResultReason(casReplacementResult),
      range: structuralResultReason(rangeReplacementResult),
    }));

  const replacementHostileProxyCounter: TrapCounter = { reads: 0 };
  const replacementHostileCatalog = hostileProxy(causalReplaceCatalog, replacementHostileProxyCounter);
  const replacementHostileResult = structuralApply(
    causalReplaceContext,
    replacementHostileCatalog,
    causalReplaceEntry,
    causalReplacePayload,
  );
  const replacementPrototypeCatalog = Object.create({ inherited: true }) as X4UiSourceEditCatalog;
  const replacementPrototypeResult = structuralApply(
    causalReplaceContext,
    replacementPrototypeCatalog,
    causalReplaceEntry,
    causalReplacePayload,
  );
  check('B119 replacement prototype and accessor/alias graph boundaries refuse before reads or mutation',
    replacementHostileResult.accepted === false
      && replacementHostileResult.changed === false
      && replacementHostileResult.catalog === replacementHostileCatalog
      && replacementHostileProxyCounter.reads === 0
      && replacementPrototypeResult.accepted === false
      && replacementPrototypeResult.changed === false
      && replacementPrototypeResult.catalog === replacementPrototypeCatalog,
    JSON.stringify({
      hostile: structuralResultReason(replacementHostileResult),
      hostileReads: replacementHostileProxyCounter.reads,
      prototype: structuralResultReason(replacementPrototypeResult),
    }));

  const replacementOracleProjection = causalReplaceResult.accepted
    ? projectedProgramFor(causalReplaceResult.source)
    : undefined;
  const replacementOracleAfterFile = causalReplaceResult.accepted
    ? causalReplaceResult.source.bundle?.sourceFiles.find(file => file.path === 'ui/edit.lua')
    : undefined;
  const replacementOracleCallIndexes = replacementOracleAfterFile?.callModel.calls
    .map((call, index) => ({ call, index }))
    .filter(({ call }) => call.source.start.offset >= causalReplaceEntry.startOffset
      && call.source.end.offset <= causalReplaceEntry.startOffset + causalReplacePayload.length)
    .map(({ index }) => index) || [];
  const replacementOracleOperationIndexes = replacementOracleProjection?.program.operations
    .map((operation, index) => ({ operation, index }))
    .filter(({ operation }) => operation.source.start.offset >= causalReplaceEntry.startOffset
      && operation.source.end.offset <= causalReplaceEntry.startOffset + causalReplacePayload.length)
    .map(({ index }) => index) || [];
  const replacementOracleInput = causalReplaceResult.accepted
    && replacementOracleAfterFile
    && replacementOracleProjection
    ? {
      beforeCalls: causalReplaceBeforeFile?.callModel.calls || [],
      afterCalls: replacementOracleAfterFile.callModel.calls,
      beforeRecords: causalReplaceBeforeFile?.callModel.records || [],
      afterRecords: replacementOracleAfterFile.callModel.records,
      beforeOperations: causalReplaceBeforeOperations,
      afterOperations: replacementOracleProjection.program.operations,
      entry: causalReplaceEntry,
      beforeText: causalReplaceBefore,
      afterText: sourceText(causalReplaceResult),
      replacementLength: causalReplacePayload.length,
      insertedCallIndex: -1,
      insertedOperationIndex: -1,
      replacementCallIndexes: replacementOracleCallIndexes,
      replacementCallNames: replacementOracleCallIndexes.map(index => replacementOracleAfterFile.callModel.calls[index].name),
      replacementCallOrders: replacementOracleCallIndexes.map(index => replacementOracleAfterFile.callModel.calls[index].order),
      replacementOperationIndexes: replacementOracleOperationIndexes,
      replacementOperationKinds: replacementOracleOperationIndexes.map(index => replacementOracleProjection.program.operations[index].kind),
      replacementOperationIds: replacementOracleOperationIndexes.map(index => replacementOracleProjection.program.operations[index].id),
      replacementOperationModelOrders: replacementOracleOperationIndexes.map(index => replacementOracleProjection.program.operations[index].modelOrder),
    }
    : undefined;
  const ledgerDriftInput = replacementOracleInput ? structuredClone(replacementOracleInput) : undefined;
  if (ledgerDriftInput) ledgerDriftInput.replacementOperationIds[0] = 'foreign-replacement-operation';
  const ownerDriftInput = replacementOracleInput ? structuredClone(replacementOracleInput) : undefined;
  if (ownerDriftInput) {
    const replacementOperation = ownerDriftInput.afterOperations[ownerDriftInput.replacementOperationIndexes[0]] as unknown as Record<string, unknown>;
    replacementOperation.tableId = 'foreign-replacement-table';
  }
  const kernelDriftInput = replacementOracleInput ? structuredClone(replacementOracleInput) : undefined;
  if (kernelDriftInput) {
    const addRow = kernelDriftInput.afterOperations.find(operation => (operation as unknown as Record<string, unknown>).kind === 'addRow') as unknown as Record<string, unknown> | undefined;
    const kernel = addRow ? asRecord(addRow.kernel) : undefined;
    const stateAfter = kernel ? asRecord(kernel.stateAfter) : undefined;
    const properties = stateAfter ? asRecord(stateAfter.properties) : undefined;
    if (properties && typeof properties.width === 'number') properties.width += 1;
  }
  const dynamicReplacementCatalog = dynamicCatalog;
  check('B119 replacement ledger, owner, kernel, and non-applied-operation drift refuse',
    replacementOracleInput !== undefined
      && compareX4UiSourceStructuralLedgerCorrespondence(replacementOracleInput)
      && ledgerDriftInput !== undefined
      && !compareX4UiSourceStructuralLedgerCorrespondence(ledgerDriftInput)
      && ownerDriftInput !== undefined
      && !compareX4UiSourceStructuralLedgerCorrespondence(ownerDriftInput)
      && kernelDriftInput !== undefined
      && !compareX4UiSourceStructuralLedgerCorrespondence(kernelDriftInput)
      && dynamicReplacementCatalog.status === 'locked'
      && dynamicReplacementCatalog.reason === 'operation-not-applied'
      && (dynamicReplacementCatalog.replaceEntries || []).length === 0,
    JSON.stringify({
      baseline: replacementOracleInput ? compareX4UiSourceStructuralLedgerCorrespondence(replacementOracleInput) : false,
      ledger: ledgerDriftInput ? compareX4UiSourceStructuralLedgerCorrespondence(ledgerDriftInput) : undefined,
      owner: ownerDriftInput ? compareX4UiSourceStructuralLedgerCorrespondence(ownerDriftInput) : undefined,
      kernel: kernelDriftInput ? compareX4UiSourceStructuralLedgerCorrespondence(kernelDriftInput) : undefined,
      dynamic: { status: dynamicReplacementCatalog.status, reason: dynamicReplacementCatalog.reason, replacements: dynamicReplacementCatalog.replaceEntries?.length },
     }));
  type NumericCorrespondenceInput = NonNullable<typeof replacementOracleInput>;
  type NumericCorrespondenceSide = 'before' | 'after';
  type NumericCorrespondenceVariant = {
    readonly input: NumericCorrespondenceInput;
    readonly beforeFact: Record<string, unknown>;
    readonly afterFact: Record<string, unknown>;
    readonly beforeMutationApplied: boolean;
    readonly afterMutationApplied: boolean;
  };
  const numericCorrespondenceSlot = replacementOracleInput === undefined ? undefined : (() => {
    const afterById = new Map(replacementOracleInput.afterOperations.map(operation => [
      asRecord(operation)?.id,
      asRecord(operation),
    ] as const));
    for (const beforeOperation of replacementOracleInput.beforeOperations) {
      const beforeRecord = asRecord(beforeOperation);
      const operationId = beforeRecord?.id;
      const afterRecord = typeof operationId === 'string' ? afterById.get(operationId) : undefined;
      const beforeFacts = asRecord(beforeRecord?.descriptorFacts);
      const afterFacts = asRecord(afterRecord?.descriptorFacts);
      if (!beforeFacts || !afterFacts) continue;
      for (const [factKey, afterFact] of Object.entries(afterFacts)) {
        const beforeFact = beforeFacts[factKey];
        if (asRecord(beforeFact)?.status === 'known'
          && asRecord(beforeFact)?.expectedType === 'number'
          && asRecord(afterFact)?.status === 'known'
          && asRecord(afterFact)?.expectedType === 'number') {
          return { operationId, factKey };
        }
      }
    }
    return undefined;
  })();
  const numericCorrespondenceVariant = (
    mutate: (fact: Record<string, unknown>, side: NumericCorrespondenceSide) => boolean,
    side: 'both' | NumericCorrespondenceSide = 'both',
  ): NumericCorrespondenceVariant | undefined => {
    if (!replacementOracleInput || !numericCorrespondenceSlot) return undefined;
    const input = structuredClone(replacementOracleInput) as NumericCorrespondenceInput;
    const beforeOperation = input.beforeOperations.find(operation => asRecord(operation)?.id === numericCorrespondenceSlot.operationId);
    const afterOperation = input.afterOperations.find(operation => asRecord(operation)?.id === numericCorrespondenceSlot.operationId);
    const beforeFacts = asRecord(asRecord(beforeOperation)?.descriptorFacts);
    const afterFacts = asRecord(asRecord(afterOperation)?.descriptorFacts);
    const beforeFact = asRecord(beforeFacts?.[numericCorrespondenceSlot.factKey]);
    const afterFact = asRecord(afterFacts?.[numericCorrespondenceSlot.factKey]);
    if (!beforeFact || !afterFact) return undefined;
    const beforeMutationApplied = side !== 'after' && mutate(beforeFact, 'before');
    const afterMutationApplied = side !== 'before' && mutate(afterFact, 'after');
    return { input, beforeFact, afterFact, beforeMutationApplied, afterMutationApplied };
  };
  const numericSampleIds = (count: number): readonly string[] => Object.freeze(
    Array.from({ length: count }, (_, index) => `b119-source-sample-${index.toString().padStart(3, '0')}`),
  );
  const numericFactWithSamples = (
    fact: Record<string, unknown>,
    ids: readonly string[],
  ): void => {
    delete fact.sampleId;
    delete fact.sampleIds;
    if (ids.length === 0) {
      fact.provenance = 'source-literal';
    } else if (ids.length === 1) {
      fact.provenance = 'preview-sample';
      fact.sampleId = ids[0];
    } else {
      fact.provenance = 'preview-sample';
      fact.sampleIds = Object.freeze([...ids]);
    }
  };
  const numericFactMatchesSamples = (
    fact: Record<string, unknown>,
    count: number,
  ): boolean => {
    if (fact.status !== 'known'
      || fact.expectedType !== 'number'
      || typeof fact.value !== 'number'
      || !Number.isFinite(fact.value)) return false;
    if (count === 0) {
      return fact.provenance === 'source-literal'
        && !Object.prototype.hasOwnProperty.call(fact, 'sampleId')
        && !Object.prototype.hasOwnProperty.call(fact, 'sampleIds');
    }
    if (fact.provenance !== 'preview-sample') return false;
    if (count === 1) {
      return Object.prototype.hasOwnProperty.call(fact, 'sampleId')
        && fact.sampleId === 'b119-source-sample-000'
        && !Object.prototype.hasOwnProperty.call(fact, 'sampleIds');
    }
    if (!Object.prototype.hasOwnProperty.call(fact, 'sampleIds')
      || Object.prototype.hasOwnProperty.call(fact, 'sampleId')) return false;
    const ids = fact.sampleIds;
    return Array.isArray(ids)
      && Object.isFrozen(ids)
      && ids.length === count
      && ids.every((id, index) => id === `b119-source-sample-${index.toString().padStart(3, '0')}`);
  };
  const numericSchemaRows = [0, 1, ...Array.from({ length: 127 }, (_, index) => index + 2)].map(count => {
    const candidate = numericCorrespondenceVariant(fact => {
      numericFactWithSamples(fact, numericSampleIds(count));
      return numericFactMatchesSamples(fact, count);
    });
    return {
      count,
      accepted: candidate !== undefined
        && candidate.beforeMutationApplied
        && candidate.afterMutationApplied
        && compareX4UiSourceStructuralLedgerCorrespondence(candidate.input),
    };
  });
  const numericSchemaFailures = numericSchemaRows.filter(row => !row.accepted).map(row => row.count);
  check('B119 SourceEdits numeric fact correspondence accepts exact zero/one/2..128 sample forms',
    numericCorrespondenceSlot !== undefined
      && numericSchemaRows.length === 129
      && numericSchemaFailures.length === 0,
    JSON.stringify({ slot: numericCorrespondenceSlot, forms: numericSchemaRows.length, failures: numericSchemaFailures }));
  const numericFrozenRows = [0, 1, 2].map(count => {
    const candidate = numericCorrespondenceVariant(fact => {
      numericFactWithSamples(fact, numericSampleIds(count));
      Object.freeze(fact);
      return Object.isFrozen(fact) && numericFactMatchesSamples(fact, count);
    });
    return {
      count,
      accepted: candidate !== undefined
        && candidate.beforeMutationApplied
        && candidate.afterMutationApplied
        && compareX4UiSourceStructuralLedgerCorrespondence(candidate.input),
    };
  });
  check('B119 SourceEdits numeric fact correspondence accepts frozen fact records with valid forms',
    numericFrozenRows.length === 3 && numericFrozenRows.every(row => row.accepted),
    JSON.stringify({ slot: numericCorrespondenceSlot, rows: numericFrozenRows }));
  const typedPositiveRows = [
    { name: 'string', expectedType: 'string', value: 'b119-string-value' },
    { name: 'boolean', expectedType: 'boolean', value: true },
    { name: 'color-object', expectedType: 'color-object', value: cloneSchemaColor(schemaSourceLiteralColor) },
    { name: 'unavailable-number', expectedType: 'number', value: undefined, unavailable: true },
  ].map(item => {
    const candidate = numericCorrespondenceVariant(fact => {
      delete fact.sampleId;
      delete fact.sampleIds;
      if (item.unavailable) {
        fact.status = 'unavailable';
        fact.expectedType = item.expectedType;
        delete fact.value;
        delete fact.provenance;
        fact.reason = 'b119-unavailable-control';
        return fact.status === 'unavailable'
          && fact.expectedType === item.expectedType
          && !Object.prototype.hasOwnProperty.call(fact, 'value')
          && !Object.prototype.hasOwnProperty.call(fact, 'provenance')
          && fact.reason === 'b119-unavailable-control';
      }
      fact.status = 'known';
      fact.expectedType = item.expectedType;
      fact.value = item.value;
      fact.provenance = 'source-literal';
      return fact.status === 'known'
        && fact.expectedType === item.expectedType
        && fact.value === item.value
        && fact.provenance === 'source-literal'
        && !Object.prototype.hasOwnProperty.call(fact, 'sampleId')
        && !Object.prototype.hasOwnProperty.call(fact, 'sampleIds');
    });
    return {
      name: item.name,
      accepted: candidate !== undefined
        && candidate.beforeMutationApplied
        && candidate.afterMutationApplied
        && compareX4UiSourceStructuralLedgerCorrespondence(candidate.input),
    };
  });
  check('B119 SourceEdits numeric correspondence keeps valid typed and unavailable no-plural controls',
    typedPositiveRows.length === 4 && typedPositiveRows.every(row => row.accepted),
    JSON.stringify({ slot: numericCorrespondenceSlot, rows: typedPositiveRows }));
  const numericNegativeRows: Array<{
    readonly name: string;
    readonly accepted: boolean;
    readonly threw: boolean;
    readonly mutationApplied: boolean;
  }> = [];
  const numericNegative = (
    name: string,
    mutate: (fact: Record<string, unknown>) => boolean,
    side: 'both' | NumericCorrespondenceSide = 'both',
  ): void => {
    let candidate: NumericCorrespondenceVariant | undefined;
    let accepted = false;
    let threw = false;
    try {
      candidate = numericCorrespondenceVariant(mutate, side);
      const mutationApplied = candidate !== undefined
        && (side === 'both'
          ? candidate.beforeMutationApplied && candidate.afterMutationApplied
          : side === 'before'
            ? candidate.beforeMutationApplied && !candidate.afterMutationApplied
            : candidate.afterMutationApplied && !candidate.beforeMutationApplied);
      accepted = candidate !== undefined
        && mutationApplied
        && compareX4UiSourceStructuralLedgerCorrespondence(candidate.input);
    } catch {
      threw = true;
    }
    const mutationApplied = candidate !== undefined
      && (side === 'both'
        ? candidate.beforeMutationApplied && candidate.afterMutationApplied
        : side === 'before'
          ? candidate.beforeMutationApplied && !candidate.afterMutationApplied
          : candidate.afterMutationApplied && !candidate.beforeMutationApplied);
    numericNegativeRows.push({ name, accepted, threw, mutationApplied });
  };
  numericNegative('explicit undefined sampleId', fact => {
    delete fact.sampleIds;
    fact.provenance = 'preview-sample';
    fact.sampleId = undefined;
    return Object.prototype.hasOwnProperty.call(fact, 'sampleId') && fact.sampleId === undefined;
  });
  numericNegative('before-only explicit undefined sampleIds', fact => {
    delete fact.sampleId;
    fact.provenance = 'preview-sample';
    fact.sampleIds = undefined;
    return Object.prototype.hasOwnProperty.call(fact, 'sampleIds') && fact.sampleIds === undefined;
  }, 'before');
  numericNegative('after-only explicit undefined sampleIds', fact => {
    delete fact.sampleId;
    fact.provenance = 'preview-sample';
    fact.sampleIds = undefined;
    return Object.prototype.hasOwnProperty.call(fact, 'sampleIds') && fact.sampleIds === undefined;
  }, 'after');
  numericNegative('both singular and plural forms', fact => {
    fact.provenance = 'preview-sample';
    fact.sampleId = 'b119-source-sample-000';
    fact.sampleIds = Object.freeze(['b119-source-sample-000', 'b119-source-sample-001']);
    return fact.sampleId === 'b119-source-sample-000'
      && fact.sampleIds !== undefined
      && Object.prototype.hasOwnProperty.call(fact, 'sampleId')
      && Object.prototype.hasOwnProperty.call(fact, 'sampleIds');
  });
  const numericTypedPlural = (
    fact: Record<string, unknown>,
    expectedType: 'string' | 'boolean',
    value: string | boolean,
  ): boolean => {
    fact.status = 'known';
    fact.expectedType = expectedType;
    fact.value = value;
    fact.provenance = 'preview-sample';
    delete fact.sampleId;
    const ids = Object.freeze(['b119-source-sample-000', 'b119-source-sample-001']);
    fact.sampleIds = ids;
    return fact.expectedType === expectedType
      && fact.value === value
      && fact.sampleIds === ids
      && !Object.prototype.hasOwnProperty.call(fact, 'sampleId');
  };
  numericNegative('string typed plural form', fact => numericTypedPlural(fact, 'string', 'b119-string-value'));
  numericNegative('boolean typed plural form', fact => numericTypedPlural(fact, 'boolean', true));
  numericNegative('color-object plural form', fact => {
    fact.status = 'known';
    fact.expectedType = 'color-object';
    fact.value = cloneSchemaColor(schemaSourceLiteralColor);
    fact.provenance = 'preview-sample';
    delete fact.sampleId;
    const ids = Object.freeze(['b119-source-sample-000', 'b119-source-sample-001']);
    fact.sampleIds = ids;
    return fact.expectedType === 'color-object' && fact.value !== undefined && fact.sampleIds === ids;
  });
  numericNegative('unavailable fact plural form', fact => {
    fact.status = 'unavailable';
    fact.expectedType = 'number';
    delete fact.value;
    delete fact.provenance;
    delete fact.sampleId;
    fact.reason = 'b119-unavailable-control';
    const ids = Object.freeze(['b119-source-sample-000', 'b119-source-sample-001']);
    fact.sampleIds = ids;
    return fact.status === 'unavailable'
      && !Object.prototype.hasOwnProperty.call(fact, 'value')
      && !Object.prototype.hasOwnProperty.call(fact, 'provenance')
      && fact.sampleIds === ids;
  });
  numericNegative('empty plural form', fact => {
    delete fact.sampleId;
    fact.provenance = 'preview-sample';
    fact.sampleIds = Object.freeze([]);
    return fact.sampleIds !== undefined && Array.isArray(fact.sampleIds) && fact.sampleIds.length === 0;
  });
  numericNegative('one-item plural form', fact => {
    delete fact.sampleId;
    fact.provenance = 'preview-sample';
    const ids = Object.freeze(['b119-source-sample-000']);
    fact.sampleIds = ids;
    return fact.sampleIds === ids;
  });
  numericNegative('empty sample ID', fact => {
    delete fact.sampleIds;
    fact.provenance = 'preview-sample';
    fact.sampleId = '';
    return Object.prototype.hasOwnProperty.call(fact, 'sampleId') && fact.sampleId === '';
  });
  numericNegative('unsorted plural form', fact => {
    delete fact.sampleId;
    fact.provenance = 'preview-sample';
    fact.sampleIds = Object.freeze(['b119-source-sample-001', 'b119-source-sample-000']);
    return fact.sampleIds !== undefined && Array.isArray(fact.sampleIds) && fact.sampleIds[0] === 'b119-source-sample-001';
  });
  numericNegative('duplicate plural form', fact => {
    delete fact.sampleId;
    fact.provenance = 'preview-sample';
    fact.sampleIds = Object.freeze(['b119-source-sample-000', 'b119-source-sample-000']);
    return fact.sampleIds !== undefined && Array.isArray(fact.sampleIds) && fact.sampleIds[0] === fact.sampleIds[1];
  });
  numericNegative('empty sample ID in plural form', fact => {
    delete fact.sampleId;
    fact.provenance = 'preview-sample';
    const ids = Object.freeze(['', 'b119-source-sample-001']);
    fact.sampleIds = ids;
    return fact.sampleIds === ids;
  });
  numericNegative('hole in plural form', fact => {
    delete fact.sampleId;
    const ids = new Array<string>(2);
    ids[0] = 'b119-source-sample-000';
    fact.provenance = 'preview-sample';
    fact.sampleIds = ids;
    return fact.sampleIds === ids && !Object.prototype.hasOwnProperty.call(ids, '1');
  });
  numericNegative('undefined trailing plural slot', fact => {
    delete fact.sampleId;
    fact.provenance = 'preview-sample';
    const ids = ['b119-source-sample-000', 'b119-source-sample-001', undefined] as unknown as string[];
    fact.sampleIds = ids;
    return fact.sampleIds === ids && ids[2] === undefined;
  });
  numericNegative('extra plural array property', fact => {
    delete fact.sampleId;
    const ids = ['b119-source-sample-000', 'b119-source-sample-001'] as string[] & { extra?: string };
    ids.extra = 'foreign';
    fact.provenance = 'preview-sample';
    fact.sampleIds = ids;
    return fact.sampleIds === ids && ids.extra === 'foreign';
  });
  numericNegative('symbol on plural array', fact => {
    delete fact.sampleId;
    const ids = ['b119-source-sample-000', 'b119-source-sample-001'];
    const symbol = Symbol('foreign');
    Object.defineProperty(ids, symbol, { configurable: true, enumerable: true, value: 'foreign' });
    fact.provenance = 'preview-sample';
    fact.sampleIds = ids;
    return fact.sampleIds === ids && Object.getOwnPropertySymbols(ids).length === 1;
  });
  numericNegative('custom plural array prototype', fact => {
    delete fact.sampleId;
    const ids = ['b119-source-sample-000', 'b119-source-sample-001'];
    Object.setPrototypeOf(ids, { foreign: true });
    fact.provenance = 'preview-sample';
    fact.sampleIds = ids;
    return fact.sampleIds === ids && Object.getPrototypeOf(ids) !== Array.prototype;
  });
  numericNegative('nonenumerable plural index', fact => {
    delete fact.sampleId;
    const ids = ['b119-source-sample-000', 'b119-source-sample-001'];
    Object.defineProperty(ids, '1', { configurable: true, enumerable: false, value: 'b119-source-sample-001' });
    fact.provenance = 'preview-sample';
    fact.sampleIds = ids;
    return fact.sampleIds === ids && Object.getOwnPropertyDescriptor(ids, '1')?.enumerable === false;
  });
  let numericAccessorReads = 0;
  numericNegative('plural index accessor', fact => {
    delete fact.sampleId;
    const ids = ['b119-source-sample-000', 'b119-source-sample-001'];
    Object.defineProperty(ids, '1', {
      configurable: true,
      enumerable: true,
      get: () => {
        numericAccessorReads += 1;
        return 'b119-source-sample-001';
      },
    });
    fact.provenance = 'preview-sample';
    fact.sampleIds = ids;
    return fact.sampleIds === ids && Object.getOwnPropertyDescriptor(ids, '1')?.get !== undefined;
  });
  let numericProxyGetReads = 0;
  numericNegative('transparent plural array proxy', fact => {
    delete fact.sampleId;
    const ids = ['b119-source-sample-000', 'b119-source-sample-001'];
    const proxy = new Proxy(ids, {
      get: (target, key, receiver) => {
        numericProxyGetReads += 1;
        return Reflect.get(target, key, receiver);
      },
    });
    fact.provenance = 'preview-sample';
    fact.sampleIds = proxy;
    return fact.sampleIds === proxy;
  });
  numericNegative('cyclic plural array', fact => {
    delete fact.sampleId;
    const ids = ['b119-source-sample-000', 'b119-source-sample-001'] as unknown as unknown[];
    ids.push(ids);
    fact.provenance = 'preview-sample';
    fact.sampleIds = ids as unknown as string[];
    return fact.sampleIds === ids && ids[2] === ids;
  });
  numericNegative('129-item plural form', fact => {
    delete fact.sampleId;
    fact.provenance = 'preview-sample';
    const ids = numericSampleIds(129);
    fact.sampleIds = ids;
    return fact.sampleIds === ids && ids.length === 129;
  });
  const numericNegativeFailures = numericNegativeRows.filter(row => row.accepted || row.threw);
  const numericMutationFailures = numericNegativeRows.filter(row => !row.mutationApplied);
  check('B119 SourceEdits numeric fact correspondence rejects malformed plural forms independently on both ledgers',
    numericNegativeRows.length === 24
      && numericNegativeFailures.length === 0
      && numericMutationFailures.length === 0
      && numericAccessorReads === 0
      && numericProxyGetReads === 0,
    JSON.stringify({
      slot: numericCorrespondenceSlot,
      rows: numericNegativeRows,
      mutationFailures: numericMutationFailures,
      numericAccessorReads,
      numericProxyGetReads,
    }));
  const plainDeleteContext = contextFor();
  const plainDeleteCatalog = catalogFor(plainDeleteContext);
  const plainDeleteEntry = structuralDelete(plainDeleteCatalog, entry => entry.callBindings.some(binding => binding.callName === 'display'));
  const plainDeleteBefore = sourceText(plainDeleteContext);
  const plainDeleteBytes = workspaceBytes(plainDeleteContext.workspace);
  const plainDeleteBeforeLedger = ledgerCounts(plainDeleteContext.source);
  const plainDeleteResult = structuralApply(plainDeleteContext, plainDeleteCatalog, plainDeleteEntry);
  const plainDeleteAfterLedger = plainDeleteResult.accepted ? ledgerCounts(plainDeleteResult.source) : undefined;
  check('8B plain whole-statement deletion is zero-surprise, reparsed, and byte-local',
    plainDeleteResult.accepted
      && plainDeleteResult.changed
      && plainDeleteResult.reparsed
      && plainDeleteResult.provenanceReestablished
      && sourceText(plainDeleteResult) === plainDeleteBefore.slice(0, plainDeleteEntry.startOffset) + plainDeleteBefore.slice(plainDeleteEntry.endOffset)
      && samePassthroughValue(plainDeleteResult.workspace.passthroughFiles?.[0], plainDeleteContext.workspace.passthroughFiles?.[0])
      && samePassthroughValue(plainDeleteResult.workspace.passthroughFiles?.[1], plainDeleteContext.workspace.passthroughFiles?.[1])
      && workspaceBytes(plainDeleteContext.workspace) === plainDeleteBytes
      && plainDeleteResult.catalog !== plainDeleteCatalog
      && plainDeleteResult.catalog.sourceIdentity.sha256 !== plainDeleteCatalog.sourceIdentity.sha256
      && !(plainDeleteResult.catalog.deleteEntries || []).some(entry => entry.callBindings.some(binding => binding.callName === 'display')),
    JSON.stringify(plainDeleteResult));
  check('8B plain deletion produces the exact one-call/one-operation ledger delta',
    plainDeleteBeforeLedger?.calls === 5
      && plainDeleteBeforeLedger.operations === 5
      && plainDeleteAfterLedger?.calls === 4
      && plainDeleteAfterLedger.operations === 4,
    JSON.stringify({ before: plainDeleteBeforeLedger, after: plainDeleteAfterLedger }));
  const semicolonVariants = [
    { name: 'immediate semicolon', line: 'frame:display();', remaining: '' },
    { name: 'spaced semicolon', line: 'frame:display() ;', remaining: '' },
    { name: 'no semicolon', line: 'frame:display()', remaining: '' },
    { name: 'doubled semicolon and comment boundary', line: 'frame:display() ;; -- keep comment', remaining: '; -- keep comment' },
    { name: 'single semicolon and trailing comment boundary', line: 'frame:display() ; -- keep comment', remaining: ' -- keep comment' },
  ];
  for (const variant of semicolonVariants) {
    const variantContext = contextFor(baseLua.replace('frame:display()', variant.line));
    const variantCatalog = catalogFor(variantContext);
    const variantEntry = structuralDelete(variantCatalog, entry => entry.callBindings.some(binding => binding.callName === 'display'));
    const variantBefore = sourceText(variantContext);
    const variantResult = structuralApply(variantContext, variantCatalog, variantEntry);
    const variantAfter = variantResult.accepted ? sourceText(variantResult) : '';
    check(`8B deletion preserves ${variant.name} boundaries and removes only accepted deletionSource`,
      variantResult.accepted
        && variantAfter === variantBefore.slice(0, variantEntry.startOffset) + variantBefore.slice(variantEntry.endOffset)
        && (variant.remaining === '' || variantAfter.includes(variant.remaining))
        && !variantAfter.includes(variant.line),
      JSON.stringify({ variant: variant.name, entry: variantEntry, result: variantResult }));
  }
  const fluentLua = [
    'local menu = { name = "Fluent", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local table = frame:addTable(1, {})',
    'local row = table:addRow(false, {})',
    'row[1]:createText("fluent", {}):setColSpan(1)',
    'frame:display()',
    '',
  ].join('\n');
  const fluentContext = contextFor(fluentLua);
  const fluentCatalog = catalogFor(fluentContext);
  const fluentEntry = structuralDelete(fluentCatalog, entry => entry.callBindings.length === 2
    && entry.callBindings.some(binding => binding.callName === 'createText')
    && entry.callBindings.some(binding => binding.callName === 'setColSpan'));
  const fluentBefore = sourceText(fluentContext);
  const fluentResult = structuralApply(fluentContext, fluentCatalog, fluentEntry);
  check('8B fluent chain issues one complete whole-statement action and removes both bound calls once',
    (fluentCatalog.deleteEntries || []).filter(entry => entry.startOffset === fluentEntry.startOffset).length === 1
      && fluentEntry.endOffset - fluentEntry.startOffset === fluentBefore.slice(fluentEntry.startOffset, fluentEntry.endOffset).length
      && fluentResult.accepted
      && sourceText(fluentResult) === fluentBefore.slice(0, fluentEntry.startOffset) + fluentBefore.slice(fluentEntry.endOffset)
      && fluentResult.catalog !== fluentCatalog,
    JSON.stringify({ fluentEntry, result: fluentResult }));
  const crlfAstralLua = `local title = "🛸"\r\n${baseLua.replace(/\n/g, '\r\n')}`;
  const crlfAstralContext = contextFor(crlfAstralLua);
  const crlfAstralCatalog = catalogFor(crlfAstralContext);
  const crlfAstralEntry = structuralDelete(crlfAstralCatalog, entry => entry.callBindings.some(binding => binding.callName === 'display'));
  const crlfAstralBefore = sourceText(crlfAstralContext);
  const crlfAstralResult = structuralApply(crlfAstralContext, crlfAstralCatalog, crlfAstralEntry);
  check('8B deletion uses UTF-16 offsets with astral prefix and CRLF source bytes',
    crlfAstralResult.accepted
      && crlfAstralEntry.startOffset === crlfAstralBefore.indexOf('frame:display()')
      && sourceText(crlfAstralResult) === crlfAstralBefore.slice(0, crlfAstralEntry.startOffset) + crlfAstralBefore.slice(crlfAstralEntry.endOffset)
      && sourceText(crlfAstralResult).includes('\r\n'),
    JSON.stringify({ entry: crlfAstralEntry, result: crlfAstralResult }));
  const firstRowLua = [
    'local menu = { name = "First row", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local table = frame:addTable(1, {})',
    '  table:addRow(false, {})',
    '  frame:display()',
    '',
  ].join('\n');
  const firstRowContext = contextFor(firstRowLua);
  const firstRowCatalog = catalogFor(firstRowContext);
  const firstRowInsert = structuralInsert(firstRowCatalog, 'first-row');
  const firstRowBefore = sourceText(firstRowContext);
  const firstRowBeforeBytes = workspaceBytes(firstRowContext.workspace);
  const firstRowBeforeLedger = ledgerCounts(firstRowContext.source);
  const firstRowPayload = 'table:addRow(false, {})';
  const firstRowReplacement = `${firstRowInsert.indentation}${firstRowPayload}${firstRowInsert.lineEnding}`;
  const firstRowInsertResult = structuralApply(firstRowContext, firstRowCatalog, firstRowInsert, firstRowPayload);
  const firstRowAfterLedger = firstRowInsertResult.accepted ? ledgerCounts(firstRowInsertResult.source) : undefined;
  check('8B first-row insertion uses a zero-length CAS anchor, local indentation, and one direct relevant call',
    firstRowInsert.startOffset === firstRowInsert.endOffset
      && firstRowInsert.expectedText === ''
      && firstRowInsert.anchorSource.start.offset === firstRowInsert.startOffset
      && firstRowInsert.anchorSource.start.column === 0
      && firstRowInsert.indentation === '  '
      && firstRowInsert.lineEnding === '\n'
      && firstRowInsertResult.accepted
      && firstRowInsertResult.changed
      && firstRowInsertResult.reparsed
      && sourceText(firstRowInsertResult) === firstRowBefore.slice(0, firstRowInsert.startOffset) + firstRowReplacement + firstRowBefore.slice(firstRowInsert.startOffset)
      && sourceText(firstRowInsertResult).includes(`  ${firstRowPayload}\n`)
      && workspaceBytes(firstRowContext.workspace) === firstRowBeforeBytes
      && firstRowInsertResult.catalog !== firstRowCatalog,
    JSON.stringify({ entry: firstRowInsert, result: firstRowInsertResult }));
  check('8B first-row insertion adds exactly one call and one applied operation',
    firstRowBeforeLedger?.calls === 4
      && firstRowBeforeLedger.operations === 4
      && firstRowAfterLedger?.calls === 5
      && firstRowAfterLedger.operations === 5,
    JSON.stringify({ before: firstRowBeforeLedger, after: firstRowAfterLedger }));
  const fallbackInsertContext = contextFor(`local title = "🛸"\r\n${baseLua.replace(/\n/g, '\r\n')}`);
  const fallbackInsertCatalog = catalogFor(fallbackInsertContext);
  const fallbackInsert = structuralInsert(fallbackInsertCatalog, 'fallback-display');
  const fallbackInsertBefore = sourceText(fallbackInsertContext);
  const fallbackInsertBeforeBytes = workspaceBytes(fallbackInsertContext.workspace);
  const fallbackInsertBeforeLedger = ledgerCounts(fallbackInsertContext.source);
  const fallbackPayload = 'frame:display()';
  const fallbackInsertResult = structuralApply(fallbackInsertContext, fallbackInsertCatalog, fallbackInsert, fallbackPayload);
  const fallbackInsertAfterLedger = fallbackInsertResult.accepted ? ledgerCounts(fallbackInsertResult.source) : undefined;
  const fallbackReplacement = `${fallbackInsert.indentation}${fallbackPayload}${fallbackInsert.lineEnding}`;
  check('8B fallback display insertion preserves astral-prefix UTF-16 offsets and CRLF framing',
    fallbackInsert.startOffset === fallbackInsert.endOffset
      && fallbackInsert.expectedText === ''
      && fallbackInsert.anchorSource.start.offset === fallbackInsert.startOffset
      && fallbackInsert.anchorSource.start.column === 0
      && fallbackInsert.lineEnding === '\r\n'
      && fallbackInsertResult.accepted
      && sourceText(fallbackInsertResult) === fallbackInsertBefore.slice(0, fallbackInsert.startOffset) + fallbackReplacement + fallbackInsertBefore.slice(fallbackInsert.startOffset)
      && sourceText(fallbackInsertResult).includes('\r\n')
      && workspaceBytes(fallbackInsertContext.workspace) === fallbackInsertBeforeBytes
      && fallbackInsertResult.catalog.sourceIdentity.sha256 !== fallbackInsertCatalog.sourceIdentity.sha256,
    JSON.stringify({ entry: fallbackInsert, result: fallbackInsertResult }));
  check('8B fallback insertion adds exactly one display call and one applied operation',
    fallbackInsertBeforeLedger?.calls === 5
      && fallbackInsertBeforeLedger.operations === 5
      && fallbackInsertAfterLedger?.calls === 6
      && fallbackInsertAfterLedger.operations === 6,
    JSON.stringify({ before: fallbackInsertBeforeLedger, after: fallbackInsertAfterLedger }));

  const nonRootStructuralFixtures = [
    ['local call', baseLua.replace('frame:display()', 'local shown = frame:display()')],
    ['assignment call', baseLua.replace('frame:display()', 'shown = frame:display()')],
    ['return call', baseLua.replace('frame:display()', 'return frame:display()')],
    ['condition call', baseLua.replace('frame:display()', 'if enabled then frame:display() end')],
    ['loop call', baseLua.replace('frame:display()', 'for i = 1, 1 do frame:display() end')],
    ['argument call', baseLua.replace('frame:display()', 'print(frame:display())')],
    ['nested relevant argument call', baseLua.replace('frame:display()', 'frame:display(table:addRow(false, {}))')],
  ] as const;
  const nonRootStructuralRows = nonRootStructuralFixtures.map(([name, lua]) => {
    try {
      const context = contextFor(lua);
      const catalog = catalogFor(context);
      return {
        name,
        threw: false,
        noRootDisplayAction: !(catalog.deleteEntries || []).some(entry => entry.callBindings.some(binding => binding.callName === 'display')),
      };
    } catch (error) {
      return { name, threw: true, noRootDisplayAction: false, detail: error instanceof Error ? error.message : String(error) };
    }
  });
  check('8B local/assignment/return/condition/loop/argument calls never issue root deletion actions',
    nonRootStructuralRows.every(row => row.threw === false && row.noRootDisplayAction),
    JSON.stringify(nonRootStructuralRows));

  const missingAnchorContext = contextFor(baseLua.replace('frame:display()', 'local shown = frame:display()'));
  const missingAnchorCatalog = catalogFor(missingAnchorContext);
  check('8B missing standalone row and display anchors issue no insertion action',
    (missingAnchorCatalog.insertEntries || []).length === 0,
    JSON.stringify({ structuralEntries: missingAnchorCatalog.structuralEntries }));
  const ambiguousRowLua = [
    'local menu = { name = "Ambiguous", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local tableA = frame:addTable(1, {})',
    'local tableB = frame:addTable(1, {})',
    'tableA:addRow(false, {})',
    'tableB:addRow(false, {})',
    'frame:display()',
    '',
  ].join('\n');
  let ambiguousRowContext: SourceEditFixtureContext | undefined;
  let ambiguousRowError: string | undefined;
  try {
    ambiguousRowContext = contextFor(ambiguousRowLua);
  } catch (error) {
    ambiguousRowError = error instanceof Error ? error.message : String(error);
  }
  const ambiguousRowCatalog = ambiguousRowContext ? catalogFor(ambiguousRowContext) : undefined;
  check('8B ambiguous first-row anchors are refused without guessing a table',
    ambiguousRowError === undefined
      && ambiguousRowCatalog !== undefined
      && (ambiguousRowCatalog.insertEntries || []).every(entry => entry.kind !== 'insert-call')
      && (ambiguousRowCatalog.insertEntries || []).filter(entry => entry.kind === 'insert-block').length === 1,
    JSON.stringify({ error: ambiguousRowError, structuralEntries: ambiguousRowCatalog?.structuralEntries }));

  const structuralDiscoveryProxyCounter = { reads: 0 };
  const structuralDiscoveryRows = [
    {
      name: 'workspace clone',
      outcome: invokeDiscoveryBoundary(frozenClone(firstRowContext.workspace), firstRowContext.source, firstRowContext.program, firstRowContext.evidenceAuthority),
      reads: 0,
    },
    {
      name: 'source clone',
      outcome: invokeDiscoveryBoundary(firstRowContext.workspace, frozenClone(firstRowContext.source), firstRowContext.program, firstRowContext.evidenceAuthority),
      reads: 0,
    },
    {
      name: 'program clone',
      outcome: invokeDiscoveryBoundary(firstRowContext.workspace, firstRowContext.source, frozenClone(firstRowContext.program), firstRowContext.evidenceAuthority),
      reads: 0,
    },
    {
      name: 'evidence clone',
      outcome: invokeDiscoveryBoundary(firstRowContext.workspace, firstRowContext.source, firstRowContext.program, frozenClone(firstRowContext.evidenceAuthority)),
      reads: 0,
    },
    {
      name: 'workspace proxy',
      outcome: invokeDiscoveryBoundary(hostileProxy(firstRowContext.workspace, structuralDiscoveryProxyCounter), firstRowContext.source, firstRowContext.program, firstRowContext.evidenceAuthority),
      reads: structuralDiscoveryProxyCounter,
    },
  ];
  check('8B structural discovery rejects cloned/proxy authority quartets before hostile observation',
    structuralDiscoveryRows.every(row => row.outcome.threw === false
      && row.outcome.value?.status === 'locked'
      && (row.outcome.value.structuralEntries || []).length === 0
      && (typeof row.reads === 'number' ? row.reads === 0 : row.reads.reads === 0)),
    JSON.stringify(structuralDiscoveryRows.map(row => ({ name: row.name, threw: row.outcome.threw, status: row.outcome.value?.status, structural: row.outcome.value?.structuralEntries?.length, reads: typeof row.reads === 'number' ? row.reads : row.reads.reads }))));

  const invalidInsertionPayloads: readonly (readonly [string, string | undefined])[] = [
    ['missing payload', undefined],
    ['empty payload', ''],
    ['assignment payload', 'local row = table:addRow(false, {})'],
    ['assignment expression payload', 'row = table:addRow(false, {})'],
    ['return payload', 'return table:addRow(false, {})'],
    ['condition payload', 'if enabled then table:addRow(false, {}) end'],
    ['loop payload', 'for i = 1, 1 do table:addRow(false, {}) end'],
    ['argument payload', 'print(table:addRow(false, {}))'],
    ['multiple statements', 'table:addRow(false, {}); table:addRow(false, {})'],
    ['comment payload', '-- comment'],
    ['unrelated call payload', 'print("unrelated")'],
    ['parse failure payload', 'table:addRow('],
    ['second semicolon overreach', 'table:addRow(false, {});;'],
    ['comment overreach', 'table:addRow(false, {}) -- comment'],
    ['semicolon comment overreach', 'table:addRow(false, {}); -- comment'],
    ['newline overreach', 'table:addRow(false, {})\nnext'],
    ['next statement overreach', 'table:addRow(false, {}); frame:display()'],
  ];
  const invalidInsertionBefore = sourceText(firstRowContext);
  const invalidInsertionBytes = workspaceBytes(firstRowContext.workspace);
  const invalidInsertionRows = invalidInsertionPayloads.map(([name, payload]) => {
    const result = structuralApply(firstRowContext, firstRowCatalog, firstRowInsert, payload);
    return {
      name,
      accepted: result.accepted,
      preserved: structuralRefusalPreservesInput(result, firstRowContext, firstRowCatalog, invalidInsertionBytes, invalidInsertionBefore),
      reason: structuralResultReason(result),
    };
  });
  check('8B malformed/multi-statement/comment/unrelated/parse-failure insertion payloads refuse with exact original identities',
    invalidInsertionRows.every(row => row.accepted === false && row.preserved),
    JSON.stringify(invalidInsertionRows));

  const firstRowStaleCases = [
    {
      name: 'wrong expected path',
      result: structuralApply(firstRowContext, firstRowCatalog, firstRowInsert, firstRowPayload, { path: 'ui/other.lua' }),
    },
    {
      name: 'wrong expected start',
      result: structuralApply(firstRowContext, firstRowCatalog, firstRowInsert, firstRowPayload, { startOffset: firstRowInsert.startOffset + 1 }),
    },
    {
      name: 'wrong expected end',
      result: structuralApply(firstRowContext, firstRowCatalog, firstRowInsert, firstRowPayload, { endOffset: firstRowInsert.endOffset + 1 }),
    },
    {
      name: 'wrong expected text',
      result: structuralApply(firstRowContext, firstRowCatalog, firstRowInsert, firstRowPayload, { expectedText: 'stale' }),
    },
    {
      name: 'missing insertion payload',
      result: structuralApply(firstRowContext, firstRowCatalog, firstRowInsert),
    },
    {
      name: 'unknown action',
      result: applyX4UiSourceStructuralEdit(firstRowContext.workspace, firstRowContext.source, firstRowCatalog, 'missing-structural-action', firstRowPayload),
    },
  ];
  check('8B stale range/text, missing action, and missing payload refuse without mutation',
    firstRowStaleCases.every(item => !item.result.accepted
      && structuralRefusalPreservesInput(item.result, firstRowContext, firstRowCatalog, invalidInsertionBytes, invalidInsertionBefore)),
    JSON.stringify(firstRowStaleCases.map(item => ({ name: item.name, accepted: item.result.accepted, reason: structuralResultReason(item.result) }))));
  const deletionForPayloadRefusal = structuralDelete(firstRowCatalog, entry => entry.callBindings.some(binding => binding.callName === 'addRow'));
  const deleteWithPayload = structuralApply(firstRowContext, firstRowCatalog, deletionForPayloadRefusal, firstRowPayload);
  check('8B deletion refuses an insertion payload and preserves the exact source/CAS pair',
    structuralRefusalPreservesInput(deleteWithPayload, firstRowContext, firstRowCatalog, invalidInsertionBytes, invalidInsertionBefore),
    JSON.stringify({ accepted: deleteWithPayload.accepted, reason: structuralResultReason(deleteWithPayload) }));

  const repeatedStaleContext = { workspace: firstRowInsertResult.workspace, source: firstRowInsertResult.source };
  const repeatedStaleBefore = sourceText(repeatedStaleContext);
  const repeatedStaleBytes = workspaceBytes(repeatedStaleContext.workspace);
  const repeatedStaleResult = applyX4UiSourceStructuralEdit(
    repeatedStaleContext.workspace,
    repeatedStaleContext.source,
    firstRowCatalog,
    firstRowInsert.id,
    firstRowPayload,
  );
  check('8B repeated use of the stale pre-edit catalog refuses against the reissued source pair',
    structuralRefusalPreservesInput(repeatedStaleResult, repeatedStaleContext, firstRowCatalog, repeatedStaleBytes, repeatedStaleBefore),
    JSON.stringify({ accepted: repeatedStaleResult.accepted, reason: structuralResultReason(repeatedStaleResult) }));

  const foreignStructuralContext = contextFor();
  const foreignStructuralCatalog = catalogFor(foreignStructuralContext);
  const crossStructuralResult = applyX4UiSourceStructuralEdit(
    firstRowContext.workspace,
    firstRowContext.source,
    foreignStructuralCatalog,
    structuralInsert(foreignStructuralCatalog, 'fallback-display').id,
    fallbackPayload,
  );
  check('8B foreign structural catalog/source facts refuse before observing or mutating the selected pair',
    structuralRefusalPreservesInput(crossStructuralResult, firstRowContext, foreignStructuralCatalog, invalidInsertionBytes, invalidInsertionBefore),
    JSON.stringify({ accepted: crossStructuralResult.accepted, reason: structuralResultReason(crossStructuralResult) }));

  const structuralCatalogClone = frozenClone(firstRowCatalog);
  const structuralCatalogPrototype = Object.create(firstRowCatalog) as X4UiSourceEditCatalog;
  const structuralCatalogAccessor = {} as X4UiSourceEditCatalog;
  let structuralCatalogAccessorReads = 0;
  Object.defineProperty(structuralCatalogAccessor, 'entries', {
    enumerable: true,
    get: () => {
      structuralCatalogAccessorReads += 1;
      throw new Error('structural catalog accessor executed');
    },
  });
  const structuralMalformedCollection = { ...firstRowCatalog, structuralEntries: ['not-an-entry'] } as unknown as X4UiSourceEditCatalog;
  const structuralCatalogProxyCounter = { reads: 0 };
  const structuralCatalogProxy = hostileProxy(firstRowCatalog, structuralCatalogProxyCounter);
  const structuralBoundaryCatalogs = [
    { name: 'cloned catalog', catalog: structuralCatalogClone, reads: 0 },
    { name: 'custom-prototype catalog', catalog: structuralCatalogPrototype, reads: 0 },
    { name: 'accessor catalog', catalog: structuralCatalogAccessor, reads: structuralCatalogAccessorReads },
    { name: 'malformed structural collection', catalog: structuralMalformedCollection, reads: 0 },
    { name: 'proxy catalog', catalog: structuralCatalogProxy, reads: structuralCatalogProxyCounter.reads },
  ];
  const structuralBoundaryRows = structuralBoundaryCatalogs.map(item => {
    const outcome = invokeStructuralApplyBoundary(
      firstRowContext.workspace,
      firstRowContext.source,
      item.catalog,
      firstRowInsert.id,
      firstRowPayload,
    );
    return {
      name: item.name,
      threw: outcome.threw,
      accepted: outcome.value?.accepted,
      exactCatalog: outcome.value?.catalog === item.catalog,
      exactWorkspace: outcome.value?.workspace === firstRowContext.workspace,
      exactSource: outcome.value?.source === firstRowContext.source,
      reads: item.name === 'accessor catalog' ? structuralCatalogAccessorReads : structuralCatalogProxyCounter.reads,
    };
  });
  check('8B clone/cross/proxy/accessor/prototype/malformed structural catalogs refuse with zero hostile observation',
    structuralBoundaryRows.every(row => row.threw === false
      && row.accepted === false
      && row.exactCatalog
      && row.exactWorkspace
      && row.exactSource
      && row.reads === 0),
    JSON.stringify(structuralBoundaryRows));

  const structuralWorkspaceCounter = { reads: 0 };
  const structuralSourceCounter = { reads: 0 };
  const structuralWorkspaceProxy = hostileProxy(firstRowContext.workspace, structuralWorkspaceCounter);
  const structuralSourceProxy = hostileProxy(firstRowContext.source, structuralSourceCounter);
  const hostileBoundaryRows = [
    {
      name: 'workspace proxy',
      outcome: invokeStructuralApplyBoundary(structuralWorkspaceProxy, firstRowContext.source, firstRowCatalog, firstRowInsert.id, firstRowPayload),
      reads: structuralWorkspaceCounter,
    },
    {
      name: 'source proxy',
      outcome: invokeStructuralApplyBoundary(firstRowContext.workspace, structuralSourceProxy, firstRowCatalog, firstRowInsert.id, firstRowPayload),
      reads: structuralSourceCounter,
    },
  ];
  check('8B structural workspace/source proxies refuse without hostile property observation',
    hostileBoundaryRows.every(row => row.outcome.threw === false
      && row.outcome.value?.accepted === false
      && row.reads.reads === 0),
    JSON.stringify(hostileBoundaryRows.map(row => ({ name: row.name, threw: row.outcome.threw, accepted: row.outcome.value?.accepted, reads: row.reads.reads }))));

  const malformedStructuralRequests = [
    invokeStructuralApplyBoundary(firstRowContext.workspace, firstRowContext.source, firstRowCatalog, 7, firstRowPayload),
    invokeStructuralApplyBoundary(firstRowContext.workspace, firstRowContext.source, firstRowCatalog, firstRowInsert.id, { payload: firstRowPayload }),
    invokeStructuralApplyBoundary(firstRowContext.workspace, firstRowContext.source, firstRowCatalog, firstRowInsert.id, firstRowPayload, undefined, 1.5),
    invokeStructuralApplyBoundary(firstRowContext.workspace, firstRowContext.source, firstRowCatalog, firstRowInsert.id, firstRowPayload, undefined, undefined, undefined, { stale: true }),
  ];
  check('8B malformed structural action/payload/expected CAS collections refuse as invalid positional requests',
    malformedStructuralRequests.every(outcome => outcome.threw === false
      && outcome.value !== undefined
      && outcome.value.accepted === false
      && structuralResultReason(outcome.value) === 'invalid-request'),
    JSON.stringify(malformedStructuralRequests.map(outcome => ({ threw: outcome.threw, accepted: outcome.value?.accepted, reason: outcome.value ? structuralResultReason(outcome.value) : 'no-result' }))));

  const dynamicStructuralCatalog = catalogFor(dynamicContext);
  const dynamicStructuralBefore = sourceText(dynamicContext);
  const dynamicStructuralBytes = workspaceBytes(dynamicContext.workspace);
  const dynamicStructuralResult = applyX4UiSourceStructuralEdit(
    dynamicContext.workspace,
    dynamicContext.source,
    dynamicStructuralCatalog,
    'dynamic-structural-action',
    firstRowPayload,
  );
  check('8B dynamic/unbound source facts remain locked with no structural action',
    (dynamicStructuralCatalog.structuralEntries || []).length === 0
      && structuralRefusalPreservesInput(dynamicStructuralResult, dynamicContext, dynamicStructuralCatalog, dynamicStructuralBytes, dynamicStructuralBefore),
    JSON.stringify({ structuralEntries: dynamicStructuralCatalog.structuralEntries, accepted: dynamicStructuralResult.accepted, reason: structuralResultReason(dynamicStructuralResult) }));

  interface CausalMatrixRow {
    readonly family: string;
    readonly name: string;
    readonly pass: boolean;
    readonly detail: string;
  }
  const causalRows: CausalMatrixRow[] = [];
  const causalDetail = (value: unknown): string => {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };
  const causal = (
    family: string,
    name: string,
    probe: () => { readonly pass: boolean; readonly detail?: unknown },
  ): void => {
    try {
      const result = probe();
      causalRows.push({ family, name, pass: result.pass, detail: causalDetail(result.detail) });
    } catch (error) {
      causalRows.push({
        family,
        name,
        pass: false,
        detail: causalDetail({ threw: true, error: error instanceof Error ? error.message : String(error) }),
      });
    }
  };

  const structuralOwnerSnapshot = (
    context: SourceEditFixtureContext,
    catalog: X4UiSourceEditCatalog,
  ): unknown => {
    const file = context.source.bundle?.sourceFiles.find(candidate => candidate.path === 'ui/edit.lua');
    const calls = file?.callModel.calls || [];
    return {
      operations: context.program.operations.map(operation => {
        const record = operation as unknown as Record<string, unknown>;
        const call = calls.find(candidate => candidate.order === operation.modelOrder);
        const receiver = call?.receiver as unknown as Record<string, unknown> | undefined;
        return {
          kind: operation.kind,
          status: operation.status,
          receiver: receiver?.expression,
          tableId: record.tableId,
          frameId: record.frameId,
          rowId: record.rowId,
          cellId: record.cellId,
          parentPath: record.parentPath,
          relatedPath: record.relatedPath,
          localInvocations: record.localInvocations,
        };
      }),
      inserts: (catalog.insertEntries || []).map(entry => ({
        anchor: entry.anchor,
        provenance: entry.provenance,
      })),
    };
  };

  const assignedRowsPartialLua = [
    'local helper = rawget(_G, "Helper")',
    'local menu = { name = "Assigned rows partial", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local tableA = frame:addTable(1, {})',
    'local row = tableA:addRow(false, {})',
    'local tableB = frame:addTable(3, {})',
    'row = tableB:addRow(true, {})',
    'row[1]:setColSpan(1):createEditBox({ width = 20, height = 20, scaling = false })',
    'row[2]:setColSpan(1):createButton({ active = true }):setText("SEND", {})',
    'row[3]:setColSpan(1):createButton({ active = true }):setText("END", {})',
    'frame:display()',
    '',
  ].join('\n');
  causal('B119-ASSIGNED-ROWS', 'assignment-root real-source shape exposes one frame block and only complete widget deletions', () => {
    const context = contextFor(assignedRowsPartialLua);
    const catalog = catalogFor(context);
    const file = context.source.bundle?.sourceFiles.find(candidate => candidate.path === 'ui/edit.lua');
    const calls = file?.callModel.calls || [];
    const target = context.program.target.source;
    const relevantNames = new Set(['addRow', 'createEditBox', 'createButton', 'setText', 'setColSpan', 'display']);
    const locationWithinTarget = (source: { readonly file: string; readonly sourcePath?: string; readonly start: { readonly offset: number }; readonly end: { readonly offset: number } }): boolean =>
      source.file === target.file
      && source.sourcePath === target.sourcePath
      && target.start.offset <= source.start.offset
      && target.end.offset >= source.end.offset;
    const sameSourceLocation = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);
    const preFilterStructuralFacts = calls
      .filter(call => relevantNames.has(call.name) && locationWithinTarget(call.source))
      .map(call => {
        const operation = context.program.operations.find(candidate => candidate.kind === call.name
          && candidate.modelOrder === call.order
          && sameSourceLocation(candidate.source, call.source));
        const operationRecord = operation as unknown as Record<string, unknown> | undefined;
        const binding = context.evidenceAuthority.sourceBindings.find(candidate => candidate.operationId === operation?.id
          && sameSourceLocation(candidate.source, call.source));
        const callRecord = call as unknown as Record<string, unknown>;
        const statement = asRecord(callRecord.enclosingStatement);
        return {
          name: call.name,
          order: call.order,
          source: call.source,
          receiver: asRecord(call.receiver)?.expression,
          assignedTo: call.assignedTo,
          statementKind: statement?.kind,
          standaloneRoot: statement?.isStandaloneCallStatementRoot,
          operation: operation
            ? { id: operation.id, status: operation.status, tableId: operationRecord?.tableId, frameId: operationRecord?.frameId, rowId: operationRecord?.rowId, cellId: operationRecord?.cellId }
            : undefined,
          evidenceBinding: binding
            ? { operationId: binding.operationId, callId: binding.callId, source: binding.source }
            : undefined,
        };
      });
    const blockEntries = (catalog.insertEntries || []).filter(entry => entry.kind === 'insert-block' && entry.anchor === 'frame-display');
    const insertCallEntries = (catalog.insertEntries || []).filter(entry => entry.kind === 'insert-call');
    const deleteEntries = catalog.deleteEntries || [];
    const widgetDeleteEntries = deleteEntries.filter(entry => entry.callBindings.some(binding =>
      binding.callName === 'createEditBox' || binding.callName === 'createButton'));
    const rowDeleteEntries = deleteEntries.filter(entry => entry.callBindings.some(binding => binding.callName === 'addRow'));
    return {
      pass: context.program.status === 'partial'
        && preFilterStructuralFacts.filter(fact => fact.name === 'addRow').length === 2
        && preFilterStructuralFacts.filter(fact => fact.name === 'addRow').every(fact => fact.operation?.status === 'applied'
          && typeof fact.operation.tableId === 'string'
          && fact.standaloneRoot === false)
        && blockEntries.length === 1
        && widgetDeleteEntries.length === 3
        && rowDeleteEntries.length === 0
        && insertCallEntries.length === 0,
      detail: {
        selectedProgram: {
          status: context.program.status,
          operationCount: context.program.operations.length,
          appliedOperationCount: context.program.operations.filter(operation => operation.status === 'applied').length,
          target: context.program.target,
        },
        preFilterStructuralFacts,
        postFilterCatalog: {
          structuralEntries: catalog.structuralEntries,
          deleteEntries,
          insertEntries: catalog.insertEntries,
          widgetDeleteEntries,
          rowDeleteEntries,
        },
        ownerSnapshot: structuralOwnerSnapshot(context, catalog),
      },
    };
  });
  causal('B119-ASSIGNED-ROWS', 'partial assigned-row authority applies three owner-issued widget deletes then the reissued frame block', () => {
    const initial = contextFor(assignedRowsPartialLua);
    let current: Pick<SourceEditFixtureContext, 'workspace' | 'source'> = initial;
    let currentCatalog = catalogFor(initial);
    const parentBytes = workspaceBytes(initial.workspace);
    const initialBlockEntries = (currentCatalog.insertEntries || []).filter(entry => entry.kind === 'insert-block' && entry.anchor === 'frame-display');
    const initialWidgetDeletes = (currentCatalog.deleteEntries || []).filter(entry => entry.callBindings.some(binding =>
      binding.callName === 'createEditBox' || binding.callName === 'createButton'));
    const initialRowDeletes = (currentCatalog.deleteEntries || []).filter(entry => entry.callBindings.some(binding => binding.callName === 'addRow'));
    const initialInsertCalls = (currentCatalog.insertEntries || []).filter(entry => entry.kind === 'insert-call');
    const assignedFrameBlockPayload = [
      'local inputTable = frame:addTable(2, { x = 8, y = 12, width = 72, scaling = false })',
      'inputTable:setColWidthPercent(1, 50)',
      'inputTable:setColWidthPercent(2, 50)',
      'local inputRow = inputTable:addRow(false, { height = 20, scaling = false })',
      'inputRow[1]:setColSpan(1):createEditBox({ width = 36, height = 20, scaling = false })',
      'inputRow[2]:createEditBox({ width = 36, height = 20, scaling = false })',
    ].join('\n');
    const deletionSpecs = [
      { name: 'editbox', matches: (entry: X4UiSourceEditDeleteEntry) => entry.callBindings.some(binding => binding.callName === 'createEditBox') },
      { name: 'SEND', matches: (entry: X4UiSourceEditDeleteEntry) => entry.expectedText.includes('"SEND"') },
      { name: 'END', matches: (entry: X4UiSourceEditDeleteEntry) => entry.expectedText.includes('"END"') },
    ] as const;
    const deltas: Array<Record<string, unknown>> = [];
    for (const spec of deletionSpecs) {
      const entry = (currentCatalog.deleteEntries || []).find(spec.matches);
      if (!entry) return { pass: false, detail: { phase: spec.name, reason: 'issued widget delete missing' } };
      const beforeText = sourceText(current);
      const beforeProjected = projectedProgramFor(current.source);
      const beforeLedger = ledgerCounts(current.source);
      const beforeOperations = beforeProjected?.program.operations || [];
      const owner = entry.provenance.owner;
      const removedOperationIds = new Set(entry.callBindings.map(binding => binding.operationId));
      const removedOperations = beforeOperations.filter(operation => removedOperationIds.has(operation.id));
      const result = structuralApply(current, currentCatalog, entry);
      if (!result.accepted) {
        return {
          pass: false,
          detail: { phase: spec.name, accepted: false, reason: structuralResultReason(result), detail: structuralResultDetail(result) },
        };
      }
      const afterProjected = projectedProgramFor(result.source);
      const afterLedger = ledgerCounts(result.source);
      const afterText = sourceText(result);
      const afterOperations = afterProjected?.program.operations || [];
      const afterBlockEntries = (result.catalog.insertEntries || []).filter(candidate => candidate.kind === 'insert-block' && candidate.anchor === 'frame-display');
      const afterInsertCalls = (result.catalog.insertEntries || []).filter(candidate => candidate.kind === 'insert-call');
      const afterRowDeletes = (result.catalog.deleteEntries || []).filter(candidate => candidate.callBindings.some(binding => binding.callName === 'addRow'));
      const exactSourceDelta = afterText === beforeText.slice(0, entry.startOffset) + beforeText.slice(entry.endOffset)
        && result.replacement === '';
      const exactCallOperationDelta = beforeLedger !== undefined
        && afterLedger !== undefined
        && afterLedger.calls === beforeLedger.calls - entry.callBindings.length
        && afterLedger.operations === beforeLedger.operations - entry.callBindings.length
        && beforeProjected !== undefined
        && afterProjected !== undefined
        && afterProjected.model.calls.length === beforeProjected.model.calls.length - entry.callBindings.length
        && afterOperations.length === beforeOperations.length - entry.callBindings.length
        && entry.callBindings.every(binding => removedOperationIds.has(binding.operationId)
          && removedOperations.some(operation => operation.id === binding.operationId))
        && entry.callBindings.every(binding => !afterOperations.some(operation => operation.id === binding.operationId));
      const exactOwnerDelta = owner?.kind === 'table'
        && typeof owner.ownerId === 'string'
        && typeof owner.frameId === 'string'
        && removedOperations.length === entry.callBindings.length
        && removedOperations.every(operation => (operation as unknown as Record<string, unknown>).tableId === owner.ownerId);
      const authorityReissued = result.catalog.sourceIdentity.sha256 !== entry.provenance.sourceIdentity.sha256
        && afterBlockEntries.length === 1
        && afterInsertCalls.length === 0
        && afterRowDeletes.length === 0
        && workspaceBytes(initial.workspace) === parentBytes;
      deltas.push({
        phase: spec.name,
        exactSourceDelta,
        exactCallOperationDelta,
        exactOwnerDelta,
        authorityReissued,
        beforeLedger,
        afterLedger,
        callBindings: entry.callBindings,
        owner,
      });
      current = { workspace: result.workspace, source: result.source };
      currentCatalog = result.catalog;
    }
    const blockEntry = (currentCatalog.insertEntries || []).find(entry => entry.kind === 'insert-block' && entry.anchor === 'frame-display');
    if (!blockEntry) return { pass: false, detail: { phase: 'frame-display', reason: 'reissued frame block missing', deltas } };
    const blockBeforeText = sourceText(current);
    const blockBeforeLedger = ledgerCounts(current.source);
    const blockResult = structuralApply(current, currentCatalog, blockEntry, assignedFrameBlockPayload);
    if (!blockResult.accepted) {
      return {
        pass: false,
        detail: { phase: 'frame-display', accepted: false, reason: structuralResultReason(blockResult), detail: structuralResultDetail(blockResult), deltas },
      };
    }
    const blockAfterProjected = projectedProgramFor(blockResult.source);
    const blockAfterFile = blockResult.source.bundle?.sourceFiles.find(file => file.path === 'ui/edit.lua');
    const blockInsertedStart = blockEntry.startOffset + blockEntry.indentation.length;
    const blockInsertedEnd = blockEntry.startOffset + blockResult.replacement.length;
    const blockInsertedCalls = blockAfterFile?.callModel.calls.filter(call => call.source.start.offset >= blockInsertedStart && call.source.end.offset <= blockInsertedEnd) || [];
    const blockInsertedOperations = blockAfterProjected?.program.operations.filter(operation => operation.source.start.offset >= blockInsertedStart && operation.source.end.offset <= blockInsertedEnd) || [];
    const blockAfterLedger = ledgerCounts(blockResult.source);
    const blockReissued = (blockResult.catalog.insertEntries || []).filter(entry => entry.kind === 'insert-block' && entry.anchor === 'frame-display');
    const blockOwner = blockEntry.provenance.owner;
    const blockExact = blockOwner?.kind === 'frame'
      && typeof blockOwner.ownerId === 'string'
      && blockBeforeLedger !== undefined
      && blockAfterLedger !== undefined
      && blockAfterLedger.calls === blockBeforeLedger.calls + blockInsertedCalls.length
      && blockAfterLedger.operations === blockBeforeLedger.operations + blockInsertedOperations.length
      && blockInsertedCalls.length === 7
      && blockInsertedOperations.length === 7
      && sourceText(blockResult) === blockBeforeText.slice(0, blockEntry.startOffset)
        + blockResult.replacement
        + blockBeforeText.slice(blockEntry.startOffset)
      && workspaceBytes(initial.workspace) === parentBytes
      && blockReissued.length === 1
      && blockReissued[0].provenance.owner?.kind === 'frame'
      && blockReissued[0].provenance.owner.ownerId === blockOwner.ownerId
      && blockResult.catalog.sourceIdentity.sha256 !== blockEntry.provenance.sourceIdentity.sha256;
    return {
      pass: initial.program.status === 'partial'
        && initialBlockEntries.length === 1
        && initialWidgetDeletes.length === 3
        && initialRowDeletes.length === 0
        && initialInsertCalls.length === 0
        && deltas.length === deletionSpecs.length
        && deltas.every(delta => delta.exactSourceDelta && delta.exactCallOperationDelta && delta.exactOwnerDelta && delta.authorityReissued)
        && blockExact,
      detail: {
        initial: {
          status: initial.program.status,
          blockEntries: initialBlockEntries.length,
          widgetDeletes: initialWidgetDeletes.length,
          rowDeletes: initialRowDeletes.length,
          insertCalls: initialInsertCalls.length,
        },
        deltas,
        block: {
          exact: blockExact,
          insertedCalls: blockInsertedCalls.length,
          insertedOperations: blockInsertedOperations.length,
          beforeLedger: blockBeforeLedger,
          afterLedger: blockAfterLedger,
          reissued: blockReissued.length,
        },
      },
    };
  });
  const assignedRowsMultilinePartialLua = [
    'local helper = rawget(_G, "Helper")',
    'local menu = { name = "Assigned rows multiline", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local tableA = frame:addTable(1, {})',
    'local row = tableA:addRow(false, {})',
    'local tableB = frame:addTable(3, {})',
    'row = tableB:addRow(true, {})',
    'row[1]:setColSpan(1):createEditBox({',
    '  width = 20, height = 20, scaling = false,',
    '})',
    'row[2]:setColSpan(1):createButton({ active = true }):setText("SEND", {',
    '  halign = "center",',
    '})',
    'row[3]:setColSpan(1):createButton({ active = true }):setText("END", {',
    '  halign = "center",',
    '})',
    'frame:display()',
    '',
  ].join('\n');
  causal('B119-ASSIGNED-ROWS', 'multiline assigned-row chains retain complete widget deletes with one frame block', () => {
    const context = contextFor(assignedRowsMultilinePartialLua);
    const catalog = catalogFor(context);
    const widgetDeletes = (catalog.deleteEntries || []).filter(entry => entry.callBindings.some(binding =>
      binding.callName === 'createEditBox' || binding.callName === 'createButton'));
    const rowDeletes = (catalog.deleteEntries || []).filter(entry => entry.callBindings.some(binding => binding.callName === 'addRow'));
    const blockEntries = (catalog.insertEntries || []).filter(entry => entry.kind === 'insert-block' && entry.anchor === 'frame-display');
    return {
      pass: context.program.status === 'partial'
        && widgetDeletes.length === 3
        && rowDeletes.length === 0
        && blockEntries.length === 1
        && (catalog.insertEntries || []).every(entry => entry.kind === 'insert-block'),
      detail: {
        status: context.program.status,
        widgetDeletes: widgetDeletes.length,
        rowDeletes: rowDeletes.length,
        blockEntries,
        structuralEntries: catalog.structuralEntries,
      },
    };
  });

  const tableOwnerReassignmentLua = [
    'local menu = { name = "Table reassignment", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local table = frame:addTable(1, {})',
    'table:addRow(false, {})',
    'table = frame:addTable(1, {})',
    'table:addRow(false, {})',
    'frame:display()',
    '',
  ].join('\n');
  const tableOwnerAliasLua = [
    'local menu = { name = "Table alias", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local table = frame:addTable(1, {})',
    'local alias = table',
    'table:addRow(false, {})',
    'alias:addRow(false, {})',
    'frame:display()',
    '',
  ].join('\n');
  const tableCreatedThroughFrameAliasLua = [
    'local menu = { name = "Table through frame alias", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local frameAlias = frame',
    'local table = frameAlias:addTable(1, {})',
    'local tableAlias = table',
    'tableAlias:addRow(false, {})',
    'frame:display()',
    '',
  ].join('\n');
  const tableMissingAncestryLua = [
    'local menu = { name = "Missing table ancestry", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local table = getTable()',
    'table:addRow(false, {})',
    'frame:display()',
    '',
  ].join('\n');
  const frameOwnerReassignmentLua = [
    'local menu = { name = "Frame reassignment", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'frame:display()',
    'frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'frame:display()',
    '',
  ].join('\n');
  const frameOwnerAliasLua = [
    'local menu = { name = "Frame alias", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local alias = frame',
    'frame:display()',
    'alias:display()',
    '',
  ].join('\n');
  const ownerIdentityCases = [
    { name: 'distinct table owners refuse first-row anchor', lua: tableOwnerReassignmentLua, anchor: 'first-row' as const, expected: 0 },
    { name: 'aliased table owner issues one first-row anchor', lua: tableOwnerAliasLua, anchor: 'first-row' as const, expected: 1 },
    { name: 'table created through frame alias and operated through table alias issues one first-row anchor', lua: tableCreatedThroughFrameAliasLua, anchor: 'first-row' as const, expected: 1 },
    { name: 'missing table ancestry refuses first-row anchor', lua: tableMissingAncestryLua, anchor: 'first-row' as const, expected: 0 },
    { name: 'distinct frame owners refuse fallback anchor', lua: frameOwnerReassignmentLua, anchor: 'fallback-display' as const, expected: 0 },
    { name: 'aliased frame owner issues one fallback anchor', lua: frameOwnerAliasLua, anchor: 'fallback-display' as const, expected: 1 },
  ] as const;
  for (const item of ownerIdentityCases) {
    causal('F1', item.name, () => {
      const context = contextFor(item.lua);
      const catalog = catalogFor(context);
      const inserts = (catalog.insertEntries || []).filter(entry => entry.anchor === item.anchor);
      return {
        pass: inserts.length === item.expected
          && (item.expected === 0 || inserts.every(entry => Object.isFrozen(entry.provenance))),
        detail: { expected: item.expected, actual: inserts.length, ownerSnapshot: structuralOwnerSnapshot(context, catalog) },
      };
    });
  }

  const mixedTableFrameBlockLua = [
    'local menu = { name = "Mixed table frame block", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local tableA = frame:addTable(1, {})',
    'tableA:addRow(false, {})',
    'local tableB = frame:addTable(1, {})',
    'tableB:addRow(false, {})',
    'frame:display()',
    '',
  ].join('\n');
  const mixedTableFrameBlockPayload = [
    'local inputTable = frame:addTable(2, { x = 8, y = 12, width = 72, scaling = false })',
    'inputTable:setColWidthPercent(1, 50)',
    'inputTable:setColWidthPercent(2, 50)',
    'local inputRow = inputTable:addRow(false, { height = 20, scaling = false })',
    'inputRow[1]:setColSpan(1):createEditBox({ width = 36, height = 20, scaling = false })',
    'inputRow[2]:createEditBox({ width = 36, height = 20, scaling = false })',
  ].join('\n');
  const indentedCrlfMixedTableFrameBlockLua = mixedTableFrameBlockLua
    .split('\n')
    .map(line => line ? `    ${line}` : line)
    .join('\r\n');
  const mixedTableFrameBlockInvalidPayloads = [
    ['hidden non-UI invocation inside valid block', [
      'local inputTable = frame:addTable(2, {})',
      'local inputRow = inputTable:addRow(false, { height = measureHeight() })',
      'inputRow[1]:createText("x", {})',
    ].join('\n'), 'replacement-parse-failure' as const],
    ['arbitrary non-UI call', 'os.execute("unsafe")', 'replacement-parse-failure' as const],
    ['function definition', 'function forgeHandler() end', 'replacement-parse-failure' as const],
    ['control flow', 'if enabled then frame:display() end', 'replacement-parse-failure' as const],
    ['loop', 'for index = 1, 1 do frame:display() end', 'replacement-parse-failure' as const],
    ['unrelated declaration', 'local unrelated = 1', 'replacement-parse-failure' as const],
    ['unrelated assignment between valid UI statements', [
      'local inputTable = frame:addTable(2, {})',
      'inputTable:setColWidthPercent(1, 50)',
      'unrelated = 1',
      'local inputRow = inputTable:addRow(false, {})',
      'inputRow[1]:createText("x", {})',
    ].join('\n'), 'replacement-parse-failure' as const],
    ['malformed syntax after valid UI statement', [
      'local inputTable = frame:addTable(2, {})',
      'inputTable:addRow(false, {',
    ].join('\n'), 'replacement-parse-failure' as const],
    ['oversized payload', 'x'.repeat(32769), 'invalid-request' as const],
    ['duplicate local binding', [
      'local inputTable = frame:addTable(2, {})',
      'local inputTable = frame:addTable(2, {})',
    ].join('\n'), 'replacement-parse-failure' as const],
    ['reassigned local binding', [
      'local inputTable = frame:addTable(2, {})',
      'inputTable = frame:addTable(2, {})',
    ].join('\n'), 'replacement-parse-failure' as const],
    ['cross-owner table reference', [
      'local inputTable = frame:addTable(2, {})',
      'local inputRow = tableA:addRow(false, {})',
      'inputRow[1]:createText("x", {})',
    ].join('\n'), 'replacement-parse-failure' as const],
    ['cross-frame receiver', [
      'local inputTable = frame:addTable(2, {})',
      'local foreignTable = otherFrame:addTable(2, {})',
    ].join('\n'), 'replacement-parse-failure' as const],
  ] as const;
  const mixedTableFrameBlockEntry = (catalog: X4UiSourceEditCatalog): X4UiSourceEditStructuralEntry | undefined =>
    (catalog.structuralEntries || []).find(candidate => {
      const record = candidate as unknown as Record<string, unknown>;
      return record.kind === 'insert-block' && record.anchor === 'frame-display';
    });
  causal('B119-FRAME-BLOCK', 'mixed-table selected function receives exactly one frame/display block authority', () => {
    const context = contextFor(mixedTableFrameBlockLua);
    const catalog = catalogFor(context);
    const blockEntries = (catalog.structuralEntries || []).filter(candidate => {
      const record = candidate as unknown as Record<string, unknown>;
      return record.kind === 'insert-block' && record.anchor === 'frame-display';
    });
    const entry = blockEntries[0] as unknown as Record<string, unknown> | undefined;
    const provenance = asRecord(entry?.provenance);
    const owner = asRecord(provenance?.owner);
    return {
      pass: blockEntries.length === 1
        && owner?.kind === 'frame'
        && typeof owner.ownerId === 'string'
        && typeof entry?.startOffset === 'number'
        && entry?.startOffset === entry?.endOffset
        && entry?.expectedText === '',
      detail: { blockEntries, ownerSnapshot: structuralOwnerSnapshot(context, catalog) },
    };
  });
  causal('B119-FRAME-BLOCK', 'valid frame block applies as one bounded CAS insertion with exact hierarchy ledger delta', () => {
    const context = contextFor(mixedTableFrameBlockLua);
    const catalog = catalogFor(context);
    const entry = mixedTableFrameBlockEntry(catalog) as X4UiSourceEditInsertionEntry | undefined;
    if (!entry) return { pass: false, detail: { reason: 'frame block authority absent', structuralEntries: catalog.structuralEntries } };
    const beforeText = sourceText(context);
    const beforeBytes = workspaceBytes(context.workspace);
    const beforeLedger = ledgerCounts(context.source);
    const result = structuralApply(context, catalog, entry, mixedTableFrameBlockPayload, {
      path: entry.path,
      startOffset: entry.startOffset,
      endOffset: entry.endOffset,
      expectedText: entry.expectedText,
    });
    const afterLedger = result.accepted ? ledgerCounts(result.source) : undefined;
    const reissuedEntry = result.accepted
      ? (result.catalog.insertEntries || []).find(candidate => candidate.kind === 'insert-block' && candidate.anchor === 'frame-display')
      : undefined;
    const repeatedResult = result.accepted && reissuedEntry
      ? structuralApply({ workspace: result.workspace, source: result.source }, result.catalog, reissuedEntry, mixedTableFrameBlockPayload, {
        path: reissuedEntry.path,
        startOffset: reissuedEntry.startOffset,
        endOffset: reissuedEntry.endOffset,
        expectedText: reissuedEntry.expectedText,
      })
      : undefined;
    return {
      pass: result.accepted
        && result.changed
        && result.reparsed
        && result.provenanceReestablished
        && sourceText(result).includes('local inputTable = frame:addTable(2, { x = 8, y = 12, width = 72, scaling = false })')
        && sourceText(result).includes('inputRow[1]:setColSpan(1):createEditBox({ width = 36, height = 20, scaling = false })')
        && sourceText(result).includes('inputTable:setColWidthPercent(2, 50)')
        && workspaceBytes(context.workspace) === beforeBytes
        && beforeText.slice(0, entry.startOffset) + `${entry.indentation}${mixedTableFrameBlockPayload}${entry.lineEnding}` + beforeText.slice(entry.startOffset) === sourceText(result)
        && beforeLedger !== undefined
        && afterLedger !== undefined
        && afterLedger.calls === beforeLedger.calls + 7
        && afterLedger.operations === beforeLedger.operations + 7
        && result.catalog !== catalog
        && reissuedEntry !== undefined
        && repeatedResult?.accepted === true
        && repeatedResult.reparsed
        && repeatedResult.provenanceReestablished
        && (result.catalog.insertEntries || []).some(candidate => candidate.anchor === 'frame-display'),
      detail: {
        result: {
          accepted: result.accepted,
          changed: result.changed,
          reparsed: result.accepted ? result.reparsed : undefined,
          provenanceReestablished: result.accepted ? result.provenanceReestablished : undefined,
          reason: structuralResultReason(result),
          detail: structuralResultDetail(result),
        },
        beforeLedger,
        afterLedger,
        repeated: repeatedResult?.accepted === true
          ? { accepted: true, changed: repeatedResult.changed, reparsed: repeatedResult.reparsed, provenanceReestablished: repeatedResult.provenanceReestablished }
          : repeatedResult === undefined
            ? undefined
            : { accepted: false, reason: repeatedResult.reason, detail: repeatedResult.detail },
      },
    };
  });
  causal('B119-FRAME-BLOCK', 'fail-first indented CRLF block formats every statement with the issued local style', () => {
    const context = contextFor(indentedCrlfMixedTableFrameBlockLua);
    const catalog = catalogFor(context);
    const entry = mixedTableFrameBlockEntry(catalog) as X4UiSourceEditInsertionEntry | undefined;
    if (!entry) return { pass: false, detail: { reason: 'frame block authority absent' } };
    const beforeText = sourceText(context);
    const beforeLedger = ledgerCounts(context.source);
    const payloadWithIssuedStyle = mixedTableFrameBlockPayload.replace(/\n/g, `${entry.lineEnding}${entry.indentation}`);
    const expectedReplacement = `${entry.indentation}${payloadWithIssuedStyle}${entry.lineEnding}`;
    const result = structuralApply(context, catalog, entry, mixedTableFrameBlockPayload);
    const actualReplacement = result.accepted ? result.replacement : undefined;
    const afterLedger = result.accepted ? ledgerCounts(result.source) : undefined;
    const reissuedEntry = result.accepted
      ? mixedTableFrameBlockEntry(result.catalog)
      : undefined;
    const expectedSource = beforeText.slice(0, entry.startOffset)
      + expectedReplacement
      + beforeText.slice(entry.startOffset);
    return {
      pass: result.accepted
        && result.reparsed
        && result.provenanceReestablished
        && actualReplacement === expectedReplacement
        && sourceText(result) === expectedSource
        && !/(?<!\r)\n/.test(sourceText(result))
        && beforeLedger !== undefined
        && afterLedger !== undefined
        && afterLedger.calls === beforeLedger.calls + 7
        && afterLedger.operations === beforeLedger.operations + 7
        && reissuedEntry !== undefined
        && reissuedEntry.provenance.sourceIdentity.sha256 !== entry.provenance.sourceIdentity.sha256,
      detail: {
        entry: {
          indentation: entry.indentation,
          lineEnding: entry.lineEnding,
          startOffset: entry.startOffset,
        },
        expectedReplacement,
        actualReplacement,
        result: {
          accepted: result.accepted,
          reason: structuralResultReason(result),
          detail: structuralResultDetail(result),
        },
        beforeLedger,
        afterLedger,
        reissued: reissuedEntry !== undefined,
      },
    };
  });
  for (const [name, payload, expectedReason] of mixedTableFrameBlockInvalidPayloads) {
    causal('B119-FRAME-BLOCK', `${name} is rejected without source mutation`, () => {
      const context = contextFor(mixedTableFrameBlockLua);
      const catalog = catalogFor(context);
      const entry = mixedTableFrameBlockEntry(catalog) as X4UiSourceEditInsertionEntry | undefined;
      if (!entry) return { pass: false, detail: { reason: 'frame block authority absent' } };
      const beforeText = sourceText(context);
      const beforeBytes = workspaceBytes(context.workspace);
      const result = structuralApply(context, catalog, entry, payload);
      const repeated = structuralApply(context, catalog, entry, payload);
      return {
        pass: structuralRefusalPreservesInput(result, context, catalog, beforeBytes, beforeText)
          && result.accepted === false
          && result.reason === expectedReason
          && result.detail.length > 0
          && repeated.accepted === false
          && repeated.reason === result.reason
          && repeated.detail === result.detail
          && structuralRefusalPreservesInput(repeated, context, catalog, beforeBytes, beforeText),
        detail: {
          expectedReason,
          result: { accepted: result.accepted, reason: structuralResultReason(result), detail: structuralResultDetail(result) },
          repeated: { accepted: repeated.accepted, reason: structuralResultReason(repeated), detail: structuralResultDetail(repeated) },
        },
      };
    });
  }
  const forbiddenDirectBlockCases = [
    ['setColWidth', mixedTableFrameBlockPayload.replace('inputTable:setColWidthPercent(1, 50)', 'inputTable:setColWidth(1, 50, false)')],
    ['setText2', mixedTableFrameBlockPayload.replace('inputRow[2]:createEditBox({ width = 36, height = 20, scaling = false })', 'inputRow[2]:setText2("AI Influence", {})')],
    ['createText', mixedTableFrameBlockPayload.replace('inputRow[1]:setColSpan(1):createEditBox({ width = 36, height = 20, scaling = false })', 'inputRow[1]:createText("AI Influence", { width = 36, height = 20, scaling = false }):setColSpan(1)')],
    ['createIcon', mixedTableFrameBlockPayload.replace('inputRow[2]:createEditBox({ width = 36, height = 20, scaling = false })', 'inputRow[2]:createIcon({ width = 36, height = 20, scaling = false })')],
  ] as const;
  for (const [name, payload] of forbiddenDirectBlockCases) {
    causal('B119-FRAME-BLOCK-ALLOWLIST', `${name} is rejected as a typed direct-block parse failure without attempting workspace or source`, () => {
      const context = contextFor(mixedTableFrameBlockLua);
      const catalog = catalogFor(context);
      const entry = mixedTableFrameBlockEntry(catalog) as X4UiSourceEditInsertionEntry | undefined;
      if (!entry) return { pass: false, detail: { name, reason: 'frame block authority absent' } };
      const beforeText = sourceText(context);
      const beforeBytes = workspaceBytes(context.workspace);
      const beforeOwner = structuralOwnerSnapshot(context, catalog);
      const result = structuralApply(context, catalog, entry, payload);
      const afterOwner = structuralOwnerSnapshot(context, catalog);
      return {
        pass: result.accepted === false
          && result.reason === 'replacement-parse-failure'
          && structuralRefusalPreservesInput(result, context, catalog, beforeBytes, beforeText)
          && JSON.stringify(afterOwner) === JSON.stringify(beforeOwner),
        detail: {
          name,
          result: { accepted: result.accepted, reason: structuralResultReason(result), detail: structuralResultDetail(result) },
          ownerPreserved: JSON.stringify(afterOwner) === JSON.stringify(beforeOwner),
          entryOwner: entry.provenance.owner,
        },
      };
    });
  }
  const missingFrameDisplayOwnerLua = mixedTableFrameBlockLua.replace('frame:display()\n', '');
  const duplicateFrameDisplayOwnerLua = [
    'local menu = { name = "Duplicate frame display owner", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local frameOther = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local tableA = frame:addTable(1, {})',
    'tableA:addRow(false, {})',
    'local tableB = frameOther:addTable(1, {})',
    'tableB:addRow(false, {})',
    'frame:display()',
    'frame:display()',
    '',
  ].join('\n');
  const ambiguousFrameDisplayOwnerLua = [
    'local menu = { name = "Ambiguous frame display owner", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local frameOther = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local tableA = frame:addTable(1, {})',
    'tableA:addRow(false, {})',
    'local tableB = frameOther:addTable(1, {})',
    'tableB:addRow(false, {})',
    'frame:display()',
    'frameOther:display()',
    '',
  ].join('\n');
  const frameDisplayOwnerGaps = [
    ['missing display owner', missingFrameDisplayOwnerLua],
    ['duplicate display owner', duplicateFrameDisplayOwnerLua],
    ['ambiguous display owner', ambiguousFrameDisplayOwnerLua],
  ] as const;
  for (const [name, lua] of frameDisplayOwnerGaps) {
    causal('B119-FRAME-BLOCK', `${name} issues no block authority and refuses without mutation`, () => {
      const context = contextFor(lua);
      const catalog = catalogFor(context);
      const beforeText = sourceText(context);
      const beforeBytes = workspaceBytes(context.workspace);
      const blockEntries = (catalog.insertEntries || []).filter(entry => entry.kind === 'insert-block');
      const result = applyX4UiSourceStructuralEdit(
        context.workspace,
        context.source,
        catalog,
        'missing-frame-block-authority',
        mixedTableFrameBlockPayload,
      );
      const repeated = applyX4UiSourceStructuralEdit(
        context.workspace,
        context.source,
        catalog,
        'missing-frame-block-authority',
        mixedTableFrameBlockPayload,
      );
      return {
        pass: blockEntries.length === 0
          && result.accepted === false
          && result.reason === 'entry-not-found'
          && result.detail.length > 0
          && structuralRefusalPreservesInput(result, context, catalog, beforeBytes, beforeText)
          && repeated.accepted === false
          && repeated.reason === result.reason
          && repeated.detail === result.detail
          && structuralRefusalPreservesInput(repeated, context, catalog, beforeBytes, beforeText),
        detail: {
          blockEntries,
          result: { accepted: result.accepted, reason: structuralResultReason(result), detail: structuralResultDetail(result) },
          repeated: { accepted: repeated.accepted, reason: structuralResultReason(repeated), detail: structuralResultDetail(repeated) },
        },
      };
    });
  }
  causal('B119-FRAME-BLOCK', 'frame block stale CAS range is refused before source mutation', () => {
    const context = contextFor(mixedTableFrameBlockLua);
    const catalog = catalogFor(context);
    const entry = mixedTableFrameBlockEntry(catalog) as X4UiSourceEditInsertionEntry | undefined;
    if (!entry) return { pass: false, detail: { reason: 'frame block authority absent' } };
    const beforeText = sourceText(context);
    const beforeBytes = workspaceBytes(context.workspace);
    const result = structuralApply(context, catalog, entry, mixedTableFrameBlockPayload, {
      startOffset: entry.startOffset + 1,
    });
    const repeated = structuralApply(context, catalog, entry, mixedTableFrameBlockPayload, {
      startOffset: entry.startOffset + 1,
    });
    return {
      pass: structuralRefusalPreservesInput(result, context, catalog, beforeBytes, beforeText)
        && result.accepted === false
        && result.reason === 'stale-range'
        && result.detail.length > 0
        && repeated.accepted === false
        && repeated.reason === result.reason
        && repeated.detail === result.detail
        && structuralRefusalPreservesInput(repeated, context, catalog, beforeBytes, beforeText),
      detail: {
        result: { accepted: result.accepted, reason: structuralResultReason(result), detail: structuralResultDetail(result) },
        repeated: { accepted: repeated.accepted, reason: structuralResultReason(repeated), detail: structuralResultDetail(repeated) },
      },
    };
  });

  const foreignTableFirstRowLua = [
    'local menu = { name = "Foreign table first row", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local tableA = frame:addTable(1, {})',
    'local tableB = frame:addTable(1, {})',
    'tableA:addRow(false, {})',
    'tableB:setColWidthPercent(1, 25)',
    'frame:display()',
    '',
  ].join('\n');
  const foreignFrameFallbackLua = [
    'local menu = { name = "Foreign frame fallback", layer = 1 }',
    'local frameA = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local frameB = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local tableB = frameB:addTable(1, {})',
    'frameA:display()',
    '',
  ].join('\n');
  const fallbackTableTransitionLua = [
    'local menu = { name = "Fallback table transition", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local table = frame:addTable(1, {})',
    'frame:display()',
    '',
  ].join('\n');
  causal('F2', 'same table payload is accepted at first-row anchor', () => {
    const result = structuralApply(firstRowContext, firstRowCatalog, firstRowInsert, firstRowPayload);
    return { pass: result.accepted === true, detail: { accepted: result.accepted, reason: structuralResultReason(result), detail: structuralResultDetail(result) } };
  });
  causal('F2', 'same frame payload is accepted at fallback anchor', () => {
    const context = contextFor();
    const catalog = catalogFor(context);
    const entry = structuralInsert(catalog, 'fallback-display');
    const result = structuralApply(context, catalog, entry, 'frame:display()');
    return { pass: result.accepted === true, detail: { accepted: result.accepted, reason: structuralResultReason(result) } };
  });
  causal('F2', 'table under selected frame is accepted at fallback anchor', () => {
    const context = contextFor(fallbackTableTransitionLua);
    const catalog = catalogFor(context);
    const entry = structuralInsert(catalog, 'fallback-display');
    const result = structuralApply(context, catalog, entry, 'table:addRow(false, {})');
    return {
      pass: result.accepted === true,
      detail: { accepted: result.accepted, reason: structuralResultReason(result), detail: structuralResultDetail(result), catalog: result.accepted ? result.catalog.insertEntries : undefined },
    };
  });
  causal('F2', 'foreign table payload refuses at first-row anchor with exact input', () => {
    const context = contextFor(foreignTableFirstRowLua);
    const catalog = catalogFor(context);
    const entry = structuralInsert(catalog, 'first-row');
    const before = sourceText(context);
    const bytes = workspaceBytes(context.workspace);
    const result = structuralApply(context, catalog, entry, 'tableB:setColWidthPercent(1, 50)');
    return {
      pass: result.accepted === false && structuralRefusalPreservesInput(result, context, catalog, bytes, before),
      detail: { accepted: result.accepted, reason: structuralResultReason(result), ownerSnapshot: structuralOwnerSnapshot(context, catalog) },
    };
  });
  causal('F2', 'foreign frame/table payload refuses at fallback anchor with exact input', () => {
    const context = contextFor(foreignFrameFallbackLua);
    const catalog = catalogFor(context);
    const entry = structuralInsert(catalog, 'fallback-display');
    const before = sourceText(context);
    const bytes = workspaceBytes(context.workspace);
    const result = structuralApply(context, catalog, entry, 'tableB:addRow(false, {})');
    return {
      pass: result.accepted === false && structuralRefusalPreservesInput(result, context, catalog, bytes, before),
      detail: { accepted: result.accepted, reason: structuralResultReason(result), ownerSnapshot: structuralOwnerSnapshot(context, catalog) },
    };
  });

  const nestedExecutableCases = [
    { name: 'print', expression: 'print("x")' },
    { name: 'foo', expression: 'foo()' },
  ] as const;
  for (const item of nestedExecutableCases) {
    causal('F3', `${item.name} nested executable is absent from deletion discovery`, () => {
      const context = contextFor(baseLua.replace('frame:display()', `frame:display(${item.expression})`));
      const catalog = catalogFor(context);
      const displayDelete = (catalog.deleteEntries || []).some(entry => entry.callBindings.some(binding => binding.callName === 'display'));
      const file = context.source.bundle?.sourceFiles.find(candidate => candidate.path === 'ui/edit.lua');
      const modelRecord = file?.callModel as unknown as Record<string, unknown> | undefined;
      return {
        pass: !displayDelete,
        detail: { displayDelete, calls: file?.callModel.calls.length, localInvocations: modelRecord?.localInvocations },
      };
    });
    causal('F3', `${item.name} nested executable is refused for direct insertion`, () => {
      const context = contextFor(firstRowLua);
      const catalog = catalogFor(context);
      const entry = structuralInsert(catalog, 'first-row');
      const before = sourceText(context);
      const bytes = workspaceBytes(context.workspace);
      const payload = `frame:display(${item.expression})`;
      const result = structuralApply(context, catalog, entry, payload);
      return {
        pass: result.accepted === false && structuralRefusalPreservesInput(result, context, catalog, bytes, before),
        detail: { accepted: result.accepted, reason: structuralResultReason(result) },
      };
    });
  }

  causal('F4', 'accepted structural authority is deeply immutable before return', () => {
    const context = contextFor(firstRowLua);
    const catalog = catalogFor(context);
    const entry = structuralInsert(catalog, 'first-row');
    const result = structuralApply(context, catalog, entry, firstRowPayload);
    if (!result.accepted) return { pass: false, detail: { accepted: false, reason: structuralResultReason(result), detail: structuralResultDetail(result) } };
    const changedPassthrough = result.workspace.passthroughFiles?.find(file => file.path === 'ui/edit.lua');
    const changedSource = result.source.bundle?.sourceFiles.find(file => file.path === 'ui/edit.lua');
    const surfaces = [
      result,
      result.workspace,
      result.workspace.passthroughFiles,
      changedPassthrough,
      result.source,
      result.source.bundle,
      result.source.bundle?.sourceFiles,
      changedSource,
      result.catalog,
      result.catalog.entries,
      result.catalog.structuralEntries,
      result.catalog.insertEntries,
    ].filter(value => value !== undefined && value !== null);
    const mutationClosed = (action: () => void): boolean => {
      try {
        action();
        return false;
      } catch {
        return true;
      }
    };
    const workspaceRecord = result.workspace as unknown as Record<string, unknown>;
    const passthroughRecord = changedPassthrough as unknown as Record<string, unknown> | undefined;
    const sourceRecord = changedSource as unknown as Record<string, unknown> | undefined;
    const mutations = [
      mutationClosed(() => { workspaceRecord.id = 'authority-drift'; }),
      mutationClosed(() => { if (result.workspace.passthroughFiles) (result.workspace.passthroughFiles as unknown as unknown[])[0] = undefined; }),
      mutationClosed(() => { if (passthroughRecord) passthroughRecord.content = 'authority-drift'; }),
      mutationClosed(() => { if (passthroughRecord) passthroughRecord.bytes = 0; }),
      mutationClosed(() => { if (sourceRecord) sourceRecord.text = 'authority-drift'; }),
      mutationClosed(() => { if (sourceRecord) sourceRecord.callModel = undefined; }),
    ];
    return {
      pass: surfaces.every(surface => Object.isFrozen(surface)) && mutations.every(Boolean),
      detail: { frozen: surfaces.map(surface => Object.isFrozen(surface)), mutations, changedPassthrough: Boolean(changedPassthrough), changedSource: Boolean(changedSource) },
    };
  });

  causal('F5', 'fallback-display insertion causally reissues as first-row', () => {
    const context = contextFor(fallbackTableTransitionLua);
    const catalog = catalogFor(context);
    const entry = structuralInsert(catalog, 'fallback-display');
    const result = structuralApply(context, catalog, entry, 'table:addRow(false, {})');
    return {
      pass: result.accepted === true
        && result.reparsed
        && result.catalog.insertEntries?.some(candidate => candidate.anchor === 'first-row') === true,
      detail: { accepted: result.accepted, reason: structuralResultReason(result), detail: structuralResultDetail(result), inserts: result.accepted ? result.catalog.insertEntries : undefined },
    };
  });

  const inlineFluentLua = [
    'local menu = { name = "Inline fluent", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local table = frame:addTable(1, {})',
    'table:addRow(false, {})[1]:createText("x", {})',
    'frame:display()',
    '',
  ].join('\n');
  causal('F6', 'fluent row/createText insertion accepts exact owner-relative identity remap', () => {
    const context = contextFor(inlineFluentLua);
    const catalog = catalogFor(context);
    const entry = structuralInsert(catalog, 'first-row');
    const before = sourceText(context);
    const beforeLedger = ledgerCounts(context.source);
    const outsideBefore = JSON.stringify((context.workspace.passthroughFiles || []).filter(file => file.path !== entry.path));
    const result = structuralApply(context, catalog, entry, 'table:addRow(false, {})');
    const outsideAfter = result.accepted
      ? JSON.stringify((result.workspace.passthroughFiles || []).filter(file => file.path !== entry.path))
      : undefined;
    const afterLedger = result.accepted ? ledgerCounts(result.source) : undefined;
    return {
      pass: result.accepted === true
        && result.reparsed
        && sourceText(result).includes('table:addRow(false, {})[1]:createText("x", {})')
        && sourceText(result).includes(`${entry.indentation}table:addRow(false, {})`)
        && outsideAfter === outsideBefore
        && beforeLedger !== undefined
        && afterLedger?.calls === beforeLedger.calls + 1
        && afterLedger.operations === beforeLedger.operations + 1
        && result.catalog.insertEntries?.some(candidate => candidate.anchor === 'first-row') === true
        && before !== sourceText(result),
      detail: { accepted: result.accepted, reason: structuralResultReason(result), detail: structuralResultDetail(result), beforeLedger, afterLedger, outsideBefore, outsideAfter },
    };
  });

  interface AggregateMatrixRow {
    readonly family: string;
    readonly name: string;
    readonly pass: boolean;
    readonly detail: string;
  }
  const aggregateRows: AggregateMatrixRow[] = [];
  const aggregate = (
    family: string,
    name: string,
    probe: () => { readonly pass: boolean; readonly detail?: unknown },
  ): void => {
    try {
      const result = probe();
      aggregateRows.push({ family, name, pass: result.pass, detail: causalDetail(result.detail) });
    } catch (error) {
      aggregateRows.push({
        family,
        name,
        pass: false,
        detail: causalDetail({ threw: true, error: error instanceof Error ? error.message : String(error) }),
      });
    }
  };

  const minimalFallbackLua = [
    'local menu = { name = "Minimal fallback", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'frame:display()',
    '',
  ].join('\n');
  const hiddenExecutableCases = [
    { name: 'fallback nested print', payload: 'frame:display(print("x"))' },
    { name: 'fallback nested foo', payload: 'frame:display(foo())' },
    { name: 'fallback function literal', payload: 'frame:display(function() foo() end)' },
    { name: 'fallback IIFE', payload: 'frame:display((function() foo() end)())' },
    { name: 'fallback load call', payload: 'frame:display(load("foo")())' },
    { name: 'fallback table literal', payload: 'frame:display({ value = foo() })' },
  ] as const;
  for (const item of hiddenExecutableCases) {
    aggregate('F3', `${item.name} refuses at complete executable-call validation`, () => {
      const context = contextFor(minimalFallbackLua);
      const catalog = catalogFor(context);
      const entry = structuralInsert(catalog, 'fallback-display');
      const before = sourceText(context);
      const bytes = workspaceBytes(context.workspace);
      const result = structuralApply(context, catalog, entry, item.payload);
      return {
        pass: result.accepted === false
          && result.reason === 'replacement-parse-failure'
          && structuralResultDetail(result)?.includes('nested executable') === true
          && structuralRefusalPreservesInput(result, context, catalog, bytes, before),
        detail: { accepted: result.accepted, reason: structuralResultReason(result), detail: structuralResultDetail(result) },
      };
    });
  }

  const identityLikeLiterals = [
    '@row:999999',
    '@cell:888888',
    'local-invocation:literal||999|1000',
    '|call|||1:2:3|1:2:4',
  ] as const;
  const identityLiteralLua = [
    'local menu = { name = "Identity literals", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local table = frame:addTable(1, {})',
    ...identityLikeLiterals.map((literal, index) => `table:addRow(false, {})[1]:createText('${literal}', { index = ${index} })`),
    'frame:display()',
    '',
  ].join('\n');
  aggregate('F4', 'ordinary createText identity-like literals remain verbatim and accept', () => {
    const context = contextFor(identityLiteralLua);
    const catalog = catalogFor(context);
    const entry = structuralInsert(catalog, 'first-row');
    const result = structuralApply(context, catalog, entry, firstRowPayload);
    const after = result.accepted ? sourceText(result) : '';
    return {
      pass: result.accepted === true
        && result.reparsed
        && identityLikeLiterals.every(literal => after.includes(`'${literal}'`))
        && after.includes(`${entry.indentation}${firstRowPayload}`),
      detail: {
        accepted: result.accepted,
        reason: structuralResultReason(result),
        detail: structuralResultDetail(result),
        after,
      },
    };
  });

  aggregate('F4', 'accepted structural result is deeply frozen and detached from all mutable inputs', () => {
    const context = contextFor(firstRowLua);
    const catalog = catalogFor(context);
    const entry = structuralInsert(catalog, 'first-row');
    const originalWorkspaceObjects = new Set(objectGraph(context.workspace));
    const originalSourceObjects = new Set(objectGraph(context.source));
    const originalCatalogObjects = new Set(objectGraph(catalog));
    const beforeWorkspace = JSON.stringify(context.workspace);
    const beforeSource = JSON.stringify(context.source);
    const beforeCatalog = JSON.stringify(catalog);
    const originalMutableObjects = [...originalWorkspaceObjects, ...originalSourceObjects]
      .filter(value => !Object.isFrozen(value));
    const beforeMutable = originalMutableObjects.length > 0;
    const result = structuralApply(context, catalog, entry, firstRowPayload);
    if (!result.accepted) {
      return { pass: false, detail: { accepted: false, reason: structuralResultReason(result), detail: structuralResultDetail(result) } };
    }
    const authoritySurfaces = [result.workspace, result.source, result.catalog];
    const returnedFrozen = deepFrozen(result) && authoritySurfaces.every(deepFrozen);
    const inputGraph = new Set(originalMutableObjects);
    const detached = authoritySurfaces.every(surface => !graphShares(surface, inputGraph));
    const inputsUnchanged = JSON.stringify(context.workspace) === beforeWorkspace
      && JSON.stringify(context.source) === beforeSource
      && JSON.stringify(catalog) === beforeCatalog;
    const inputsRemainMutable = beforeMutable && allUnfrozen(originalMutableObjects);
    return {
      pass: returnedFrozen && detached && inputsUnchanged && inputsRemainMutable,
      detail: {
        returnedFrozen,
        detached,
        inputsUnchanged,
        beforeMutable,
        inputsRemainMutable,
        sharedWorkspace: graphShares(result.workspace, originalWorkspaceObjects),
        sharedSource: graphShares(result.source, originalSourceObjects),
        sharedMutableSource: graphShares(result.source, new Set([...originalSourceObjects].filter(value => !Object.isFrozen(value)))),
        sharedCatalog: graphShares(result.catalog, originalCatalogObjects),
      },
    };
  });

  const fallbackTransitionLua = [
    'local menu = { name = "Fallback transition exact", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local table = frame:addTable(1, {})',
    'frame:display()',
    '',
  ].join('\n');
  const structuralSequenceShape = (catalog: X4UiSourceEditCatalog): readonly unknown[] => (catalog.structuralEntries || []).map(candidate => ({
    kind: candidate.kind,
    anchor: candidate.kind === 'insert-call' ? candidate.anchor : undefined,
    startOffset: candidate.startOffset,
    endOffset: candidate.endOffset,
  }));
  const operationShape = (operation: X4UiLayoutOperation): Record<string, unknown> => {
    const record = operation as unknown as Record<string, unknown>;
    return {
      id: operation.id,
      kind: operation.kind,
      modelOrder: operation.modelOrder,
      status: operation.status,
      tableId: record.tableId,
      frameId: record.frameId,
      rowId: record.rowId,
      cellId: record.cellId,
      parentPath: record.parentPath,
      relatedPath: record.relatedPath,
      localInvocations: record.localInvocations,
      kernel: record.kernel,
      source: operation.source,
    };
  };
  aggregate('F5', 'fallback reissue has exact target, owner tuple, entry sequence, and one operation', () => {
    const context = contextFor(fallbackTransitionLua);
    const catalog = catalogFor(context);
    const entry = structuralInsert(catalog, 'fallback-display');
    const beforeProjected = projectedProgramFor(context.source);
    const beforeSequence = structuralSequenceShape(catalog);
    const beforeOperations = beforeProjected?.program.operations || [];
    const result = structuralApply(context, catalog, entry, 'table:addRow(false, {})');
    if (!result.accepted) {
      return { pass: false, detail: { accepted: false, reason: structuralResultReason(result), detail: structuralResultDetail(result) } };
    }
    const afterProjected = projectedProgramFor(result.source);
    const insertedStart = entry.startOffset + entry.indentation.length;
    const insertedEnd = entry.startOffset + result.replacement.length;
    const insertedOperations = (afterProjected?.program.operations || []).filter(operation => {
      const shape = operationShape(operation);
      const source = shape.source as Record<string, unknown> | undefined;
      const start = source?.start as Record<string, unknown> | undefined;
      const end = source?.end as Record<string, unknown> | undefined;
      return shape.kind === 'addRow'
        && typeof start?.offset === 'number'
        && typeof end?.offset === 'number'
        && start.offset >= insertedStart
        && end.offset <= insertedEnd;
    });
    const transitionedAnchor = result.catalog.insertEntries?.find(candidate => candidate.anchor === 'first-row');
    const insertedShape = insertedOperations.length === 1 ? operationShape(insertedOperations[0]) : undefined;
    const transitionedOwner = transitionedAnchor?.provenance.owner;
    const targetOffsetDelta = result.replacement.length - (entry.endOffset - entry.startOffset);
    const mapTargetOffset = (offset: number): number => offset < entry.startOffset ? offset : offset + targetOffsetDelta;
    const targetExact = result.catalog.target.source.file === entry.provenance.targetSource.file
      && result.catalog.target.source.sourcePath === entry.provenance.targetSource.sourcePath
      && result.catalog.target.source.start.offset === mapTargetOffset(entry.provenance.targetSource.start.offset)
      && result.catalog.target.source.end.offset === mapTargetOffset(entry.provenance.targetSource.end.offset)
      && result.catalog.target.sourceIdentity.sha256 === result.catalog.sourceIdentity.sha256
      && result.catalog.sourceIdentity.sha256 !== entry.provenance.sourceIdentity.sha256;
    const afterOperations = afterProjected?.program.operations || [];
    const exactOneOperation = beforeOperations.length + 1 === afterOperations.length
      && insertedOperations.length === 1
      && afterOperations.filter(operation => operation.kind === 'addRow').length
        === beforeOperations.filter(operation => operation.kind === 'addRow').length + 1;
    const exactSequence = exactEntrySequence(result.catalog)
      && structuralSequenceShape(result.catalog).length === beforeSequence.length + 1
      && result.catalog.deleteEntries?.length === 2
      && result.catalog.insertEntries?.length === 1
      && result.catalog.insertEntries[0].anchor === 'first-row';
    const ownerExact = typeof insertedShape?.tableId === 'string'
      && transitionedOwner?.ownerId === insertedShape.tableId
      && transitionedOwner?.kind === 'table'
      && transitionedOwner.frameId === entry.provenance.owner?.ownerId;
    return {
      pass: result.reparsed
        && targetExact
        && exactOneOperation
        && exactSequence
        && ownerExact
        && result.catalog.verification === 'Not verified in game',
      detail: {
        beforeSequence,
        afterSequence: structuralSequenceShape(result.catalog),
        targetExact,
        targetSource: result.catalog.target.source,
        targetExpected: {
          file: entry.provenance.targetSource.file,
          sourcePath: entry.provenance.targetSource.sourcePath,
          startOffset: mapTargetOffset(entry.provenance.targetSource.start.offset),
          endOffset: mapTargetOffset(entry.provenance.targetSource.end.offset),
          sourceSha256: result.catalog.sourceIdentity.sha256,
          replacementLength: result.replacement.length,
        },
        exactOneOperation,
        insertedOperations: insertedOperations.map(operationShape),
        insertedTableId: insertedShape?.tableId,
        transitionedOwner,
        ownerExact,
        verification: result.catalog.verification,
      },
    };
  });
  aggregate('F5', 'foreign fallback payload refuses without reissue or mutation', () => {
    const context = contextFor(foreignFrameFallbackLua);
    const catalog = catalogFor(context);
    const entry = structuralInsert(catalog, 'fallback-display');
    const before = sourceText(context);
    const bytes = workspaceBytes(context.workspace);
    const result = structuralApply(context, catalog, entry, 'tableB:addRow(false, {})');
    return {
      pass: result.accepted === false
        && result.reason === 'reparse-provenance-drift'
        && structuralRefusalPreservesInput(result, context, catalog, bytes, before),
      detail: { accepted: result.accepted, reason: structuralResultReason(result), detail: structuralResultDetail(result) },
    };
  });
  aggregate('F5', 'ambiguous frame ancestry emits no fallback action', () => {
    const context = contextFor(frameOwnerReassignmentLua);
    const catalog = catalogFor(context);
    return {
      pass: (catalog.insertEntries || []).length === 0
        && (catalog.structuralEntries || []).every(candidate => candidate.kind !== 'insert-call'),
      detail: { inserts: catalog.insertEntries, structural: catalog.structuralEntries },
    };
  });

  const stateContinuityFor = (operations: readonly X4UiLayoutOperation[]): boolean => operations.every((operation, index, allOperations) => {
    const record = operation as unknown as Record<string, unknown>;
    const kernel = asRecord(record.kernel);
    if (!kernel || typeof record.tableId !== 'string') return true;
    const previous = allOperations.slice(0, index).reverse().find(candidate => {
      const candidateRecord = candidate as unknown as Record<string, unknown>;
      return candidateRecord.tableId === record.tableId
        && asRecord(candidateRecord.kernel)?.stateAfter !== undefined;
    });
    return !previous || JSON.stringify(asRecord((previous as unknown as Record<string, unknown>).kernel)?.stateAfter)
      === JSON.stringify(kernel.stateBefore);
  });

  aggregate('F6', 'complete semantic ledger preserves causal splice mapping and state continuity', () => {
    const context = contextFor(inlineFluentLua);
    const catalog = catalogFor(context);
    const entry = structuralInsert(catalog, 'first-row');
    const beforeProjected = projectedProgramFor(context.source);
    const result = structuralApply(context, catalog, entry, firstRowPayload);
    if (!result.accepted || !beforeProjected) {
      return { pass: false, detail: { accepted: result.accepted, reason: structuralResultReason(result), detail: structuralResultDetail(result) } };
    }
    const afterProjected = projectedProgramFor(result.source);
    if (!afterProjected) return { pass: false, detail: 'post-splice projection missing' };
    const splice = {
      startOffset: entry.startOffset,
      endOffset: entry.endOffset,
      replacementLength: result.replacement.length,
      beforeText: sourceText(context),
      afterText: sourceText(result),
    };
    const beforeCalls = causalCallLedger(context.source, splice, 'before');
    const afterFile = result.source.bundle?.sourceFiles.find(candidate => candidate.path === 'ui/edit.lua');
    const insertedCallStart = entry.startOffset + entry.indentation.length;
    const insertedCallEnd = entry.startOffset + result.replacement.length;
    const afterCalls = causalCallLedger(result.source, splice, 'after').filter((_, index) => {
      const call = afterFile?.callModel.calls[index];
      return !(call && call.name === 'addRow'
        && call.source.start.offset >= insertedCallStart
        && call.source.end.offset <= insertedCallEnd);
    });
    const isInsertedOperation = (operation: X4UiLayoutOperation): boolean => operation.kind === 'addRow'
      && operation.source.start.offset >= insertedCallStart
      && operation.source.end.offset <= insertedCallEnd;
    const rawAfterOperations = afterProjected.program.operations.filter(operation => !isInsertedOperation(operation));
    const beforeOperations = causalOperationLedger(beforeProjected.program, splice, 'before');
    const afterOperations = causalOperationLedger(afterProjected.program, splice, 'after').filter((_, index) => {
      return !isInsertedOperation(afterProjected.program.operations[index]);
    });
    const ledgerSame = JSON.stringify(beforeCalls) === JSON.stringify(afterCalls)
      && JSON.stringify(beforeOperations) === JSON.stringify(afterOperations);
    const stateContinuity = stateContinuityFor(afterProjected.program.operations);
    const corruptOperations = structuredClone(rawAfterOperations) as X4UiLayoutOperation[];
    const corruptOperation = corruptOperations.find(candidate => {
      const record = candidate as unknown as Record<string, unknown>;
      return asRecord(record.kernel)?.stateAfter !== undefined;
    });
    if (corruptOperation) {
      const kernel = asRecord((corruptOperation as unknown as Record<string, unknown>).kernel);
      if (kernel) kernel.stateAfter = { ...(asRecord(kernel.stateAfter) || {}), __causalCorruption: true };
    }
    const corruptionDetected = !stateContinuityFor(corruptOperations);
    return {
      pass: result.reparsed && ledgerSame && stateContinuity && corruptionDetected,
      detail: { ledgerSame, stateContinuity, corruptionDetected, beforeCalls, afterCalls, beforeOperations, afterOperations },
    };
  });

  interface RoundFourMatrixRow {
    readonly id: string;
    readonly family: string;
    readonly name: string;
    readonly pass: boolean;
    readonly detail: string;
  }
  const roundFourRows: RoundFourMatrixRow[] = [];
  const roundFour = (
    id: string,
    family: string,
    name: string,
    probe: () => { readonly pass: boolean; readonly detail?: unknown },
  ): void => {
    try {
      const result = probe();
      roundFourRows.push({ id, family, name, pass: result.pass, detail: causalDetail(result.detail) });
    } catch (error) {
      roundFourRows.push({
        id,
        family,
        name,
        pass: false,
        detail: causalDetail({ threw: true, error: error instanceof Error ? error.message : String(error) }),
      });
    }
  };

  const roundFourInertPayloads = [
    { id: 'A-P1', name: 'double-quoted call-shaped text', payload: 'frame:display({ value = "foo()" })' },
    { id: 'A-P2', name: 'single-quoted call-shaped text', payload: "frame:display({ value = 'print(x) -- foo()' })" },
    { id: 'A-P3', name: 'escaped quote and backslash text', payload: String.raw`frame:display({ value = "foo(\"bar\\baz\")" })` },
    { id: 'A-P4', name: 'Lua long-bracket string depth one', payload: 'frame:display({ value = [=[foo() print(x) -- inert]=] })' },
    { id: 'A-P5', name: 'Lua long-bracket string depth two', payload: 'frame:display({ value = [==[foo() [=[print(x) -- inert]=] ]==] })' },
    { id: 'A-P6', name: 'bounded block comment before value', payload: 'frame:display(--[==[ foo() print(x) ]==]{ value = "ok" })' },
    { id: 'A-P7', name: 'bounded block comment inside table', payload: 'frame:display({ value = "ok" --[==[ foo() print(x) ]==] })' },
  ] as const;
  for (const item of roundFourInertPayloads) {
    roundFour(item.id, 'A', `${item.name} accepts byte-verbatim`, () => {
      const context = contextFor(minimalFallbackLua);
      const catalog = catalogFor(context);
      const entry = structuralInsert(catalog, 'fallback-display');
      const before = sourceText(context);
      const beforeBytes = workspaceBytes(context.workspace);
      const result = structuralApply(context, catalog, entry, item.payload);
      const expectedReplacement = `${entry.indentation}${item.payload}${entry.lineEnding}`;
      const after = result.accepted ? sourceText(result) : '';
      return {
        pass: result.accepted === true
          && result.reparsed
          && result.replacement === expectedReplacement
          && after === before.slice(0, entry.startOffset) + expectedReplacement + before.slice(entry.endOffset)
          && workspaceBytes(context.workspace) === beforeBytes
          && sourceText(context) === before
          && result.catalog.verification === 'Not verified in game',
        detail: {
          accepted: result.accepted,
          reason: structuralResultReason(result),
          detail: structuralResultDetail(result),
          payload: item.payload,
          replacement: result.accepted ? result.replacement : undefined,
        },
      };
    });
  }

  const roundFourExecutablePayloads = [
    { id: 'A-N1', name: 'function literal', payload: 'frame:display(function() foo() end)' },
    { id: 'A-N2', name: 'IIFE', payload: 'frame:display((function() foo() end)())' },
    { id: 'A-N3', name: 'load call', payload: 'frame:display(load("foo")())' },
    { id: 'A-N4', name: 'loadstring call', payload: 'frame:display(loadstring("foo")())' },
    { id: 'A-N5', name: 'dofile call', payload: 'frame:display(dofile("foo"))' },
    { id: 'A-N6', name: 'nested foo call', payload: 'frame:display(foo())' },
    { id: 'A-N7', name: 'nested print call', payload: 'frame:display(print("x"))' },
    { id: 'A-N8', name: 'table-body executable call', payload: 'frame:display({ value = foo() })' },
  ] as const;
  for (const item of roundFourExecutablePayloads) {
    roundFour(item.id, 'A', `${item.name} refuses only at the complete executable-call gate`, () => {
      const context = contextFor(minimalFallbackLua);
      const catalog = catalogFor(context);
      const entry = structuralInsert(catalog, 'fallback-display');
      const before = sourceText(context);
      const beforeBytes = workspaceBytes(context.workspace);
      const result = structuralApply(context, catalog, entry, item.payload);
      return {
        pass: catalog.status === 'ready'
          && entry.provenance.owner?.kind === 'frame'
          && result.accepted === false
          && result.reason === 'replacement-parse-failure'
          && result.detail.includes('unproven nested executable invocation')
          && result.entry?.id === entry.id
          && structuralRefusalPreservesInput(result, context, catalog, beforeBytes, before),
        detail: {
          accepted: result.accepted,
          reason: structuralResultReason(result),
          detail: structuralResultDetail(result),
          catalogStatus: catalog.status,
          owner: entry.provenance.owner,
        },
      };
    });
  }

  const roundFourIdentityControls = [
    { kind: 'user-row', origin: 'caller', path: '@row:999999' },
    { kind: 'user-cell', origin: 'caller', path: '@cell:888888' },
    { kind: 'user-local', origin: 'caller', path: 'local-invocation:literal||999|1000' },
    { kind: 'user-call', origin: 'caller', path: '|call|||1:2:3|1:2:4' },
  ] as const;
  const roundFourIdentityLua = [
    'local menu = { name = "Round four identity controls", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local table = frame:addTable(1, {})',
    `table:addRow(false, { controls = { ${roundFourIdentityControls.map(control => `{ kind = "${control.kind}", origin = "${control.origin}", path = "${control.path}" }`).join(', ')} } })`,
    'frame:display()',
    '',
  ].join('\n');
  roundFour('B-P1', 'B', 'nested user kind/origin/path identity lookalikes remain verbatim', () => {
    const context = contextFor(roundFourIdentityLua);
    const catalog = catalogFor(context);
    const entry = structuralInsert(catalog, 'first-row');
    const before = sourceText(context);
    const beforeBytes = workspaceBytes(context.workspace);
    const result = structuralApply(context, catalog, entry, firstRowPayload);
    const after = result.accepted ? sourceText(result) : '';
    return {
      pass: result.accepted === true
        && result.reparsed
        && roundFourIdentityControls.every(control => after.includes(`path = "${control.path}"`))
        && after === before.slice(0, entry.startOffset)
          + `${entry.indentation}${firstRowPayload}${entry.lineEnding}`
          + before.slice(entry.endOffset)
        && workspaceBytes(context.workspace) === beforeBytes
        && sourceText(context) === before,
      detail: {
        accepted: result.accepted,
        reason: structuralResultReason(result),
        detail: structuralResultDetail(result),
        after,
      },
    };
  });
  const roundFourUserRecordSplice = {
    beforeText: 'x'.repeat(2000),
    afterText: 'x'.repeat(2000),
    startOffset: 100,
    endOffset: 100,
    replacementLength: 17,
    side: 'before' as const,
  };
  const roundFourUserRecordMutation = (path: string): string => path.replace(/\d+$/, raw => String(Number(raw) + 1));
  for (const [index, control] of roundFourIdentityControls.entries()) {
    roundFour(`B-N${index + 1}`, 'B', `${control.path} user literal is not normalized as a parser path`, () => {
      const userRecord = { kind: 'user-control', origin: 'caller', path: control.path };
      const mutatedRecord = { ...userRecord, path: roundFourUserRecordMutation(control.path) };
      const unchangedBefore = causalNormalize({ nested: userRecord }, '', roundFourUserRecordSplice, 'before');
      const unchangedAfter = causalNormalize({ nested: userRecord }, '', { ...roundFourUserRecordSplice, side: 'after' }, 'after');
      const mutatedBefore = causalNormalize({ nested: mutatedRecord }, '', roundFourUserRecordSplice, 'before');
      return {
        pass: JSON.stringify(unchangedBefore) === JSON.stringify(unchangedAfter)
          && JSON.stringify(mutatedBefore) !== JSON.stringify(unchangedBefore)
          && contextFor(roundFourIdentityLua).source.status === 'source-owned',
        detail: { control, unchangedBefore, unchangedAfter, mutatedBefore },
      };
    });
  }

  const roundFourNoopDetach = (): { readonly pass: boolean; readonly detail?: unknown } => {
    const context = contextFor(baseLua);
    const catalog = catalogFor(context);
    const entry = editableField(catalog, 'number', 'semantics.count');
    const inputObjects = [...objectGraph(context.workspace), ...objectGraph(context.source), ...objectGraph(catalog)];
    const mutableInputObjects = inputObjects.filter(value => !Object.isFrozen(value));
    const beforeWorkspace = workspaceBytes(context.workspace);
    const beforeSource = sourceText(context);
    const result = apply(context, catalog, entry, entry.value);
    const returned = result.accepted ? [result.workspace, result.source, result.catalog, result.entry] : [];
    return {
      pass: result.accepted === true
        && result.changed === false
        && deepFrozen(result)
        && returned.every(surface => !graphShares(surface, new Set(inputObjects)))
        && allUnfrozen(mutableInputObjects)
        && workspaceBytes(context.workspace) === beforeWorkspace
        && sourceText(context) === beforeSource,
      detail: {
        accepted: result.accepted,
        changed: result.accepted ? result.changed : undefined,
        returnedFrozen: deepFrozen(result),
        detached: returned.every(surface => !graphShares(surface, new Set(inputObjects))),
        inputsRemainMutable: allUnfrozen(mutableInputObjects),
        reason: result.accepted === false ? result.reason : undefined,
      },
    };
  };
  roundFour('C-N1', 'C', 'unchanged successful result is frozen and detached without freezing inputs', roundFourNoopDetach);

  roundFour('C-P1', 'C', 'structural result freezes nested non-enumerable and symbol data records', () => {
    const context = contextFor(firstRowLua);
    const hiddenSymbol = Symbol('round-four-hidden');
    const hiddenLeaf = { value: 'hidden-leaf' };
    const hiddenRecord: Record<string | symbol, unknown> = { visible: { nested: true } };
    Object.defineProperty(hiddenRecord, 'nonEnumerableChild', {
      value: hiddenLeaf,
      enumerable: false,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(hiddenRecord, hiddenSymbol, {
      value: { value: 'symbol-child' },
      enumerable: false,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(context.workspace as object, '__roundFourHidden', {
      value: hiddenRecord,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    const catalog = catalogFor(context);
    const entry = structuralInsert(catalog, 'first-row');
    const originalHiddenMutable = [hiddenRecord, hiddenLeaf, hiddenRecord[hiddenSymbol] as object];
    const result = structuralApply(context, catalog, entry, firstRowPayload);
    const returnedHidden = result.accepted
      ? (result.workspace as unknown as Record<string, unknown>).__roundFourHidden as Record<string | symbol, unknown> | undefined
      : undefined;
    const returnedHiddenValues = returnedHidden
      ? [returnedHidden, returnedHidden.nonEnumerableChild as object, returnedHidden[hiddenSymbol] as object]
      : [];
    return {
      pass: result.accepted === true
        && result.reparsed
        && returnedHidden !== undefined
        && returnedHiddenValues.every(value => value !== undefined && Object.isFrozen(value))
        && originalHiddenMutable.every(value => !Object.isFrozen(value)),
      detail: {
        accepted: result.accepted,
        reason: structuralResultReason(result),
        returnedHidden: returnedHidden !== undefined,
        returnedFrozen: returnedHiddenValues.map(value => value === undefined ? false : Object.isFrozen(value)),
        inputsFrozen: originalHiddenMutable.map(value => Object.isFrozen(value)),
      },
    };
  });

  roundFour('C-N2', 'C', 'accessor boundary observes zero getters and fails closed', () => {
    const context = contextFor(firstRowLua);
    let reads = 0;
    const accessorWorkspace = Object.defineProperty({}, 'passthroughFiles', {
      get(): never {
        reads += 1;
        throw new Error('round-four accessor observed');
      },
      enumerable: true,
    });
    const outcome = invokeDiscoveryBoundary(accessorWorkspace, context.source, context.program, context.evidenceAuthority);
    const issuedCatalog = catalogFor(context);
    const issuedEntry = editableField(issuedCatalog, 'number', 'semantics.count');
    let applyReads = 0;
    Object.defineProperty(context.workspace as object, '__roundFourAccessor', {
      configurable: true,
      enumerable: false,
      get(): never {
        applyReads += 1;
        throw new Error('round-four apply accessor observed');
      },
    });
    const applyOutcome = invokePublic(() => apply(context, issuedCatalog, issuedEntry, issuedEntry.value));
    return {
      pass: outcome.threw === false
        && outcome.value?.status === 'locked'
        && reads === 0
        && applyOutcome.threw === false
        && applyOutcome.value?.accepted === false
        && applyOutcome.value.changed === false
        && applyOutcome.value.workspace === context.workspace
        && applyOutcome.value.source === context.source
        && applyOutcome.value.catalog === issuedCatalog
        && applyReads === 0,
      detail: {
        threw: outcome.threw,
        status: outcome.value?.status,
        reads,
        reason: outcome.value?.reason,
        applyThrew: applyOutcome.threw,
        applyAccepted: applyOutcome.value?.accepted,
        applyChanged: applyOutcome.value?.changed,
        applyWorkspaceExact: applyOutcome.value?.workspace === context.workspace,
        applySourceExact: applyOutcome.value?.source === context.source,
        applyCatalogExact: applyOutcome.value?.catalog === issuedCatalog,
        applyReads,
      },
    };
  });

  interface RoundFourLedgerSplice {
    readonly startOffset: number;
    readonly endOffset: number;
    readonly replacementLength: number;
    readonly beforeText: string;
    readonly afterText: string;
  }
  const roundFourLedgerIdentityKeys = new Set([
    'id',
    'callId',
    'operationId',
    'frameId',
    'tableId',
    'ownerId',
    'targetId',
  ]);
  const roundFourLedgerOrderKeys = new Set(['order', 'modelOrder', 'callOrder', 'streamIndex']);
  const roundFourLedgerSourceKeys = new Set([
    'rowId',
    'rowIds',
    'cellId',
    'cellIds',
    'parentPath',
    'parentPaths',
    'relatedPath',
    'relatedPaths',
    'localInvocation',
    'localInvocations',
    'localInvocationId',
    'localInvocationIds',
    'localInvocationResult',
    'localInvocationResults',
    'callLocation',
    'callLocations',
    'callLocationId',
    'callLocationIds',
    'callLocationResult',
    'callLocationResults',
  ]);
  const roundFourLedgerMapOffset = (offset: number, splice: RoundFourLedgerSplice, side: 'before' | 'after'): number | undefined => {
    if (side === 'after') return offset;
    if (offset < splice.startOffset) return offset;
    if (offset >= splice.endOffset) return offset + splice.replacementLength - (splice.endOffset - splice.startOffset);
    return undefined;
  };
  const roundFourLedgerOrderShift = (entry: X4UiSourceEditStructuralEntry, beforeOffset: number): number => {
    const insertedBefore = entry.kind === 'insert-call' && beforeOffset >= entry.startOffset ? 1 : 0;
    const removedBefore = entry.kind === 'delete-statement'
      ? entry.callBindings.filter(binding => binding.callSource.start.offset < beforeOffset).length
      : 0;
    return insertedBefore - removedBefore;
  };
  const roundFourLedgerLineColumnAt = (text: string, offset: number): { readonly line: number; readonly column: number } => {
    let line = 1;
    let lineStart = 0;
    for (let index = 0; index < offset; index += 1) {
      if (text[index] === '\n') {
        line += 1;
        lineStart = index + 1;
      }
    }
    return { line, column: offset - lineStart };
  };
  const roundFourLedgerRemapIdentity = (value: string, splice: RoundFourLedgerSplice, side: 'before' | 'after', orderShift: number): string => {
    if (side === 'after') return value;
    let result = value.replace(/^(operation:)(\d+)(\|)/, (_full, prefix: string, rawOrder: string, separator: string) =>
      `${prefix}${Number(rawOrder) + orderShift}${separator}`);
    result = result.replace(/\|\|(\d+):(\d+):(\d+)\|(\d+):(\d+):(\d+)/g, (
      _full,
      _beforeLineStart: string,
      _beforeColumnStart: string,
      rawStart: string,
      _beforeLineEnd: string,
      _beforeColumnEnd: string,
      rawEnd: string,
    ) => {
      const mappedStart = roundFourLedgerMapOffset(Number(rawStart), splice, side);
      const mappedEnd = roundFourLedgerMapOffset(Number(rawEnd), splice, side);
      if (mappedStart === undefined || mappedEnd === undefined) return '||<invalid-splice-location>|<invalid-splice-location>';
      const start = roundFourLedgerLineColumnAt(splice.afterText, mappedStart);
      const end = roundFourLedgerLineColumnAt(splice.afterText, mappedEnd);
      return `||${start.line}:${start.column}:${mappedStart}|${end.line}:${end.column}:${mappedEnd}`;
    });
    return result;
  };
  const roundFourLedgerNormalize = (
    value: unknown,
    key: string,
    splice: RoundFourLedgerSplice,
    side: 'before' | 'after',
    sourceDerived = false,
    orderShift = 0,
  ): unknown => {
    if (typeof value === 'string') {
      if (side === 'before' && roundFourLedgerIdentityKeys.has(key)) {
        return roundFourLedgerRemapIdentity(value, splice, side, orderShift);
      }
      return sourceDerived || roundFourLedgerSourceKeys.has(key)
        ? causalIdentityText(value, splice, side)
        : value;
    }
    if (typeof value === 'number') {
      if (side === 'before' && roundFourLedgerOrderKeys.has(key)) return value + orderShift;
      if (side === 'before' && key === 'sourceOrder') {
        const mapped = roundFourLedgerMapOffset(value, splice, side);
        return mapped === undefined ? '<invalid-splice-offset>' : mapped;
      }
      return value;
    }
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(child => roundFourLedgerNormalize(child, key, splice, side, sourceDerived, orderShift));
    const record = asRecord(value);
    if (!record) return value;
    if (key === 'enclosingStatement') {
      return {
        source: locationLedgerValue(record.source, splice, side),
        deletionSource: locationLedgerValue(record.deletionSource, splice, side),
        kind: record.kind,
        terminator: record.terminator,
        isStandaloneCallStatementRoot: record.isStandaloneCallStatementRoot,
      };
    }
    if (key === 'source' || key === 'sourceLiteral' || key === 'location' || key === 'deletionSource' || key === 'callSource') {
      return locationLedgerValue(value, splice, side);
    }
    return Object.fromEntries(Object.entries(record).map(([childKey, child]) => {
      const parserOwnedReference = (childKey === 'reference' || childKey === 'result')
        && (() => {
          const parserRecord = asRecord(child);
          const source = asRecord(parserRecord?.source);
          const start = asRecord(source?.start);
          const end = asRecord(source?.end);
          return typeof parserRecord?.kind === 'string'
            && typeof parserRecord.origin === 'string'
            && typeof source?.file === 'string'
            && typeof start?.offset === 'number'
            && typeof end?.offset === 'number';
        })();
      return [childKey, roundFourLedgerNormalize(
        child,
        childKey,
        splice,
        side,
        sourceDerived || roundFourLedgerSourceKeys.has(childKey) || parserOwnedReference,
        orderShift,
      )];
    }));
  };
  const roundFourLedgerDifferences = (left: unknown, right: unknown, path = ''): readonly string[] => {
    if (left === right) return [];
    if (Array.isArray(left) && Array.isArray(right)) {
      const differences = left.length === right.length ? [] : [`${path}.length: ${left.length} !== ${right.length}`];
      for (let index = 0; index < Math.max(left.length, right.length) && differences.length < 40; index += 1) {
        differences.push(...roundFourLedgerDifferences(left[index], right[index], `${path}[${index}]`));
      }
      return differences.slice(0, 40);
    }
    const leftRecord = asRecord(left);
    const rightRecord = asRecord(right);
    if (leftRecord && rightRecord) {
      const keys = [...new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])];
      const differences: string[] = [];
      for (const key of keys) {
        if (differences.length >= 40) break;
        differences.push(...roundFourLedgerDifferences(leftRecord[key], rightRecord[key], path ? `${path}.${key}` : key));
      }
      return differences.slice(0, 40);
    }
    return [`${path}: ${JSON.stringify(left)} !== ${JSON.stringify(right)}`];
  };
  const roundFourFullLedgerCompare = (
    beforeCalls: readonly unknown[],
    afterCalls: readonly unknown[],
    beforeOperations: readonly unknown[],
    afterOperations: readonly unknown[],
    entry: X4UiSourceEditStructuralEntry,
    splice: RoundFourLedgerSplice,
  ): { readonly pass: boolean; readonly calls: boolean; readonly operations: boolean; readonly callDifferences: readonly string[]; readonly operationDifferences: readonly string[] } => {
    const removedCallOrders = entry.kind === 'delete-statement'
      ? new Set(entry.callBindings.map(binding => binding.callOrder))
      : new Set<number>();
    const expectedCalls = beforeCalls.filter(call => {
      const order = asRecord(call)?.order;
      return typeof order !== 'number' || !removedCallOrders.has(order);
    });
    const removedOperationIds = entry.kind === 'delete-statement'
      ? new Set(entry.callBindings.map(binding => binding.operationId))
      : new Set<string>();
    const expectedOperations = beforeOperations.filter(operation => !removedOperationIds.has(asRecord(operation)?.id as string));
    const shiftFor = (value: unknown): number => {
      const source = asRecord(value)?.source;
      const start = asRecord(asRecord(source)?.start)?.offset;
      return typeof start === 'number' ? roundFourLedgerOrderShift(entry, start) : 0;
    };
    const normalizedBeforeCalls = expectedCalls.map(call => roundFourLedgerNormalize(call, '', splice, 'before', false, shiftFor(call)));
    const normalizedAfterCalls = afterCalls.map(call => roundFourLedgerNormalize(call, '', splice, 'after', false, 0));
    const normalizedBeforeOperations = expectedOperations.map(operation => roundFourLedgerNormalize(
      operation,
      '',
      splice,
      'before',
      false,
      shiftFor(operation),
    ));
    const normalizedAfterOperations = afterOperations.map(operation => roundFourLedgerNormalize(
      operation,
      '',
      splice,
      'after',
      false,
      0,
    ));
    const calls = expectedCalls.length === afterCalls.length
      && JSON.stringify(normalizedBeforeCalls) === JSON.stringify(normalizedAfterCalls);
    const operations = expectedOperations.length === afterOperations.length
      && JSON.stringify(normalizedBeforeOperations) === JSON.stringify(normalizedAfterOperations);
    return {
      pass: calls && operations,
      calls,
      operations,
      callDifferences: calls ? [] : roundFourLedgerDifferences(normalizedBeforeCalls, normalizedAfterCalls),
      operationDifferences: operations ? [] : roundFourLedgerDifferences(normalizedBeforeOperations, normalizedAfterOperations),
    };
  };
  const roundFourMutationContext = contextFor(fluentLua);
  const roundFourMutationCatalog = catalogFor(roundFourMutationContext);
  const roundFourMutationEntry = structuralDelete(roundFourMutationCatalog, entry => entry.callBindings.length === 2
    && entry.callBindings.some(binding => binding.callName === 'createText')
    && entry.callBindings.some(binding => binding.callName === 'setColSpan'));
  const roundFourMutationBeforeCalls = roundFourMutationContext.source.bundle?.sourceFiles
    .find(file => file.path === roundFourMutationEntry.path)?.callModel.calls || [];
  const roundFourMutationBeforeOperations = roundFourMutationContext.program.operations;
  const roundFourMutationBeforeText = sourceText(roundFourMutationContext);
  const roundFourMutationResult = structuralApply(roundFourMutationContext, roundFourMutationCatalog, roundFourMutationEntry);
  const roundFourMutationAfterProjection = roundFourMutationResult.accepted
    ? projectedProgramFor(roundFourMutationResult.source)
    : undefined;
  const roundFourMutationAfterCalls = roundFourMutationResult.accepted
    ? roundFourMutationResult.source.bundle?.sourceFiles.find(file => file.path === roundFourMutationEntry.path)?.callModel.calls || []
    : [];
  const roundFourMutationSplice: RoundFourLedgerSplice = {
    startOffset: roundFourMutationEntry.startOffset,
    endOffset: roundFourMutationEntry.endOffset,
    replacementLength: roundFourMutationResult.accepted ? roundFourMutationResult.replacement.length : 0,
    beforeText: roundFourMutationBeforeText,
    afterText: roundFourMutationResult.accepted ? sourceText(roundFourMutationResult) : '',
  };
  const roundFourMutationBaseline = roundFourMutationAfterProjection
    ? roundFourFullLedgerCompare(
      roundFourMutationBeforeCalls,
      roundFourMutationAfterCalls,
      roundFourMutationBeforeOperations,
      roundFourMutationAfterProjection.program.operations,
      roundFourMutationEntry,
      roundFourMutationSplice,
    )
    : { pass: false, calls: false, operations: false, callDifferences: ['projection missing'], operationDifferences: ['projection missing'] };
  roundFour('D-P1', 'D', 'accepted deletion proves the full causal call/operation ledger including sourceOrder', () => ({
    pass: roundFourMutationResult.accepted === true && roundFourMutationBaseline.pass,
    detail: {
      accepted: roundFourMutationResult.accepted,
      baseline: roundFourMutationBaseline,
      sourceOrderMapped: true,
      detail: structuralResultDetail(roundFourMutationResult),
    },
  }));
  const realSourceLongPartialLua = [
    'local helper = rawget(_G, "Helper")',
    'local menu = { name = "choiceTable", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local choiceTable = frame:addTable(3, {})',
    'choiceTable:setColWidthPercent(1, 33)',
    'choiceTable:setColWidthPercent(2, 34)',
    ...Array.from({ length: 56 }, () => 'frame:display()'),
    ...Array.from({ length: 40 }, (_, index) => {
      const row = `row${index + 1}`;
      return [
        `local ${row} = choiceTable:addRow(false, {})`,
        `${row}[1]:setColSpan(1):createText("retained-${index + 1}", {})`,
        `${row}[2]:setColSpan(1):createButton({ active = true }):setText("BUTTON-${index + 1}", {})`,
        `${row}[3]:setColSpan(1):createText("tail-${index + 1}", {})`,
      ];
    }).flat(),
    'local tailRow = choiceTable:addRow(true, {})',
    'tailRow[1]:setColSpan(1):createEditBox({',
    '  width = 20, height = 20, scaling = false,',
    '})',
    'tailRow[2]:setColSpan(1):createButton({ active = true }):setText("SEND", {})',
    'tailRow[3]:setColSpan(1):createButton({ active = true }):setText("END", {})',
    'frame:display()',
    '',
  ].join('\n');
  const realSourceLongPartialPreflight = buildX4UiWorkspaceSource(workspace(realSourceLongPartialLua));
  const realSourceLongPartialPreflightFile = realSourceLongPartialPreflight.bundle?.sourceFiles.find(file => file.path === 'ui/edit.lua');
  const realSourceLongPartialPreflightNormalization = realSourceLongPartialPreflightFile
    ? invokePublic(() => normalizeX4UiSourceEditLayoutModel(realSourceLongPartialPreflightFile.callModel))
    : { threw: false };
  if (realSourceLongPartialPreflightNormalization.threw) {
    throw new Error(JSON.stringify({
      stage: 'long partial fixture normalization',
      error: realSourceLongPartialPreflightNormalization.error,
      undefinedPaths: realSourceLongPartialPreflightFile ? ownUndefinedPaths(realSourceLongPartialPreflightFile.callModel) : [],
    }));
  }
  const realSourceLongPartialContext = contextFor(realSourceLongPartialLua);
  const realSourceLongPartialCatalog = catalogFor(realSourceLongPartialContext);
  const realSourceLongPartialEntry = structuralDelete(realSourceLongPartialCatalog, entry => entry.callBindings.length === 2
    && entry.callBindings[0]?.callName === 'setColSpan'
    && entry.callBindings[1]?.callName === 'createEditBox');
  const realSourceLongPartialBeforeFile = realSourceLongPartialContext.source.bundle?.sourceFiles
    .find(file => file.path === realSourceLongPartialEntry.path);
  if (!realSourceLongPartialBeforeFile) throw new Error('long partial source fixture Lua file missing');
  const realSourceLongPartialBeforeText = sourceText(realSourceLongPartialContext);
  const realSourceLongPartialAfterText = realSourceLongPartialBeforeText.slice(0, realSourceLongPartialEntry.startOffset)
    + realSourceLongPartialBeforeText.slice(realSourceLongPartialEntry.endOffset);
  const realSourceLongPartialAfterContext = contextFor(realSourceLongPartialAfterText);
  const realSourceLongPartialAfterFile = realSourceLongPartialAfterContext.source.bundle?.sourceFiles
    .find(file => file.path === realSourceLongPartialEntry.path);
  if (!realSourceLongPartialAfterFile) throw new Error('long partial source fixture post-splice Lua file missing');
  const realSourceLongPartialComparatorInput = {
    beforeCalls: realSourceLongPartialBeforeFile.callModel.calls,
    afterCalls: realSourceLongPartialAfterFile.callModel.calls,
    beforeRecords: realSourceLongPartialBeforeFile.callModel.records,
    afterRecords: realSourceLongPartialAfterFile.callModel.records,
    beforeOperations: realSourceLongPartialContext.program.operations,
    afterOperations: realSourceLongPartialAfterContext.program.operations,
    entry: realSourceLongPartialEntry,
    beforeText: realSourceLongPartialBeforeText,
    afterText: realSourceLongPartialAfterText,
    replacementLength: 0,
    insertedCallIndex: -1,
    insertedOperationIndex: -1,
  } as const;
  const realSourceLongPartialResult = structuralApply(
    realSourceLongPartialContext,
    realSourceLongPartialCatalog,
    realSourceLongPartialEntry,
  );
  const realSourceLongPartialComparator = compareX4UiSourceStructuralLedgerCorrespondence(
    realSourceLongPartialComparatorInput,
  );
  causal('B119-REAL-SOURCE-RED', 'long partial high-order multiline editbox delete proves the structural ledger splice', () => ({
    pass: realSourceLongPartialResult.accepted === true
      && realSourceLongPartialResult.reparsed
      && realSourceLongPartialComparator
      && realSourceLongPartialComparatorInput.beforeCalls.length - realSourceLongPartialComparatorInput.afterCalls.length === 2
      && realSourceLongPartialComparatorInput.beforeOperations.length - realSourceLongPartialComparatorInput.afterOperations.length === 2
      && realSourceLongPartialComparatorInput.beforeRecords.length - realSourceLongPartialComparatorInput.afterRecords.length === 5,
    detail: {
      entry: {
        startOffset: realSourceLongPartialEntry.startOffset,
        endOffset: realSourceLongPartialEntry.endOffset,
        callBindings: realSourceLongPartialEntry.callBindings,
      },
      before: {
        calls: realSourceLongPartialComparatorInput.beforeCalls.length,
        records: realSourceLongPartialComparatorInput.beforeRecords.length,
        operations: realSourceLongPartialComparatorInput.beforeOperations.length,
      },
      after: {
        calls: realSourceLongPartialComparatorInput.afterCalls.length,
        records: realSourceLongPartialComparatorInput.afterRecords.length,
        operations: realSourceLongPartialComparatorInput.afterOperations.length,
      },
      apply: {
        accepted: realSourceLongPartialResult.accepted,
        reason: structuralResultReason(realSourceLongPartialResult),
        detail: structuralResultDetail(realSourceLongPartialResult),
      },
      publicComparator: realSourceLongPartialComparator,
    },
  }));
  type LongStructuralCorrespondenceInput = Parameters<typeof compareX4UiSourceStructuralLedgerCorrespondence>[0];
  const cloneLongStructuralInput = (): LongStructuralCorrespondenceInput => ({
    ...realSourceLongPartialComparatorInput,
  });
  const mutableLongStructuralInput = (input: LongStructuralCorrespondenceInput): Record<string, unknown> =>
    input as unknown as Record<string, unknown>;
  const longOperationClone = (
    input: LongStructuralCorrespondenceInput,
    predicate: (operation: Record<string, unknown>) => boolean = () => true,
    side: 'beforeOperations' | 'afterOperations' = 'beforeOperations',
  ): Record<string, unknown> | undefined => {
    const operationsValue = (input as unknown as Record<string, unknown>)[side];
    const operations = Array.isArray(operationsValue) ? [...operationsValue] : [];
    const index = operations.findIndex(operation => {
      const record = asRecord(operation);
      return record !== undefined && predicate(record);
    });
    if (index < 0) return undefined;
    const operation = asRecord(operations[index]);
    if (!operation) return undefined;
    const clone = { ...operation };
    operations[index] = clone;
    mutableLongStructuralInput(input)[side] = operations;
    return clone;
  };
  const longRecordClone = (input: LongStructuralCorrespondenceInput): Record<string, unknown> | undefined => {
    const records = Array.isArray(input.beforeRecords) ? [...input.beforeRecords] : [];
    const index = records.findIndex(record => {
      const candidate = asRecord(record);
      const source = asRecord(candidate?.source);
      const start = asRecord(source?.start);
      return candidate !== undefined
        && candidate.recordType === 'call'
        && typeof start?.offset === 'number'
        && start.offset < realSourceLongPartialEntry.startOffset;
    });
    if (index < 0) return undefined;
    const record = asRecord(records[index]);
    if (!record) return undefined;
    const clone = { ...record };
    records[index] = clone;
    mutableLongStructuralInput(input).beforeRecords = records;
    return clone;
  };
  const longEntryClone = (
    input: LongStructuralCorrespondenceInput,
    changes: (entry: Record<string, unknown>) => Record<string, unknown>,
  ): boolean => {
    const entry = asRecord(input.entry);
    if (!entry) return false;
    mutableLongStructuralInput(input).entry = changes({ ...entry });
    return true;
  };
  const longMutationCases: readonly {
    readonly id: string;
    readonly name: string;
    readonly expectedComparator?: boolean;
    readonly mutate: (input: LongStructuralCorrespondenceInput) => boolean;
  }[] = [
    {
      id: 'B119-LONG-RECORD-FIELD',
      name: 'retained complete-record field',
      mutate: input => {
        const record = longRecordClone(input);
        if (!record) return false;
        record.name = '__retained-record-mutation__';
        return true;
      },
    },
    {
      id: 'B119-LONG-OP-FIELD',
      name: 'retained operation field',
      mutate: input => {
        const operation = longOperationClone(input);
        if (!operation) return false;
        operation.kind = '__operation-field-mutation__';
        return true;
      },
    },
    {
      id: 'B119-LONG-OP-ORDER',
      name: 'retained operation order',
      mutate: input => {
        const operation = longOperationClone(input);
        if (!operation || typeof operation.modelOrder !== 'number') return false;
        operation.modelOrder += 1;
        return true;
      },
    },
    {
      id: 'B119-LONG-OP-SOURCE',
      name: 'retained operation source',
      mutate: input => {
        const operation = longOperationClone(input);
        const source = asRecord(operation?.source);
        const start = asRecord(source?.start);
        if (!operation || !source || !start || typeof start.offset !== 'number') return false;
        operation.source = { ...source, start: { ...start, offset: start.offset + 1 } };
        return true;
      },
    },
    {
      id: 'B119-LONG-KERNEL-STATE',
      name: 'retained kernel state',
      mutate: input => {
        const operation = longOperationClone(input, candidate => {
          const kernel = asRecord(candidate.kernel);
          return kernel !== undefined && ['stateBefore', 'stateAfter'].some(stateKey => {
            const state = asRecord(kernel[stateKey]);
            const rows = Array.isArray(state?.rows) ? state.rows : [];
            return rows.some(row => {
              const rowRecord = asRecord(row);
              return Array.isArray(rowRecord?.cells) && rowRecord.cells.length > 0;
            });
          });
        }, 'afterOperations');
        const kernel = asRecord(operation?.kernel);
        const stateKey = kernel
          ? (['stateBefore', 'stateAfter'] as const).find(candidateStateKey => {
            const state = asRecord(kernel[candidateStateKey]);
            const rows = Array.isArray(state?.rows) ? state.rows : [];
            return rows.some(row => {
              const rowRecord = asRecord(row);
              return Array.isArray(rowRecord?.cells) && rowRecord.cells.length > 0;
            });
          })
          : undefined;
        const stateBefore = stateKey === undefined ? undefined : asRecord(kernel?.[stateKey]);
        const rows = Array.isArray(stateBefore?.rows) ? [...stateBefore.rows] : [];
        const rowIndex = rows.findIndex(rowValue => {
          const rowRecord = asRecord(rowValue);
          return Array.isArray(rowRecord?.cells) && rowRecord.cells.length > 0;
        });
        const row = asRecord(rows[rowIndex]);
        const cells = Array.isArray(row?.cells) ? [...row.cells] : [];
        const originalCell = asRecord(cells[0]);
        const cell = originalCell ? { ...originalCell } : undefined;
        if (!operation || !kernel || stateKey === undefined || !stateBefore || rowIndex < 0 || !row || !cell) return false;
        cell.type = '__kernel-state-mutation__';
        cells[0] = cell;
        rows[rowIndex] = { ...row, cells };
        operation.kernel = { ...kernel, [stateKey]: { ...stateBefore, rows } };
        return true;
      },
    },
    {
      id: 'B119-LONG-OWNER',
      name: 'issued removal owner identity (authority-gated outside comparator)',
      expectedComparator: true,
      mutate: input => longEntryClone(input, entry => {
        const provenance = asRecord(entry.provenance);
        const owner = asRecord(provenance?.owner);
        return provenance && owner
          ? { ...entry, provenance: { ...provenance, owner: { ...owner, ownerId: '__owner-mutation__' } } }
          : entry;
      }),
    },
    {
      id: 'B119-LONG-BINDING',
      name: 'removal binding identity',
      mutate: input => longEntryClone(input, entry => {
        const bindings = Array.isArray(entry.callBindings) ? [...entry.callBindings] : [];
        const binding = asRecord(bindings[0]);
        if (!binding) return entry;
        bindings[0] = { ...binding, operationId: '__operation-binding-mutation__' };
        return { ...entry, callBindings: bindings };
      }),
    },
    {
      id: 'B119-LONG-SPLICE-RANGE',
      name: 'structural splice range',
      mutate: input => longEntryClone(input, entry => ({
        ...entry,
        startOffset: typeof entry.startOffset === 'number' ? entry.startOffset + 1 : entry.startOffset,
      })),
    },
    {
      id: 'B119-LONG-ACCESSOR',
      name: 'accessor payload',
      mutate: input => {
        const record = longRecordClone(input);
        if (!record) return false;
        Object.defineProperty(record, '__structuralAccessor', {
          enumerable: true,
          get: () => 'hostile',
        });
        return true;
      },
    },
    {
      id: 'B119-LONG-CYCLE',
      name: 'cyclic payload',
      mutate: input => {
        const record = longRecordClone(input);
        if (!record) return false;
        record.__structuralCycle = record;
        return true;
      },
    },
    {
      id: 'B119-LONG-NONPLAIN',
      name: 'non-plain payload',
      mutate: input => {
        mutableLongStructuralInput(input).beforeRecords = Object.create(null);
        return true;
      },
    },
    {
      id: 'B119-LONG-OVERSIZED',
      name: 'oversized payload',
      mutate: input => {
        mutableLongStructuralInput(input).beforeOperations = new Array(750_001).fill(null);
        return true;
      },
    },
  ];
  const longMutationRows = longMutationCases.map(item => {
    const input = cloneLongStructuralInput();
    let mutationApplied = false;
    let comparator = false;
    let threw = false;
    try {
      mutationApplied = item.mutate(input);
      comparator = compareX4UiSourceStructuralLedgerCorrespondence(input);
    } catch {
      threw = true;
    }
    return {
      id: item.id,
      name: item.name,
      mutationApplied,
      comparator,
      threw,
      pass: mutationApplied && comparator === (item.expectedComparator ?? false) && !threw,
    };
  });
  causal('B119-LONG-MUTATION-MATRIX', 'long structural correspondence rejects retained ledger, binding, range, and hostile-input mutations while owner identity remains authority-gated', () => ({
    pass: realSourceLongPartialComparator && longMutationRows.every(row => row.pass),
    detail: { baseline: realSourceLongPartialComparator, rows: longMutationRows },
  }));
  const longParentWorkspaceBytes = workspaceBytes(realSourceLongPartialContext.workspace);
  const longParentSourceText = realSourceLongPartialBeforeText;
  const longMutatedOwnerEntry = structuredClone(realSourceLongPartialEntry) as X4UiSourceEditDeleteEntry;
  const longMutatedOwnerProvenance = asRecord((longMutatedOwnerEntry as unknown as Record<string, unknown>).provenance);
  const longMutatedOwner = asRecord(longMutatedOwnerProvenance?.owner);
  if (!longMutatedOwnerProvenance || !longMutatedOwner) throw new Error('long owner mutation fixture missing issued owner');
  (longMutatedOwnerEntry as unknown as Record<string, unknown>).provenance = {
    ...longMutatedOwnerProvenance,
    owner: { ...longMutatedOwner, ownerId: '__owner-apply-mutation__' },
  };
  const longMutatedOwnerCatalog = catalogWithEntry(
    realSourceLongPartialCatalog,
    realSourceLongPartialEntry.id,
    longMutatedOwnerEntry as unknown as X4UiEditableSourceEditEntry,
  );
  const longMutatedOwnerApply = structuralApply(
    realSourceLongPartialContext,
    longMutatedOwnerCatalog,
    longMutatedOwnerEntry,
  );
  const longAcceptedPair = {
    workspace: realSourceLongPartialResult.workspace,
    source: realSourceLongPartialResult.source,
  };
  const longWrongStart = structuralApply(
    realSourceLongPartialContext,
    realSourceLongPartialCatalog,
    realSourceLongPartialEntry,
    undefined,
    { startOffset: realSourceLongPartialEntry.startOffset + 1 },
  );
  const longWrongEnd = structuralApply(
    realSourceLongPartialContext,
    realSourceLongPartialCatalog,
    realSourceLongPartialEntry,
    undefined,
    { endOffset: realSourceLongPartialEntry.endOffset + 1 },
  );
  const longWrongText = structuralApply(
    realSourceLongPartialContext,
    realSourceLongPartialCatalog,
    realSourceLongPartialEntry,
    undefined,
    { expectedText: '__stale-structural-text__' },
  );
  const longStaleEntry = structuralApply(
    longAcceptedPair,
    realSourceLongPartialCatalog,
    realSourceLongPartialEntry,
  );
  causal('B119-LONG-APPLY-MATRIX', 'long structural apply refuses stale pairs and altered splice expectations without mutation', () => ({
    pass: realSourceLongPartialResult.accepted === true
      && realSourceLongPartialResult.workspace !== realSourceLongPartialContext.workspace
      && realSourceLongPartialResult.source !== realSourceLongPartialContext.source
      && realSourceLongPartialResult.catalog !== realSourceLongPartialCatalog
      && workspaceBytes(realSourceLongPartialContext.workspace) === longParentWorkspaceBytes
      && sourceText(realSourceLongPartialContext) === longParentSourceText
      && [
        structuralRefusalPreservesInput(longWrongStart, realSourceLongPartialContext, realSourceLongPartialCatalog, longParentWorkspaceBytes, longParentSourceText),
        structuralRefusalPreservesInput(longWrongEnd, realSourceLongPartialContext, realSourceLongPartialCatalog, longParentWorkspaceBytes, longParentSourceText),
        structuralRefusalPreservesInput(longWrongText, realSourceLongPartialContext, realSourceLongPartialCatalog, longParentWorkspaceBytes, longParentSourceText),
        structuralRefusalPreservesInput(longMutatedOwnerApply, realSourceLongPartialContext, longMutatedOwnerCatalog, longParentWorkspaceBytes, longParentSourceText),
        structuralRefusalPreservesInput(longStaleEntry, longAcceptedPair, realSourceLongPartialCatalog, workspaceBytes(longAcceptedPair.workspace), sourceText(longAcceptedPair)),
      ].every(Boolean),
    detail: {
      wrongStart: { reason: structuralResultReason(longWrongStart), detail: structuralResultDetail(longWrongStart) },
      wrongEnd: { reason: structuralResultReason(longWrongEnd), detail: structuralResultDetail(longWrongEnd) },
      wrongText: { reason: structuralResultReason(longWrongText), detail: structuralResultDetail(longWrongText) },
      ownerMutation: { reason: structuralResultReason(longMutatedOwnerApply), detail: structuralResultDetail(longMutatedOwnerApply) },
      stale: { reason: structuralResultReason(longStaleEntry), detail: structuralResultDetail(longStaleEntry) },
    },
  }));
  const roundFourParserPathMutation = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(roundFourParserPathMutation);
    const record = asRecord(value);
    if (!record) return false;
    if (typeof record.path === 'string'
      && typeof record.kind === 'string'
      && typeof record.origin === 'string'
      && asRecord(record.source) !== undefined) {
      record.path = `${record.path}:mutated`;
      return true;
    }
    return Object.values(record).some(roundFourParserPathMutation);
  };
  type RoundFourMutation = (operations: Record<string, unknown>[]) => boolean;
  const roundFourMutationCases: readonly { readonly id: string; readonly name: string; readonly mutate: RoundFourMutation }[] = [
    {
      id: 'D-N1',
      name: 'operation metadata',
      mutate: operations => {
        const operation = operations.find(candidate => asRecord(candidate.metadata) !== undefined);
        if (!operation) return false;
        operation.metadata = { ...(asRecord(operation.metadata) || {}), __roundFourMutation: true };
        return true;
      },
    },
    {
      id: 'D-N2',
      name: 'kernel stateBefore',
      mutate: operations => {
        const operation = operations.find(candidate => asRecord(candidate.kernel)?.stateBefore !== undefined);
        const kernel = operation ? asRecord(operation.kernel) : undefined;
        if (!kernel) return false;
        kernel.stateBefore = { __roundFourMutation: true };
        return true;
      },
    },
    {
      id: 'D-N3',
      name: 'kernel stateAfter',
      mutate: operations => {
        const operation = operations.find(candidate => asRecord(candidate.kernel)?.stateAfter !== undefined);
        const kernel = operation ? asRecord(operation.kernel) : undefined;
        if (!kernel) return false;
        kernel.stateAfter = { __roundFourMutation: true };
        return true;
      },
    },
    {
      id: 'D-N4',
      name: 'singular and plural row/cell/parent/related/local/call identity fields',
      mutate: operations => {
        const operation = operations[0];
        if (!operation) return false;
        Object.assign(operation, {
          rowId: '@row:mutated',
          rowIds: ['@row:mutated'],
          cellId: '@cell:mutated',
          cellIds: ['@cell:mutated'],
          parentPath: 'parent-mutated',
          parentPaths: ['parent-mutated'],
          relatedPath: 'related-mutated',
          relatedPaths: ['related-mutated'],
          localInvocation: 'local-mutated',
          localInvocationId: 'local-id-mutated',
          localInvocations: ['local-list-mutated'],
          localInvocationIds: ['local-list-id-mutated'],
          localInvocationResult: 'local-result-mutated',
          localInvocationResults: ['local-result-mutated'],
          callLocation: '|call|mutated',
          callLocationId: 'call-id-mutated',
          callLocations: ['call-list-mutated'],
          callLocationIds: ['call-list-id-mutated'],
          callLocationResult: '|call|result-mutated',
          callLocationResults: ['|call|result-mutated'],
        });
        return true;
      },
    },
    {
      id: 'D-N5',
      name: 'parser-owned reference paths',
      mutate: operations => operations.some(operation => roundFourParserPathMutation(operation.metadata)),
    },
    {
      id: 'D-N6',
      name: 'operation and call identifiers',
      mutate: operations => {
        const operation = operations[0];
        if (!operation) return false;
        Object.assign(operation, {
          id: 'operation-mutated',
          callId: 'call-mutated',
          operationId: 'operation-id-mutated',
        });
        return true;
      },
    },
    {
      id: 'D-N7',
      name: 'order/modelOrder/callOrder/sourceOrder/streamIndex families',
      mutate: operations => {
        const operation = operations[0];
        if (!operation) return false;
        Object.assign(operation, {
          order: 999,
          modelOrder: 999,
          callOrder: 999,
          sourceOrder: 999,
          streamIndex: 999,
        });
        return true;
      },
    },
  ];
  for (const item of roundFourMutationCases) {
    roundFour(item.id, 'D', `${item.name} mutation turns the full oracle red`, () => {
      const mutatedAfterOperations = structuredClone(roundFourMutationAfterProjection?.program.operations || []) as unknown as Record<string, unknown>[];
      const mutated = item.mutate(mutatedAfterOperations);
      const comparison = roundFourFullLedgerCompare(
        roundFourMutationBeforeCalls,
        roundFourMutationAfterCalls,
        roundFourMutationBeforeOperations,
        mutatedAfterOperations,
        roundFourMutationEntry,
        roundFourMutationSplice,
      );
      return {
        pass: roundFourMutationBaseline.pass && mutated && !comparison.pass,
        detail: {
          productionAccepted: roundFourMutationResult.accepted,
          baseline: roundFourMutationBaseline,
          mutationApplied: mutated,
          comparison,
        },
      };
    });
  }

  interface RoundFiveCorrespondenceInput {
    readonly beforeCalls: readonly unknown[];
    readonly afterCalls: readonly unknown[];
    readonly beforeRecords: readonly unknown[];
    readonly afterRecords: readonly unknown[];
    readonly beforeOperations: readonly unknown[];
    readonly afterOperations: readonly unknown[];
    readonly entry: X4UiSourceEditStructuralEntry;
    readonly beforeText: string;
    readonly afterText: string;
    readonly replacementLength: number;
    readonly insertedCallIndex: number;
    readonly insertedOperationIndex: number;
  }
  type RoundFiveCorrespondenceOwner = (input: RoundFiveCorrespondenceInput) => boolean;
  const roundFiveCorrespondenceOwner: RoundFiveCorrespondenceOwner =
    compareX4UiSourceStructuralLedgerCorrespondence;
  interface RoundFiveMatrixRow {
    readonly id: string;
    readonly name: string;
    readonly pass: boolean;
    readonly detail: string;
  }
  const roundFiveRows: RoundFiveMatrixRow[] = [];
  const roundFive = (
    id: string,
    name: string,
    probe: () => { readonly pass: boolean; readonly detail?: unknown },
  ): void => {
    try {
      const result = probe();
      roundFiveRows.push({ id, name, pass: result.pass, detail: causalDetail(result.detail) });
    } catch (error) {
      roundFiveRows.push({
        id,
        name,
        pass: false,
        detail: causalDetail({ threw: true, error: error instanceof Error ? error.message : String(error) }),
      });
    }
  };
  const roundFiveDeletionInput: RoundFiveCorrespondenceInput = {
    beforeCalls: roundFourMutationBeforeCalls,
    afterCalls: roundFourMutationAfterCalls,
    beforeRecords: roundFourMutationContext.source.bundle?.sourceFiles
      .find(file => file.path === roundFourMutationEntry.path)?.callModel.records || [],
    afterRecords: roundFourMutationResult.accepted
      ? roundFourMutationResult.source.bundle?.sourceFiles
        .find(file => file.path === roundFourMutationEntry.path)?.callModel.records || []
      : [],
    beforeOperations: roundFourMutationBeforeOperations,
    afterOperations: roundFourMutationAfterProjection?.program.operations || [],
    entry: roundFourMutationEntry,
    beforeText: roundFourMutationBeforeText,
    afterText: roundFourMutationResult.accepted ? sourceText(roundFourMutationResult) : '',
    replacementLength: roundFourMutationResult.accepted ? roundFourMutationResult.replacement.length : 0,
    insertedCallIndex: -1,
    insertedOperationIndex: -1,
  };
  const roundFiveInsertionContext = contextFor(inlineFluentLua);
  const roundFiveInsertionCatalog = catalogFor(roundFiveInsertionContext);
  const roundFiveInsertionEntry = structuralInsert(roundFiveInsertionCatalog, 'first-row');
  const roundFiveInsertionBeforeProjection = projectedProgramFor(roundFiveInsertionContext.source);
  const roundFiveInsertionResult = structuralApply(
    roundFiveInsertionContext,
    roundFiveInsertionCatalog,
    roundFiveInsertionEntry,
    firstRowPayload,
  );
  const roundFiveInsertionAfterProjection = roundFiveInsertionResult.accepted
    ? projectedProgramFor(roundFiveInsertionResult.source)
    : undefined;
  const roundFiveInsertionAfterCalls = roundFiveInsertionResult.accepted
    ? roundFiveInsertionResult.source.bundle?.sourceFiles
      .find(file => file.path === roundFiveInsertionEntry.path)?.callModel.calls || []
    : [];
  const roundFiveInsertedStart = roundFiveInsertionEntry.startOffset + roundFiveInsertionEntry.indentation.length;
  const roundFiveInsertedEnd = roundFiveInsertionEntry.startOffset
    + (roundFiveInsertionResult.accepted ? roundFiveInsertionResult.replacement.length : 0);
  const roundFiveInsertedCallIndex = roundFiveInsertionAfterCalls.findIndex(call =>
    call.name === 'addRow'
    && call.source.start.offset >= roundFiveInsertedStart
    && call.source.end.offset <= roundFiveInsertedEnd);
  const roundFiveInsertedOperationIndex = roundFiveInsertionAfterProjection?.program.operations.findIndex(operation =>
    operation.kind === 'addRow'
    && operation.source.start.offset >= roundFiveInsertedStart
    && operation.source.end.offset <= roundFiveInsertedEnd) ?? -1;
  const roundFiveInsertionInput: RoundFiveCorrespondenceInput = {
    beforeCalls: roundFiveInsertionContext.source.bundle?.sourceFiles
      .find(file => file.path === roundFiveInsertionEntry.path)?.callModel.calls || [],
    afterCalls: roundFiveInsertionAfterCalls,
    beforeRecords: roundFiveInsertionContext.source.bundle?.sourceFiles
      .find(file => file.path === roundFiveInsertionEntry.path)?.callModel.records || [],
    afterRecords: roundFiveInsertionResult.accepted
      ? roundFiveInsertionResult.source.bundle?.sourceFiles
        .find(file => file.path === roundFiveInsertionEntry.path)?.callModel.records || []
      : [],
    beforeOperations: roundFiveInsertionBeforeProjection?.program.operations || [],
    afterOperations: roundFiveInsertionAfterProjection?.program.operations || [],
    entry: roundFiveInsertionEntry,
    beforeText: sourceText(roundFiveInsertionContext),
    afterText: roundFiveInsertionResult.accepted ? sourceText(roundFiveInsertionResult) : '',
    replacementLength: roundFiveInsertionResult.accepted ? roundFiveInsertionResult.replacement.length : 0,
    insertedCallIndex: roundFiveInsertedCallIndex,
    insertedOperationIndex: roundFiveInsertedOperationIndex,
  };
  const roundFiveInputs = [roundFiveDeletionInput, roundFiveInsertionInput] as const;
  const roundFiveCompare = (input: RoundFiveCorrespondenceInput): boolean =>
    roundFiveCorrespondenceOwner(input) === true;
  const roundFiveCloneInput = (input: RoundFiveCorrespondenceInput): RoundFiveCorrespondenceInput => ({
    ...input,
    beforeCalls: structuredClone(input.beforeCalls),
    afterCalls: structuredClone(input.afterCalls),
    beforeRecords: structuredClone(input.beforeRecords),
    afterRecords: structuredClone(input.afterRecords),
    beforeOperations: structuredClone(input.beforeOperations),
    afterOperations: structuredClone(input.afterOperations),
  });
  const roundFiveMutatedValue = (value: unknown): { readonly applied: boolean; readonly value: unknown } => {
    if (typeof value === 'string') return { applied: true, value: `${value}:round-five-drift` };
    if (typeof value === 'number' && Number.isFinite(value)) return { applied: true, value: value + 1 };
    if (typeof value === 'boolean') return { applied: true, value: !value };
    if (Array.isArray(value) && value.length > 0) {
      const first = roundFiveMutatedValue(value[0]);
      return first.applied ? { applied: true, value: [first.value, ...value.slice(1)] } : { applied: false, value };
    }
    const record = asRecord(value);
    return record
      ? { applied: true, value: { ...record, __roundFiveDrift: true } }
      : { applied: false, value };
  };
  const roundFiveMutateOwnField = (
    value: unknown,
    field: string,
    path = '$',
    seen = new Set<object>(),
  ): { readonly applied: boolean; readonly path?: string } => {
    if (value === null || typeof value !== 'object' || seen.has(value)) return { applied: false };
    seen.add(value);
    const record = value as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(record, field)) {
      const mutation = roundFiveMutatedValue(record[field]);
      if (mutation.applied) {
        record[field] = mutation.value;
        return { applied: true, path: `${path}.${field}` };
      }
    }
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const result = roundFiveMutateOwnField(value[index], field, `${path}[${index}]`, seen);
        if (result.applied) return result;
      }
      return { applied: false };
    }
    for (const [key, child] of Object.entries(record)) {
      const result = roundFiveMutateOwnField(child, field, `${path}.${key}`, seen);
      if (result.applied) return result;
    }
    return { applied: false };
  };
  const roundFiveHasOwnField = (value: unknown, field: string, seen = new Set<object>()): boolean => {
    if (value === null || typeof value !== 'object' || seen.has(value)) return false;
    seen.add(value);
    if (Object.prototype.hasOwnProperty.call(value, field)) return true;
    return (Array.isArray(value) ? value : Object.values(value as Record<string, unknown>))
      .some(child => roundFiveHasOwnField(child, field, seen));
  };
  const roundFiveLineColumnAt = (text: string, offset: number): { readonly line: number; readonly column: number } => {
    let line = 1;
    let lineStart = 0;
    for (let index = 0; index < offset; index += 1) {
      if (text[index] === '\n') {
        line += 1;
        lineStart = index + 1;
      }
    }
    return { line, column: offset - lineStart };
  };
  const roundFiveIsLocation = (value: unknown): value is Record<string, unknown> => {
    const record = asRecord(value);
    const start = asRecord(record?.start);
    const end = asRecord(record?.end);
    return typeof record?.file === 'string'
      && typeof start?.line === 'number'
      && typeof start.column === 'number'
      && typeof start.offset === 'number'
      && typeof end?.line === 'number'
      && typeof end.column === 'number'
      && typeof end.offset === 'number';
  };
  type RoundFiveLocationPredicate = (
    path: string,
    key: string,
    parent: Record<string, unknown> | undefined,
  ) => boolean;
  const roundFiveMutateLocation = (
    value: unknown,
    text: string,
    predicate: RoundFiveLocationPredicate,
    mode: 'coherent' | 'malformed',
    path = '$',
    key = '',
    parent?: Record<string, unknown>,
    seen = new Set<object>(),
  ): { readonly applied: boolean; readonly path?: string } => {
    if (value === null || typeof value !== 'object' || seen.has(value)) return { applied: false };
    if (roundFiveIsLocation(value) && predicate(path, key, parent)) {
      const start = asRecord(value.start)!;
      const end = asRecord(value.end)!;
      if (mode === 'malformed') {
        start.line = Number(start.line) + 1;
        return { applied: true, path };
      }
      const direction = Number(end.offset) < text.length ? 1 : Number(start.offset) > 0 ? -1 : 0;
      if (direction === 0) return { applied: false };
      const startOffset = Number(start.offset) + direction;
      const endOffset = Number(end.offset) + direction;
      Object.assign(start, roundFiveLineColumnAt(text, startOffset), { offset: startOffset });
      Object.assign(end, roundFiveLineColumnAt(text, endOffset), { offset: endOffset });
      return { applied: true, path };
    }
    if (roundFiveIsLocation(value)) return { applied: false };
    seen.add(value);
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const result = roundFiveMutateLocation(value[index], text, predicate, mode, `${path}[${index}]`, String(index), undefined, seen);
        if (result.applied) return result;
      }
      return { applied: false };
    }
    const record = value as Record<string, unknown>;
    for (const [childKey, child] of Object.entries(record)) {
      const result = roundFiveMutateLocation(child, text, predicate, mode, `${path}.${childKey}`, childKey, record, seen);
      if (result.applied) return result;
    }
    return { applied: false };
  };
  const roundFiveMutationRow = (
    id: string,
    name: string,
    scope: 'calls' | 'operations',
    mutate: (value: unknown, input: RoundFiveCorrespondenceInput) => { readonly applied: boolean; readonly path?: string },
  ): void => {
    roundFive(id, name, () => {
      const sourceInput = roundFiveInputs.find(input => {
        const clone = roundFiveCloneInput(input);
        const target = scope === 'calls' ? clone.afterCalls : clone.afterOperations;
        return mutate(target, clone).applied;
      }) || roundFiveDeletionInput;
      const baseline = roundFiveCompare(sourceInput);
      const mutatedInput = roundFiveCloneInput(sourceInput);
      const mutation = mutate(scope === 'calls' ? mutatedInput.afterCalls : mutatedInput.afterOperations, mutatedInput);
      const mutatedVerdict = mutation.applied ? roundFiveCompare(mutatedInput) : true;
      return {
        pass: baseline && mutation.applied && !mutatedVerdict,
        detail: {
          productionOwnerPresent: roundFiveCorrespondenceOwner !== undefined,
          baseline,
          mutationApplied: mutation.applied,
          mutationPath: mutation.path,
          mutatedVerdict,
          sourceEdit: sourceInput.entry.kind,
        },
      };
    });
  };
  roundFive('D5-P1', 'production correspondence owner accepts the exact deletion delta', () => ({
    pass: roundFourMutationResult.accepted === true && roundFiveCompare(roundFiveDeletionInput),
    detail: {
      productionOwnerPresent: roundFiveCorrespondenceOwner !== undefined,
      accepted: roundFourMutationResult.accepted,
      correspondence: roundFiveCompare(roundFiveDeletionInput),
    },
  }));
  roundFive('D5-P2', 'production correspondence owner accepts exactly one inserted call and operation', () => ({
    pass: roundFiveInsertionResult.accepted === true
      && roundFiveInsertionAfterCalls.length === roundFiveInsertionInput.beforeCalls.length + 1
      && roundFiveInsertionInput.afterOperations.length === roundFiveInsertionInput.beforeOperations.length + 1
      && roundFiveInsertedCallIndex >= 0
      && roundFiveInsertedOperationIndex >= 0
      && roundFiveCompare(roundFiveInsertionInput),
    detail: {
      productionOwnerPresent: roundFiveCorrespondenceOwner !== undefined,
      accepted: roundFiveInsertionResult.accepted,
      beforeCalls: roundFiveInsertionInput.beforeCalls.length,
      afterCalls: roundFiveInsertionAfterCalls.length,
      beforeOperations: roundFiveInsertionInput.beforeOperations.length,
      afterOperations: roundFiveInsertionInput.afterOperations.length,
      insertedCallIndex: roundFiveInsertedCallIndex,
      insertedOperationIndex: roundFiveInsertedOperationIndex,
      correspondence: roundFiveCompare(roundFiveInsertionInput),
    },
  }));
  const roundFiveIdentityFields = [
    'rowId', 'rowIds', 'cellId', 'cellIds', 'parentPath', 'parentPaths', 'relatedPath', 'relatedPaths',
    'localInvocation', 'localInvocations', 'localInvocationId', 'localInvocationIds',
    'localInvocationResult', 'localInvocationResults', 'callLocation', 'callLocations',
    'callLocationId', 'callLocationIds', 'callLocationResult', 'callLocationResults',
  ] as const;
  const roundFiveLedgerIdFields = ['id', 'callId', 'operationId', 'frameId', 'tableId', 'ownerId', 'targetId'] as const;
  const roundFiveOrderFields = ['order', 'modelOrder', 'callOrder', 'sourceOrder', 'streamIndex'] as const;
  for (const [family, fields] of [
    ['identity', roundFiveIdentityFields],
    ['ledger-id', roundFiveLedgerIdFields],
    ['order', roundFiveOrderFields],
  ] as const) {
    for (const scope of ['calls', 'operations'] as const) {
      for (const field of fields) {
        const present = roundFiveInputs.some(input => roundFiveHasOwnField(
          scope === 'calls' ? input.afterCalls : input.afterOperations,
          field,
        ));
        if (!present) continue;
        roundFiveMutationRow(
          `D5-${scope === 'calls' ? 'C' : 'O'}-${family}-${field}`,
          `${scope} ${field} changes independently`,
          scope,
          value => roundFiveMutateOwnField(value, field),
        );
      }
    }
  }
  const roundFiveSchemaPair = (
    input: RoundFiveCorrespondenceInput,
    scope: 'calls' | 'operations',
  ): {
    readonly beforeIndex: number;
    readonly afterIndex: number;
    readonly beforeRecord: Record<string, unknown>;
    readonly afterRecord: Record<string, unknown>;
    readonly beforeOffset: number;
    readonly afterOffset: number;
    readonly beforeEndOffset: number;
    readonly afterEndOffset: number;
    readonly orderShift: number;
  } | undefined => {
    const beforeValues = scope === 'calls' ? input.beforeCalls : input.beforeOperations;
    const afterValues = scope === 'calls' ? input.afterCalls : input.afterOperations;
    const removedCallOrders = input.entry.kind === 'delete-statement'
      ? new Set(input.entry.callBindings.map(binding => binding.callOrder))
      : new Set<number>();
    const removedOperationIds = input.entry.kind === 'delete-statement'
      ? new Set(input.entry.callBindings.map(binding => binding.operationId))
      : new Set<string>();
    const beforeIndex = [...beforeValues].map((value, index) => ({ value, index })).reverse().find(({ value }) => {
      const record = asRecord(value);
      return scope === 'calls'
        ? typeof record?.order !== 'number' || !removedCallOrders.has(record.order)
        : typeof record?.id !== 'string' || !removedOperationIds.has(record.id);
    })?.index ?? -1;
    const afterIndex = afterValues.length - 1;
    const beforeRecord = asRecord(beforeValues[beforeIndex]);
    const afterRecord = asRecord(afterValues[afterIndex]);
    const beforeSource = asRecord(beforeRecord?.source);
    const afterSource = asRecord(afterRecord?.source);
    const beforeStart = asRecord(beforeSource?.start);
    const beforeEnd = asRecord(beforeSource?.end);
    const afterStart = asRecord(afterSource?.start);
    const afterEnd = asRecord(afterSource?.end);
    if (!beforeRecord || !afterRecord
      || typeof beforeStart?.offset !== 'number'
      || typeof beforeEnd?.offset !== 'number'
      || typeof afterStart?.offset !== 'number'
      || typeof afterEnd?.offset !== 'number') return undefined;
    const beforeOffset = beforeStart.offset;
    const removedBefore = input.entry.kind === 'delete-statement'
      ? input.entry.callBindings.filter(binding => binding.callSource.start.offset < beforeOffset).length
      : 0;
    const insertedBefore = input.entry.kind === 'insert-call' && beforeOffset >= input.entry.startOffset ? 1 : 0;
    return {
      beforeIndex,
      afterIndex,
      beforeRecord,
      afterRecord,
      beforeOffset,
      afterOffset: afterStart.offset,
      beforeEndOffset: beforeEnd.offset,
      afterEndOffset: afterEnd.offset,
      orderShift: insertedBefore - removedBefore,
    };
  };
  interface RoundFiveProducerField {
    readonly holder: Record<string, unknown>;
    readonly path: string;
  }
  const roundFiveCallRootFields = new Set(['order', 'sourceOrder']);
  const roundFiveOperationRootFields = new Set([
    'id', 'modelOrder', 'sourceOrder', 'frameId', 'tableId', 'rowId', 'cellId',
  ]);
  const roundFiveFindNestedProducerField = (
    value: unknown,
    field: string,
    path: string,
    seen = new Set<object>(),
  ): RoundFiveProducerField | undefined => {
    if (value === null || typeof value !== 'object' || seen.has(value)) return undefined;
    seen.add(value);
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const found = roundFiveFindNestedProducerField(value[index], field, `${path}[${index}]`, seen);
        if (found) return found;
      }
      return undefined;
    }
    const record = value as Record<string, unknown>;
    const parserReference = typeof record.kind === 'string'
      && typeof record.origin === 'string'
      && roundFiveIsLocation(record.source);
    const parserProperty = typeof record.sourceOrder === 'number'
      && roundFiveIsLocation(record.source)
      && Object.prototype.hasOwnProperty.call(record, 'value');
    if (((parserReference && roundFiveIdentityFields.includes(field as typeof roundFiveIdentityFields[number]))
        || (parserProperty && field === 'sourceOrder'))
      && Object.prototype.hasOwnProperty.call(record, field)
      && roundFiveMutatedValue(record[field]).applied) {
      return { holder: record, path: `${path}.${field}` };
    }
    for (const [childKey, child] of Object.entries(record)) {
      const found = roundFiveFindNestedProducerField(child, field, `${path}.${childKey}`, seen);
      if (found) return found;
    }
    return undefined;
  };
  const roundFiveFindProducerField = (
    values: readonly unknown[],
    scope: 'calls' | 'operations',
    field: string,
  ): RoundFiveProducerField | undefined => {
    const rootFields = scope === 'calls' ? roundFiveCallRootFields : roundFiveOperationRootFields;
    for (let index = 0; index < values.length; index += 1) {
      const record = asRecord(values[index]);
      if (!record) continue;
      if (rootFields.has(field) && Object.prototype.hasOwnProperty.call(record, field)) {
        return { holder: record, path: `$[${index}].${field}` };
      }
      const roots = scope === 'calls'
        ? [record.arguments, record.receiver, record.semantics, record.result, record.context]
        : [record.metadata, record.descriptorFacts];
      for (let rootIndex = 0; rootIndex < roots.length; rootIndex += 1) {
        const found = roundFiveFindNestedProducerField(roots[rootIndex], field, `$[${index}].producer[${rootIndex}]`);
        if (found) return found;
      }
    }
    return undefined;
  };
  const roundFiveSchemaMutationRow = (
    scope: 'calls' | 'operations',
    family: string,
    field: string,
  ): void => {
    roundFive(`D5-${scope === 'calls' ? 'C' : 'O'}-schema-${family}-${field}`, `${scope} genuine producer schema ${field} changes independently or is explicitly absent`, () => {
      const sourceInput = roundFiveInputs.find(input => {
        const beforeValues = scope === 'calls' ? input.beforeCalls : input.beforeOperations;
        const afterValues = scope === 'calls' ? input.afterCalls : input.afterOperations;
        return roundFiveFindProducerField(beforeValues, scope, field) !== undefined
          && roundFiveFindProducerField(afterValues, scope, field) !== undefined;
      });
      if (!sourceInput) {
        const absent = roundFiveInputs.every(input => {
          const beforeValues = scope === 'calls' ? input.beforeCalls : input.beforeOperations;
          const afterValues = scope === 'calls' ? input.afterCalls : input.afterOperations;
          return roundFiveFindProducerField(beforeValues, scope, field) === undefined
            && roundFiveFindProducerField(afterValues, scope, field) === undefined;
        });
        return {
          pass: absent,
          detail: {
            productionOwnerPresent: roundFiveCorrespondenceOwner !== undefined,
            schemaClassification: 'absent-from-authoritative-fixtures',
            field,
            scope,
          },
        };
      }
      const baseline = roundFiveCompare(sourceInput);
      const mutatedInput = roundFiveCloneInput(sourceInput);
      const afterValues = scope === 'calls' ? mutatedInput.afterCalls : mutatedInput.afterOperations;
      const producer = roundFiveFindProducerField(afterValues, scope, field);
      const mutation = producer ? roundFiveMutatedValue(producer.holder[field]) : { applied: false, value: undefined };
      if (producer && mutation.applied) producer.holder[field] = mutation.value;
      const mutatedVerdict = producer && mutation.applied ? roundFiveCompare(mutatedInput) : true;
      return {
        pass: baseline && mutation.applied && !mutatedVerdict,
        detail: {
          productionOwnerPresent: roundFiveCorrespondenceOwner !== undefined,
          schemaClassification: 'genuine-producer-field',
          baseline,
          mutationApplied: mutation.applied,
          mutationPath: producer?.path,
          mutatedVerdict,
        },
      };
    });
  };
  for (const scope of ['calls', 'operations'] as const) {
    for (const field of roundFiveIdentityFields) roundFiveSchemaMutationRow(scope, 'identity', field);
    for (const field of roundFiveLedgerIdFields) roundFiveSchemaMutationRow(scope, 'ledger-id', field);
    for (const field of roundFiveOrderFields) roundFiveSchemaMutationRow(scope, 'order', field);
  }
  roundFiveMutationRow('D5-O-metadata', 'operation metadata changes independently', 'operations', value =>
    roundFiveMutateOwnField(value, 'metadata'));
  roundFiveMutationRow('D5-O-kernel-envelope', 'operation kernel envelope changes independently', 'operations', value =>
    roundFiveMutateOwnField(value, 'kernel'));
  roundFiveMutationRow('D5-O-stateBefore', 'operation stateBefore changes independently', 'operations', value =>
    roundFiveMutateOwnField(value, 'stateBefore'));
  roundFiveMutationRow('D5-O-stateAfter', 'operation stateAfter changes independently', 'operations', value =>
    roundFiveMutateOwnField(value, 'stateAfter'));
  const roundFiveLocationRows = [
    { id: 'D5-C-top-source', name: 'call top-level source coherent drift', scope: 'calls' as const, predicate: (path: string) => /^\$\[\d+\]\.source$/.test(path), mode: 'coherent' as const },
    { id: 'D5-O-top-source', name: 'operation top-level source coherent drift', scope: 'operations' as const, predicate: (path: string) => /^\$\[\d+\]\.source$/.test(path), mode: 'coherent' as const },
    { id: 'D5-C-enclosing-source', name: 'call enclosingStatement.source coherent drift', scope: 'calls' as const, predicate: (path: string) => path.endsWith('.enclosingStatement.source'), mode: 'coherent' as const },
    { id: 'D5-C-deletionSource', name: 'call enclosingStatement.deletionSource coherent drift', scope: 'calls' as const, predicate: (path: string) => path.endsWith('.enclosingStatement.deletionSource'), mode: 'coherent' as const },
    { id: 'D5-C-sourceLiteral', name: 'call nested sourceLiteral coherent drift', scope: 'calls' as const, predicate: (_path: string, key: string) => key === 'sourceLiteral', mode: 'coherent' as const },
    { id: 'D5-C-location', name: 'call nested location coherent drift', scope: 'calls' as const, predicate: (_path: string, key: string) => key === 'location', mode: 'coherent' as const },
    { id: 'D5-O-nested-source', name: 'operation nested source coherent drift', scope: 'operations' as const, predicate: (path: string, key: string) => key === 'source' && !/^\$\[\d+\]\.source$/.test(path), mode: 'coherent' as const },
    { id: 'D5-O-malformed-location', name: 'operation nested location malformed line drift', scope: 'operations' as const, predicate: (path: string) => !/^\$\[\d+\]\.source$/.test(path), mode: 'malformed' as const },
  ] as const;
  for (const item of roundFiveLocationRows) {
    roundFiveMutationRow(item.id, item.name, item.scope, (value, input) =>
      roundFiveMutateLocation(value, input.afterText, item.predicate, item.mode));
  }
  const roundFiveParserRecordMutation = (
    value: unknown,
    family: 'path' | 'source',
    text: string,
    path = '$',
    seen = new Set<object>(),
  ): { readonly applied: boolean; readonly path?: string } => {
    if (value === null || typeof value !== 'object' || seen.has(value)) return { applied: false };
    seen.add(value);
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const result = roundFiveParserRecordMutation(value[index], family, text, `${path}[${index}]`, seen);
        if (result.applied) return result;
      }
      return { applied: false };
    }
    const record = value as Record<string, unknown>;
    for (const childKey of ['reference', 'result']) {
      const parserRecord = asRecord(record[childKey]);
      if (!parserRecord
        || typeof parserRecord.kind !== 'string'
        || typeof parserRecord.origin !== 'string'
        || !roundFiveIsLocation(parserRecord.source)) continue;
      if (family === 'path' && typeof parserRecord.path === 'string') {
        parserRecord.path = `${parserRecord.path}:round-five-drift`;
        return { applied: true, path: `${path}.${childKey}.path` };
      }
      if (family === 'source') {
        return roundFiveMutateLocation(
          parserRecord.source,
          text,
          () => true,
          'coherent',
          `${path}.${childKey}.source`,
          'source',
          parserRecord,
        );
      }
    }
    for (const [childKey, child] of Object.entries(record)) {
      const result = roundFiveParserRecordMutation(child, family, text, `${path}.${childKey}`, seen);
      if (result.applied) return result;
    }
    return { applied: false };
  };
  for (const scope of ['calls', 'operations'] as const) {
    for (const family of ['path', 'source'] as const) {
      roundFiveMutationRow(
        `D5-${scope === 'calls' ? 'C' : 'O'}-parser-${family}`,
        `${scope} parser-owned reference/result ${family} changes independently`,
        scope,
        (value, input) => roundFiveParserRecordMutation(value, family, input.afterText),
      );
    }
  }

  interface RoundSixMatrixRow {
    readonly id: string;
    readonly family: 'F1' | 'F2' | 'F3';
    readonly name: string;
    readonly pass: boolean;
    readonly detail: string;
  }
  const roundSixRows: RoundSixMatrixRow[] = [];
  const roundSix = (
    id: string,
    family: RoundSixMatrixRow['family'],
    name: string,
    probe: () => { readonly pass: boolean; readonly detail?: unknown },
  ): void => {
    try {
      const result = probe();
      roundSixRows.push({ id, family, name, pass: result.pass, detail: causalDetail(result.detail) });
    } catch (error) {
      roundSixRows.push({
        id,
        family,
        name,
        pass: false,
        detail: causalDetail({ threw: true, error: error instanceof Error ? error.message : String(error) }),
      });
    }
  };
  const roundSixLookalikeContainers = [
    'arbitraryMetadata',
    'descriptorFactsLookalike',
    'semanticsLookalike',
    'userTableValue',
    'unknownNestedRecord',
  ] as const;
  const roundSixLookalikeFields = [
    ...roundFiveOrderFields,
    ...roundFiveLedgerIdFields,
    ...roundFiveIdentityFields,
  ] as const;
  interface RoundSixDescriptorFactPair {
    readonly beforeFacts: Record<string, unknown>;
    readonly afterFacts: Record<string, unknown>;
    readonly beforeTemplate: Record<string, unknown>;
    readonly afterTemplate: Record<string, unknown>;
  }
  const roundSixDescriptorFactPair = (
    input: RoundFiveCorrespondenceInput,
  ): RoundSixDescriptorFactPair | undefined => {
    const removed = input.entry.kind === 'delete-statement'
      ? new Set(input.entry.callBindings.map(binding => binding.operationId))
      : new Set<string>();
    const beforeOperations = input.beforeOperations.filter(value => {
      const record = asRecord(value);
      return typeof record?.id !== 'string' || !removed.has(record.id);
    });
    const afterOperations = input.afterOperations.filter((_, index) => index !== input.insertedOperationIndex);
    if (beforeOperations.length !== afterOperations.length) return undefined;
    for (let index = 0; index < beforeOperations.length; index += 1) {
      const beforeFacts = asRecord(asRecord(beforeOperations[index])?.descriptorFacts);
      const afterFacts = asRecord(asRecord(afterOperations[index])?.descriptorFacts);
      const templateKey = beforeFacts && afterFacts
        ? Object.keys(beforeFacts).find(key => asRecord(beforeFacts[key]) && asRecord(afterFacts[key]))
        : undefined;
      const beforeTemplate = templateKey && beforeFacts ? asRecord(beforeFacts[templateKey]) : undefined;
      const afterTemplate = templateKey && afterFacts ? asRecord(afterFacts[templateKey]) : undefined;
      if (beforeFacts && afterFacts && beforeTemplate && afterTemplate) {
        return { beforeFacts, afterFacts, beforeTemplate, afterTemplate };
      }
    }
    return undefined;
  };
  const roundSixAppendFactPayload = (
    fact: Record<string, unknown>,
    payload: string,
  ): boolean => {
    if (typeof fact.expression === 'string') {
      fact.expression += payload;
      return true;
    }
    if (typeof fact.reason === 'string') {
      fact.reason += payload;
      return true;
    }
    return false;
  };
  const roundSixInstallDescriptorLookalike = (
    pair: RoundSixDescriptorFactPair | undefined,
    key: string,
    beforePayload = '',
    afterPayload = beforePayload,
  ): boolean => {
    if (!pair || Object.prototype.hasOwnProperty.call(pair.beforeFacts, key)
      || Object.prototype.hasOwnProperty.call(pair.afterFacts, key)) return false;
    const beforeFact = asRecord(structuredClone(pair.beforeTemplate));
    const afterFact = asRecord(structuredClone(pair.afterTemplate));
    if (!beforeFact || !afterFact
      || (beforePayload.length > 0 && !roundSixAppendFactPayload(beforeFact, beforePayload))
      || (afterPayload.length > 0 && !roundSixAppendFactPayload(afterFact, afterPayload))) return false;
    pair.beforeFacts[key] = beforeFact;
    pair.afterFacts[key] = afterFact;
    return true;
  };
  for (const scope of ['calls', 'operations'] as const) {
    roundSix(`R6-F1-${scope === 'calls' ? 'C' : 'O'}-exact-lookalikes`, 'F1', `${scope} ledger lookalike names remain exact in the producer-open descriptor-fact namespace`, () => {
      const input = roundFiveCloneInput(roundFiveDeletionInput);
      const pair = roundSixDescriptorFactPair(input);
      const mutationApplied = roundSixLookalikeFields.every(field =>
        roundSixInstallDescriptorLookalike(pair, field));
      const verdict = mutationApplied && roundFiveCompare(input);
      return {
        pass: mutationApplied && verdict,
        detail: {
          baseline: roundFiveCompare(roundFiveDeletionInput),
          mutationApplied,
          verdict,
          fields: roundSixLookalikeFields.length,
          carrier: 'descriptorFacts',
        },
      };
    });
  }
  for (let index = 0; index < roundSixLookalikeFields.length; index += 1) {
    const field = roundSixLookalikeFields[index];
    const scope = index % 2 === 0 ? 'calls' as const : 'operations' as const;
    roundSix(`R6-F1-${scope === 'calls' ? 'C' : 'O'}-drift-${field}`, 'F1', `${scope} arbitrary nested ${field} drift is caller-visible`, () => {
      const baseline = roundFiveCompare(roundFiveDeletionInput);
      const input = roundFiveCloneInput(roundFiveDeletionInput);
      const pair = roundSixDescriptorFactPair(input);
      const container = roundSixLookalikeContainers[index % roundSixLookalikeContainers.length];
      const mutationApplied = roundSixInstallDescriptorLookalike(pair, field, '', `|round-six-drift:${field}`);
      const mutatedVerdict = mutationApplied ? roundFiveCompare(input) : true;
      return {
        pass: baseline && mutationApplied && !mutatedVerdict,
        detail: {
          baseline,
          mutationApplied,
          mutatedVerdict,
          scope,
          container,
          carrier: 'descriptorFacts',
        },
      };
    });
  }
  const roundSixLocationAt = (
    text: string,
    startOffset: number,
    endOffset: number,
  ): Record<string, unknown> => ({
    file: 'ui/edit.lua',
    start: { ...roundFiveLineColumnAt(text, startOffset), offset: startOffset },
    end: { ...roundFiveLineColumnAt(text, endOffset), offset: endOffset },
  });
  const roundSixAttachParserLookalike = (
    input: RoundFiveCorrespondenceInput,
    key: string,
    beforeValue: Record<string, unknown>,
    afterValue: Record<string, unknown>,
  ): boolean => {
    const pair = roundSixDescriptorFactPair(input);
    return roundSixInstallDescriptorLookalike(
      pair,
      key,
      `|caller-parser-lookalike:${JSON.stringify(beforeValue)}`,
      `|caller-parser-lookalike:${JSON.stringify(afterValue)}`,
    );
  };
  roundSix('R6-F1-C-exact-full-parser-lookalike', 'F1', 'full parser-reference-shaped user data remains exact in a producer-valid descriptor expression', () => {
    const input = roundFiveCloneInput(roundFiveDeletionInput);
    const value = {
      kind: 'user-reference',
      origin: 'caller',
      path: '@row:0',
      source: roundSixLocationAt(input.beforeText, 0, 1),
    };
    const mutationApplied = roundSixAttachParserLookalike(
      input,
      'parserReferenceLookalike',
      structuredClone(value),
      structuredClone(value),
    );
    const verdict = mutationApplied && roundFiveCompare(input);
    return { pass: mutationApplied && verdict, detail: { mutationApplied, verdict } };
  });
  roundSix('R6-F1-C-drift-full-parser-lookalike-path', 'F1', 'full parser-reference-shaped user path drift remains visible', () => {
    const input = roundFiveCloneInput(roundFiveDeletionInput);
    const pair = roundFiveSchemaPair(input, 'calls');
    const mutationApplied = pair !== undefined && roundSixAttachParserLookalike(
      input,
      'parserReferencePathLookalike',
      {
        kind: 'user-reference',
        origin: 'caller',
        path: `@row:${pair?.beforeOffset}`,
        source: roundSixLocationAt(input.beforeText, pair?.beforeOffset || 0, pair?.beforeEndOffset || 0),
      },
      {
        kind: 'user-reference',
        origin: 'caller',
        path: `@row:${pair?.afterOffset}`,
        source: roundSixLocationAt(input.afterText, pair?.afterOffset || 0, pair?.afterEndOffset || 0),
      },
    );
    const mutatedVerdict = mutationApplied ? roundFiveCompare(input) : true;
    return { pass: mutationApplied && !mutatedVerdict, detail: { mutationApplied, mutatedVerdict } };
  });
  roundSix('R6-F1-O-drift-full-parser-lookalike-source', 'F1', 'full parser-reference-shaped user source drift remains visible', () => {
    const input = roundFiveCloneInput(roundFiveDeletionInput);
    const pair = roundFiveSchemaPair(input, 'operations');
    const mutationApplied = pair !== undefined && roundSixAttachParserLookalike(
      input,
      'parserReferenceSourceLookalike',
      {
        kind: 'user-reference',
        origin: 'caller',
        path: 'caller-owned-path',
        source: roundSixLocationAt(input.beforeText, pair?.beforeOffset || 0, pair?.beforeEndOffset || 0),
      },
      {
        kind: 'user-reference',
        origin: 'caller',
        path: 'caller-owned-path',
        source: roundSixLocationAt(input.afterText, pair?.afterOffset || 0, pair?.afterEndOffset || 0),
      },
    );
    const mutatedVerdict = mutationApplied ? roundFiveCompare(input) : true;
    return { pass: mutationApplied && !mutatedVerdict, detail: { mutationApplied, mutatedVerdict } };
  });

  const roundSixOperationRootSchemaFields = new Set([
    'id', 'frameId', 'tableId', 'rowId', 'cellId', 'modelOrder', 'sourceOrder',
  ]);
  const roundSixAbsentOperationRootFields = roundSixLookalikeFields.filter(field =>
    !roundSixOperationRootSchemaFields.has(field));
  roundSix('R6-F1-O-root-schema-absent-exact', 'F1', 'schema-absent operation-root lookalike names remain exact in the producer-open descriptor-fact namespace', () => {
    const input = roundFiveCloneInput(roundFiveDeletionInput);
    const pair = roundSixDescriptorFactPair(input);
    const mutationApplied = roundSixAbsentOperationRootFields.every(field =>
      roundSixInstallDescriptorLookalike(pair, field));
    const verdict = mutationApplied && roundFiveCompare(input);
    return {
      pass: mutationApplied && verdict,
      detail: { mutationApplied, verdict, fields: roundSixAbsentOperationRootFields.length, carrier: 'descriptorFacts' },
    };
  });
  for (const field of roundSixAbsentOperationRootFields) {
    roundSix(`R6-F1-O-root-schema-absent-drift-${field}`, 'F1', `schema-absent operation-root ${field} lookalike drift remains visible in descriptor facts`, () => {
      const input = roundFiveCloneInput(roundFiveDeletionInput);
      const pair = roundSixDescriptorFactPair(input);
      const mutationApplied = roundSixInstallDescriptorLookalike(pair, field, '', `|root-lookalike-drift:${field}`);
      const mutatedVerdict = mutationApplied ? roundFiveCompare(input) : true;
      return {
        pass: mutationApplied && !mutatedVerdict,
        detail: { mutationApplied, mutatedVerdict, carrier: 'descriptorFacts' },
      };
    });
  }

  const roundSixAbsentParserReferenceFields = roundFiveIdentityFields.filter(field =>
    field !== 'parentPath' && field !== 'relatedPath');
  roundSix('R6-F1-O-parser-schema-absent-exact', 'F1', 'schema-absent parser-reference lookalike names remain exact in the producer-open descriptor-fact namespace', () => {
    const input = roundFiveCloneInput(roundFiveDeletionInput);
    const pair = roundSixDescriptorFactPair(input);
    const mutationApplied = roundSixAbsentParserReferenceFields.every(field =>
      roundSixInstallDescriptorLookalike(pair, field));
    const verdict = mutationApplied && roundFiveCompare(input);
    return {
      pass: mutationApplied && verdict,
      detail: { mutationApplied, verdict, fields: roundSixAbsentParserReferenceFields.length, carrier: 'descriptorFacts' },
    };
  });
  for (const field of roundSixAbsentParserReferenceFields) {
    roundSix(`R6-F1-O-parser-schema-absent-drift-${field}`, 'F1', `schema-absent parser-reference ${field} lookalike drift remains visible in descriptor facts`, () => {
      const input = roundFiveCloneInput(roundFiveDeletionInput);
      const pair = roundSixDescriptorFactPair(input);
      const mutationApplied = roundSixInstallDescriptorLookalike(pair, field, '', `|parser-lookalike-drift:${field}`);
      const mutatedVerdict = mutationApplied ? roundFiveCompare(input) : true;
      return {
        pass: mutationApplied && !mutatedVerdict,
        detail: { mutationApplied, mutatedVerdict, carrier: 'descriptorFacts' },
      };
    });
  }

  const roundSixInvokeSeam = (input: RoundFiveCorrespondenceInput): { readonly threw: boolean; readonly verdict: boolean } => {
    try {
      return { threw: false, verdict: roundFiveCompare(input) };
    } catch {
      return { threw: true, verdict: false };
    }
  };
  roundSix('R6-F2-skeletal-ledger', 'F2', 'minimal skeletal call and operation ledgers fail closed', () => {
    const sourceInput = roundFiveCloneInput(roundFiveDeletionInput);
    const input: RoundFiveCorrespondenceInput = {
      ...sourceInput,
      beforeCalls: sourceInput.beforeCalls.map(value => {
      const record = asRecord(value)!;
      return { order: record.order, source: record.source };
      }),
      afterCalls: sourceInput.afterCalls.map(value => {
      const record = asRecord(value)!;
      return { order: record.order, source: record.source };
      }),
      beforeOperations: sourceInput.beforeOperations.map(value => {
      const record = asRecord(value)!;
      return { id: record.id, source: record.source };
      }),
      afterOperations: sourceInput.afterOperations.map(value => {
      const record = asRecord(value)!;
      return { id: record.id, source: record.source };
      }),
    };
    const outcome = roundSixInvokeSeam(input);
    return { pass: !outcome.threw && !outcome.verdict, detail: { ...outcome, mutationApplied: true } };
  });
  roundSix('R6-F2-nested-accessor', 'F2', 'nested enumerable accessor fails closed with zero getter observation', () => {
    const input = roundFiveCloneInput(roundFiveDeletionInput);
    const pair = roundFiveSchemaPair(input, 'operations');
    const metadata = pair ? asRecord(pair.afterRecord.metadata) : undefined;
    let getterReads = 0;
    if (metadata) {
      const hostile: Record<string, unknown> = {};
      Object.defineProperty(hostile, 'order', {
        enumerable: true,
        configurable: true,
        get: () => {
          getterReads += 1;
          return 99;
        },
      });
      metadata.hostileAccessor = hostile;
    }
    const outcome = roundSixInvokeSeam(input);
    return {
      pass: pair !== undefined && metadata !== undefined && !outcome.threw && !outcome.verdict && getterReads === 0,
      detail: { ...outcome, mutationApplied: metadata !== undefined, getterReads },
    };
  });
  const roundSixAttachMirroredNested = (
    input: RoundFiveCorrespondenceInput,
    build: () => { readonly before: unknown; readonly after: unknown },
  ): boolean => {
    const pair = roundFiveSchemaPair(input, 'operations');
    const beforeMetadata = pair ? asRecord(pair.beforeRecord.metadata) : undefined;
    const afterMetadata = pair ? asRecord(pair.afterRecord.metadata) : undefined;
    if (!beforeMetadata || !afterMetadata) return false;
    const values = build();
    beforeMetadata.hostileNested = values.before;
    afterMetadata.hostileNested = values.after;
    return true;
  };
  roundSix('R6-F2-cycle', 'F2', 'cyclic nested data fails closed without escaping the seam', () => {
    const input = roundFiveCloneInput(roundFiveDeletionInput);
    const before: Record<string, unknown> = { value: 1 };
    const after: Record<string, unknown> = { value: 1 };
    before.self = before;
    after.self = after;
    const mutationApplied = roundSixAttachMirroredNested(input, () => ({ before, after }));
    const outcome = roundSixInvokeSeam(input);
    return { pass: mutationApplied && !outcome.threw && !outcome.verdict, detail: { ...outcome, mutationApplied } };
  });
  roundSix('R6-F2-custom-prototype', 'F2', 'custom-prototype nested data fails closed', () => {
    const input = roundFiveCloneInput(roundFiveDeletionInput);
    const mutationApplied = roundSixAttachMirroredNested(input, () => ({
      before: Object.assign(Object.create({ inherited: 1 }), { value: 1 }),
      after: Object.assign(Object.create({ inherited: 1 }), { value: 1 }),
    }));
    const outcome = roundSixInvokeSeam(input);
    return { pass: mutationApplied && !outcome.threw && !outcome.verdict, detail: { ...outcome, mutationApplied } };
  });
  roundSix('R6-F2-nonenumerable', 'F2', 'unexpected non-enumerable nested data fails closed', () => {
    const input = roundFiveCloneInput(roundFiveDeletionInput);
    const build = (): Record<string, unknown> => {
      const value: Record<string, unknown> = { visible: 1 };
      Object.defineProperty(value, 'hidden', { value: 2, enumerable: false, configurable: true });
      return value;
    };
    const mutationApplied = roundSixAttachMirroredNested(input, () => ({ before: build(), after: build() }));
    const outcome = roundSixInvokeSeam(input);
    return { pass: mutationApplied && !outcome.threw && !outcome.verdict, detail: { ...outcome, mutationApplied } };
  });
  roundSix('R6-F2-symbol', 'F2', 'unexpected symbol-owned nested data fails closed', () => {
    const input = roundFiveCloneInput(roundFiveDeletionInput);
    const symbol = Symbol('round-six');
    const before: Record<PropertyKey, unknown> = { visible: 1 };
    const after: Record<PropertyKey, unknown> = { visible: 1 };
    before[symbol] = 2;
    after[symbol] = 2;
    const mutationApplied = roundSixAttachMirroredNested(input, () => ({ before, after }));
    const outcome = roundSixInvokeSeam(input);
    return { pass: mutationApplied && !outcome.threw && !outcome.verdict, detail: { ...outcome, mutationApplied } };
  });
  roundSix('R6-F2-proxy', 'F2', 'nested proxy traps are contained and the seam fails closed', () => {
    const input = roundFiveCloneInput(roundFiveDeletionInput);
    let proxyTraps = 0;
    const build = (): object => new Proxy({ visible: 1 }, {
      ownKeys: target => {
        proxyTraps += 1;
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor: (target, key) => {
        proxyTraps += 1;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
      get: (target, key, receiver) => {
        proxyTraps += 1;
        return Reflect.get(target, key, receiver);
      },
    });
    const mutationApplied = roundSixAttachMirroredNested(input, () => ({ before: build(), after: build() }));
    const outcome = roundSixInvokeSeam(input);
    return {
      pass: mutationApplied && !outcome.threw && !outcome.verdict,
      detail: { ...outcome, mutationApplied, proxyTraps, zeroTrapObservationClaimed: false },
    };
  });
  roundSix('R6-F2-top-level-extra', 'F2', 'unexpected top-level data fails closed', () => {
    const input = roundFiveCloneInput(roundFiveDeletionInput) as RoundFiveCorrespondenceInput & { unexpected?: unknown };
    input.unexpected = { value: 1 };
    const outcome = roundSixInvokeSeam(input);
    return { pass: !outcome.threw && !outcome.verdict, detail: { ...outcome, mutationApplied: true } };
  });

  const roundSixStateLua = [
    'local menu = { name = "State correspondence", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local table = frame:addTable(1, {})',
    'local rowA = table:addRow(false, {})',
    'rowA[1]:createText("remove", {})',
    'local rowB = table:addRow(false, {})',
    'rowB[1]:createText("keep", {})',
    'frame:display()',
    '',
  ].join('\n');
  const roundSixStateContext = contextFor(roundSixStateLua);
  const roundSixStateCatalog = catalogFor(roundSixStateContext);
  const roundSixStateEntry = structuralDelete(roundSixStateCatalog, entry => entry.callBindings.length === 1
    && entry.callBindings[0].callName === 'createText'
    && entry.startOffset < roundSixStateLua.indexOf('local rowB'));
  const roundSixStateResult = structuralApply(roundSixStateContext, roundSixStateCatalog, roundSixStateEntry);
  const roundSixStateProjection = roundSixStateResult.accepted ? projectedProgramFor(roundSixStateResult.source) : undefined;
  const roundSixStateAfterCalls = roundSixStateResult.accepted
    ? roundSixStateResult.source.bundle?.sourceFiles.find(file => file.path === roundSixStateEntry.path)?.callModel.calls || []
    : [];
  const roundSixStateDeletionInput: RoundFiveCorrespondenceInput = {
    beforeCalls: roundSixStateContext.source.bundle?.sourceFiles.find(file => file.path === roundSixStateEntry.path)?.callModel.calls || [],
    afterCalls: roundSixStateAfterCalls,
    beforeRecords: roundSixStateContext.source.bundle?.sourceFiles
      .find(file => file.path === roundSixStateEntry.path)?.callModel.records || [],
    afterRecords: roundSixStateResult.accepted
      ? roundSixStateResult.source.bundle?.sourceFiles
        .find(file => file.path === roundSixStateEntry.path)?.callModel.records || []
      : [],
    beforeOperations: roundSixStateContext.program.operations,
    afterOperations: roundSixStateProjection?.program.operations || [],
    entry: roundSixStateEntry,
    beforeText: sourceText(roundSixStateContext),
    afterText: roundSixStateResult.accepted ? sourceText(roundSixStateResult) : '',
    replacementLength: roundSixStateResult.accepted ? roundSixStateResult.replacement.length : 0,
    insertedCallIndex: -1,
    insertedOperationIndex: -1,
  };
  const roundSixKernelState = (
    operation: unknown,
    key: 'stateBefore' | 'stateAfter',
  ): Record<string, unknown> | undefined => asRecord(asRecord(asRecord(operation)?.kernel)?.[key]);
  const roundSixDownstreamStateOperations = (
    input: RoundFiveCorrespondenceInput,
  ): readonly Record<string, unknown>[] => input.afterOperations.flatMap((value, index) => {
    if (index === input.insertedOperationIndex) return [];
    const operation = asRecord(value);
    const source = asRecord(operation?.source);
    const start = asRecord(source?.start);
    const boundary = input.entry.startOffset + input.replacementLength;
    return operation && typeof start?.offset === 'number' && start.offset >= boundary
      && (roundSixKernelState(operation, 'stateBefore') || roundSixKernelState(operation, 'stateAfter'))
      ? [operation]
      : [];
  });
  const roundSixShiftFrameWidth = (state: Record<string, unknown> | undefined, amount: number): boolean => {
    if (!state || typeof state.frameWidth !== 'number') return false;
    state.frameWidth += amount;
    return true;
  };
  const roundSixStateMutationRow = (
    id: string,
    name: string,
    sourceInput: RoundFiveCorrespondenceInput,
    mutate: (input: RoundFiveCorrespondenceInput) => number,
  ): void => {
    roundSix(id, 'F3', name, () => {
      const baseline = roundFiveCompare(sourceInput);
      const input = roundFiveCloneInput(sourceInput);
      const mutationCount = mutate(input);
      const mutatedVerdict = mutationCount > 0 ? roundFiveCompare(input) : true;
      return {
        pass: baseline && mutationCount > 0 && !mutatedVerdict,
        detail: { baseline, mutationApplied: mutationCount > 0, mutationCount, mutatedVerdict, editKind: sourceInput.entry.kind },
      };
    });
  };
  for (const [prefix, input] of [
    ['D', roundSixStateDeletionInput],
    ['I', roundFiveInsertionInput],
  ] as const) {
    roundSixStateMutationRow(`R6-F3-${prefix}-isolated-stateBefore`, `${prefix} isolated downstream stateBefore drift`, input, candidate => {
      const operation = roundSixDownstreamStateOperations(candidate).find(value => roundSixKernelState(value, 'stateBefore'));
      return roundSixShiftFrameWidth(roundSixKernelState(operation, 'stateBefore'), 1) ? 1 : 0;
    });
    roundSixStateMutationRow(`R6-F3-${prefix}-isolated-stateAfter`, `${prefix} isolated downstream stateAfter drift`, input, candidate => {
      const operations = roundSixDownstreamStateOperations(candidate).filter(value => roundSixKernelState(value, 'stateAfter'));
      const operation = operations[operations.length - 1];
      return roundSixShiftFrameWidth(roundSixKernelState(operation, 'stateAfter'), 1) ? 1 : 0;
    });
    roundSixStateMutationRow(`R6-F3-${prefix}-coherent-downstream-chain`, `${prefix} coherent downstream kernel-state chain drift`, input, candidate => {
      let mutations = 0;
      const operations = roundSixDownstreamStateOperations(candidate);
      for (let index = 0; index < operations.length; index += 1) {
        const operation = operations[index];
        if (index > 0 && roundSixShiftFrameWidth(roundSixKernelState(operation, 'stateBefore'), 10)) mutations += 1;
        if (roundSixShiftFrameWidth(roundSixKernelState(operation, 'stateAfter'), 10)) mutations += 1;
      }
      return mutations;
    });
  }
  roundSixStateMutationRow(
    'R6-F3-I-inserted-stateAfter-downstream-stateBefore',
    'inserted stateAfter plus matching downstream stateBefore drift coherently',
    roundFiveInsertionInput,
    candidate => {
      const inserted = asRecord(candidate.afterOperations[candidate.insertedOperationIndex]);
      const insertedAfter = roundSixKernelState(inserted, 'stateAfter');
      if (!insertedAfter) return 0;
      const beforeJson = JSON.stringify(insertedAfter);
      const matching = candidate.afterOperations.slice(candidate.insertedOperationIndex + 1).map(asRecord).find(operation => {
        const stateBefore = roundSixKernelState(operation, 'stateBefore');
        return stateBefore !== undefined && JSON.stringify(stateBefore) === beforeJson;
      });
      const matchingBefore = roundSixKernelState(matching, 'stateBefore');
      if (!matchingBefore) return 0;
      const insertedMutated = roundSixShiftFrameWidth(insertedAfter, 10);
      const matchingMutated = roundSixShiftFrameWidth(matchingBefore, 10);
      return insertedMutated && matchingMutated ? 2 : 0;
    },
  );

  interface RoundSevenMatrixRow {
    readonly id: string;
    readonly family: 'F1' | 'F2';
    readonly name: string;
    readonly pass: boolean;
    readonly detail: string;
  }
  const roundSevenRows: RoundSevenMatrixRow[] = [];
  const roundSeven = (
    id: string,
    family: RoundSevenMatrixRow['family'],
    name: string,
    probe: () => { readonly pass: boolean; readonly detail?: unknown },
  ): void => {
    try {
      const result = probe();
      roundSevenRows.push({ id, family, name, pass: result.pass, detail: causalDetail(result.detail) });
    } catch (error) {
      roundSevenRows.push({
        id,
        family,
        name,
        pass: false,
        detail: causalDetail({ threw: true, error: error instanceof Error ? error.message : String(error) }),
      });
    }
  };

  const roundSevenSchemaLua = [
    'local menu = { name = "Round seven", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local table = frame:addTable(1, { width = 80, scaling = false })',
    'table:addRow(false, {})[1]:createEditBox({ defaultText = "value", description = "description" })',
    'Helper.scaleX(10)',
    'frame:display()',
    '',
  ].join('\n');
  const roundSevenSchemaContext = contextFor(roundSevenSchemaLua);
  const roundSevenSchemaCatalog = catalogFor(roundSevenSchemaContext);
  const roundSevenSchemaEntry = structuralInsert(roundSevenSchemaCatalog, 'first-row');
  const roundSevenSchemaResult = structuralApply(
    roundSevenSchemaContext,
    roundSevenSchemaCatalog,
    roundSevenSchemaEntry,
    'table:addRow(false, {})',
  );
  const roundSevenSchemaProjection = roundSevenSchemaResult.accepted
    ? projectedProgramFor(roundSevenSchemaResult.source)
    : undefined;
  const roundSevenSchemaAfterCalls = roundSevenSchemaResult.accepted
    ? roundSevenSchemaResult.source.bundle?.sourceFiles
      .find(file => file.path === roundSevenSchemaEntry.path)?.callModel.calls || []
    : [];
  const roundSevenSchemaInsertedStart = roundSevenSchemaEntry.startOffset + roundSevenSchemaEntry.indentation.length;
  const roundSevenSchemaInsertedEnd = roundSevenSchemaEntry.startOffset
    + (roundSevenSchemaResult.accepted ? roundSevenSchemaResult.replacement.length : 0);
  const roundSevenSchemaInsertedCallIndex = roundSevenSchemaAfterCalls.findIndex(call =>
    call.name === 'addRow'
    && call.source.start.offset >= roundSevenSchemaInsertedStart
    && call.source.end.offset <= roundSevenSchemaInsertedEnd);
  const roundSevenSchemaInsertedOperationIndex = roundSevenSchemaProjection?.program.operations.findIndex(operation =>
    operation.kind === 'addRow'
    && operation.source.start.offset >= roundSevenSchemaInsertedStart
    && operation.source.end.offset <= roundSevenSchemaInsertedEnd) ?? -1;
  let roundSevenSchemaInput: RoundFiveCorrespondenceInput = {
    beforeCalls: roundSevenSchemaContext.source.bundle?.sourceFiles
      .find(file => file.path === roundSevenSchemaEntry.path)?.callModel.calls || [],
    afterCalls: roundSevenSchemaAfterCalls,
    beforeRecords: roundSevenSchemaContext.source.bundle?.sourceFiles
      .find(file => file.path === roundSevenSchemaEntry.path)?.callModel.records || [],
    afterRecords: roundSevenSchemaResult.accepted
      ? roundSevenSchemaResult.source.bundle?.sourceFiles
        .find(file => file.path === roundSevenSchemaEntry.path)?.callModel.records || []
      : [],
    beforeOperations: roundSevenSchemaContext.program.operations,
    afterOperations: roundSevenSchemaProjection?.program.operations || [],
    entry: roundSevenSchemaEntry,
    beforeText: sourceText(roundSevenSchemaContext),
    afterText: roundSevenSchemaResult.accepted ? sourceText(roundSevenSchemaResult) : '',
    replacementLength: roundSevenSchemaResult.accepted ? roundSevenSchemaResult.replacement.length : 0,
    insertedCallIndex: roundSevenSchemaInsertedCallIndex,
    insertedOperationIndex: roundSevenSchemaInsertedOperationIndex,
  };

  type RoundSevenOwner = Record<string, unknown> | unknown[];
  interface RoundSevenNodeReference {
    readonly owner: RoundSevenOwner;
    readonly key: string | number;
    readonly value: unknown;
    readonly path: string;
  }
  interface RoundSevenNodePair {
    readonly before: RoundSevenNodeReference;
    readonly after: RoundSevenNodeReference;
  }
  interface RoundSevenLedgerPair {
    readonly before: Record<string, unknown>;
    readonly after: Record<string, unknown>;
    readonly beforeOwner: unknown[];
    readonly afterOwner: unknown[];
    readonly beforeIndex: number;
    readonly afterIndex: number;
  }
  const roundSevenRetainedPairs = (
    input: RoundFiveCorrespondenceInput,
    scope: 'calls' | 'operations',
  ): readonly RoundSevenLedgerPair[] => {
    const beforeOwner = [...(scope === 'calls' ? input.beforeCalls : input.beforeOperations)] as unknown[];
    const afterOwner = [...(scope === 'calls' ? input.afterCalls : input.afterOperations)] as unknown[];
    const removedCallOrders = input.entry.kind === 'delete-statement'
      ? new Set(input.entry.callBindings.map(binding => binding.callOrder))
      : new Set<number>();
    const removedOperationIds = input.entry.kind === 'delete-statement'
      ? new Set(input.entry.callBindings.map(binding => binding.operationId))
      : new Set<string>();
    const retainedBefore = beforeOwner.map((value, index) => ({ value, index })).filter(({ value }) => {
      const record = asRecord(value);
      return scope === 'calls'
        ? typeof record?.order !== 'number' || !removedCallOrders.has(record.order)
        : typeof record?.id !== 'string' || !removedOperationIds.has(record.id);
    });
    const retainedAfter = afterOwner.map((value, index) => ({ value, index }))
      .filter(({ index }) => index !== (scope === 'calls' ? input.insertedCallIndex : input.insertedOperationIndex));
    if (retainedBefore.length !== retainedAfter.length) return [];
    return retainedBefore.flatMap((before, index) => {
      const after = retainedAfter[index];
      const beforeRecord = asRecord(before.value);
      const afterRecord = asRecord(after.value);
      return beforeRecord && afterRecord ? [{
        before: beforeRecord,
        after: afterRecord,
        beforeOwner,
        afterOwner,
        beforeIndex: before.index,
        afterIndex: after.index,
      }] : [];
    });
  };
  const roundSevenRootPair = (
    input: RoundFiveCorrespondenceInput,
    scope: 'calls' | 'operations',
    predicate: (before: Record<string, unknown>, after: Record<string, unknown>) => boolean,
  ): RoundSevenNodePair | undefined => {
    const pair = roundSevenRetainedPairs(input, scope).find(candidate => predicate(candidate.before, candidate.after));
    return pair ? {
      before: { owner: pair.beforeOwner, key: pair.beforeIndex, value: pair.before, path: `before.${scope}[${pair.beforeIndex}]` },
      after: { owner: pair.afterOwner, key: pair.afterIndex, value: pair.after, path: `after.${scope}[${pair.afterIndex}]` },
    } : undefined;
  };
  const roundSevenChildPair = (
    pair: RoundSevenNodePair | undefined,
    key: string,
  ): RoundSevenNodePair | undefined => {
    const before = asRecord(pair?.before.value);
    const after = asRecord(pair?.after.value);
    if (!pair || !before || !after
      || !Object.prototype.hasOwnProperty.call(before, key)
      || !Object.prototype.hasOwnProperty.call(after, key)) return undefined;
    return {
      before: { owner: before, key, value: before[key], path: `${pair.before.path}.${key}` },
      after: { owner: after, key, value: after[key], path: `${pair.after.path}.${key}` },
    };
  };
  const roundSevenPathValue = (root: unknown, suffix: string): unknown => {
    let value = root;
    const segments = [...suffix.matchAll(/\.([A-Za-z_$][A-Za-z0-9_$]*)|\[([0-9]+)\]/g)];
    for (const segment of segments) {
      if (value === null || typeof value !== 'object') return undefined;
      const key = segment[1] ?? segment[2];
      value = (value as Record<string, unknown>)[key];
    }
    return value;
  };
  const roundSevenCompleteRecordLocation = (
    input: RoundFiveCorrespondenceInput,
    path: string,
    siblingKey?: string,
  ): unknown => {
    const match = /^(before|after)\.calls\[([0-9]+)\](.*)$/.exec(path);
    if (!match) return undefined;
    const side = match[1] === 'before' ? 'before' : 'after';
    const calls = side === 'before' ? input.beforeCalls : input.afterCalls;
    const records = side === 'before' ? input.beforeRecords : input.afterRecords;
    const call = asRecord(calls[Number(match[2])]);
    if (!call || typeof call.order !== 'number') return undefined;
    const record = records.map(asRecord).find(candidate => candidate?.recordType === 'call' && candidate.order === call.order);
    if (!record) return undefined;
    const suffix = siblingKey
      ? match[3].replace(/\.([A-Za-z_$][A-Za-z0-9_$]*)$/, `.${siblingKey}`)
      : match[3];
    return roundSevenPathValue(record, suffix);
  };
  const roundSevenMirrorCallLocationToRecords = (
    input: RoundFiveCorrespondenceInput,
    pair: RoundSevenNodePair | undefined,
    beforeText: string,
    beforeStart: number,
    beforeEnd: number,
    afterText: string,
    afterStart: number,
    afterEnd: number,
    siblingKey?: string,
  ): boolean => pair !== undefined
    && roundSevenSetLocationRange(
      roundSevenCompleteRecordLocation(input, pair.before.path, siblingKey),
      beforeText,
      beforeStart,
      beforeEnd,
    )
    && roundSevenSetLocationRange(
      roundSevenCompleteRecordLocation(input, pair.after.path, siblingKey),
      afterText,
      afterStart,
      afterEnd,
    );
  const roundSevenArrayElementPair = (
    pair: RoundSevenNodePair | undefined,
    predicate: (before: unknown, after: unknown) => boolean = () => true,
  ): RoundSevenNodePair | undefined => {
    const before = pair?.before.value;
    const after = pair?.after.value;
    if (!pair || !Array.isArray(before) || !Array.isArray(after)) return undefined;
    const index = before.findIndex((value, candidateIndex) =>
      candidateIndex < after.length && predicate(value, after[candidateIndex]));
    return index >= 0 ? {
      before: { owner: before, key: index, value: before[index], path: `${pair.before.path}[${index}]` },
      after: { owner: after, key: index, value: after[index], path: `${pair.after.path}[${index}]` },
    } : undefined;
  };
  const roundSevenFindNestedPair = (
    pair: RoundSevenNodePair | undefined,
    predicate: (before: unknown, after: unknown) => boolean,
    seen = new Set<object>(),
  ): RoundSevenNodePair | undefined => {
    if (!pair || pair.before.value === null || typeof pair.before.value !== 'object'
      || pair.after.value === null || typeof pair.after.value !== 'object'
      || seen.has(pair.before.value as object)) return undefined;
    seen.add(pair.before.value as object);
    if (predicate(pair.before.value, pair.after.value)) return pair;
    if (Array.isArray(pair.before.value) && Array.isArray(pair.after.value)) {
      for (let index = 0; index < Math.min(pair.before.value.length, pair.after.value.length); index += 1) {
        const found = roundSevenFindNestedPair({
          before: { owner: pair.before.value, key: index, value: pair.before.value[index], path: `${pair.before.path}[${index}]` },
          after: { owner: pair.after.value, key: index, value: pair.after.value[index], path: `${pair.after.path}[${index}]` },
        }, predicate, seen);
        if (found) return found;
      }
      return undefined;
    }
    const before = asRecord(pair.before.value);
    const after = asRecord(pair.after.value);
    if (!before || !after) return undefined;
    for (const key of Object.keys(before)) {
      if (!Object.prototype.hasOwnProperty.call(after, key)) continue;
      const found = roundSevenFindNestedPair({
        before: { owner: before, key, value: before[key], path: `${pair.before.path}.${key}` },
        after: { owner: after, key, value: after[key], path: `${pair.after.path}.${key}` },
      }, predicate, seen);
      if (found) return found;
    }
    return undefined;
  };
  const roundSevenCall = (name?: string): RoundSevenNodePair | undefined => roundSevenRootPair(
    roundSevenSchemaInput,
    'calls',
    before => name === undefined || before.name === name,
  );
  const roundSevenOperation = (
    predicate: (record: Record<string, unknown>) => boolean = () => true,
  ): RoundSevenNodePair | undefined => roundSevenRootPair(
    roundSevenSchemaInput,
    'operations',
    before => predicate(before),
  );
  const roundSevenNonEmptySemantics = (): RoundSevenNodePair | undefined => {
    for (const pair of roundSevenRetainedPairs(roundSevenSchemaInput, 'calls')) {
      const semantics = asRecord(pair.before.semantics);
      if (semantics && Object.keys(semantics).length > 0) {
        return roundSevenChildPair(roundSevenRootPair(
          roundSevenSchemaInput,
          'calls',
          before => before === pair.before,
        ), 'semantics');
      }
    }
    return undefined;
  };
  const roundSevenNonEmptyFacts = (): RoundSevenNodePair | undefined => {
    for (const pair of roundSevenRetainedPairs(roundSevenSchemaInput, 'operations')) {
      const facts = asRecord(pair.before.descriptorFacts);
      if (facts && Object.keys(facts).length > 0) {
        return roundSevenChildPair(roundSevenRootPair(
          roundSevenSchemaInput,
          'operations',
          before => before === pair.before,
        ), 'descriptorFacts');
      }
    }
    return undefined;
  };
  const roundSevenScaleOperation = (): RoundSevenNodePair | undefined => roundSevenOperation(record =>
    record.kind === 'scaleX' && asRecord(record.scale) !== undefined);
  const roundSevenBranchCall = (): RoundSevenNodePair | undefined => roundSevenRootPair(
    roundSevenSchemaInput,
    'calls',
    before => Array.isArray(asRecord(before.context)?.branchPath)
      && (asRecord(before.context)?.branchPath as readonly unknown[]).length > 0,
  );
  const roundSevenLoopCall = (): RoundSevenNodePair | undefined => roundSevenRootPair(
    roundSevenSchemaInput,
    'calls',
    before => Array.isArray(asRecord(before.context)?.loopPath)
      && (asRecord(before.context)?.loopPath as readonly unknown[]).length > 0,
  );
  const roundSevenProperties = (): RoundSevenNodePair | undefined => {
    for (const pair of roundSevenRetainedPairs(roundSevenSchemaInput, 'calls')) {
      const semanticsPair = roundSevenChildPair(roundSevenRootPair(
        roundSevenSchemaInput,
        'calls',
        before => before === pair.before,
      ), 'semantics');
      const propertiesPair = roundSevenChildPair(semanticsPair, 'properties');
      if (Array.isArray(propertiesPair?.before.value) && propertiesPair.before.value.length > 0) return propertiesPair;
    }
    return undefined;
  };
  const roundSevenParserReference = (): RoundSevenNodePair | undefined => roundSevenFindNestedPair(
    roundSevenCall(),
    (before, after) => {
      const left = asRecord(before);
      const right = asRecord(after);
      return typeof left?.kind === 'string'
        && typeof left.path === 'string'
        && typeof left.origin === 'string'
        && roundFiveIsLocation(left.source)
        && typeof right?.kind === 'string'
        && typeof right.path === 'string'
        && typeof right.origin === 'string'
        && roundFiveIsLocation(right.source);
    },
  );
  const roundSevenParserValue = (): RoundSevenNodePair | undefined => roundSevenFindNestedPair(
    roundSevenCall(),
    (before, after) => {
      const left = asRecord(before);
      const right = asRecord(after);
      return typeof left?.status === 'string'
        && typeof left.type === 'string'
        && typeof left.expression === 'string'
        && roundFiveIsLocation(left.location)
        && typeof right?.status === 'string'
        && typeof right.type === 'string'
        && typeof right.expression === 'string'
        && roundFiveIsLocation(right.location);
    },
  );
  const roundSevenSourceLocation = (): RoundSevenNodePair | undefined => roundSevenChildPair(roundSevenCall(), 'source');

  type RoundSevenSchemaName =
    | 'call'
    | 'operation'
    | 'call-metadata'
    | 'call-semantics'
    | 'edit-box-semantics'
    | 'scale-semantics'
    | 'parser-values'
    | 'parser-value'
    | 'parser-reference'
    | 'parser-properties'
    | 'parser-property'
    | 'enclosing-statement'
    | 'call-context'
    | 'branch-paths'
    | 'branch-path'
    | 'loop-paths'
    | 'loop-path'
    | 'descriptor-facts'
    | 'descriptor-fact'
    | 'scale-resolution'
    | 'source-locations'
    | 'source-location';
  interface RoundSevenSchemaTarget {
    readonly schema: RoundSevenSchemaName;
    readonly locate: () => RoundSevenNodePair | undefined;
    readonly missingKey?: string;
    readonly invalidKey?: string;
    readonly invalidValue?: unknown;
    readonly malformedKey?: string;
    readonly malformedValue?: unknown;
    readonly closedRecord?: boolean;
    readonly array?: boolean;
    readonly schemaAbsent?: boolean;
  }
  const roundSevenSchemaTargets: readonly RoundSevenSchemaTarget[] = [
    { schema: 'call', locate: () => roundSevenCall(), missingKey: 'callee', invalidKey: 'method', invalidValue: 'bogus', malformedKey: 'arguments', malformedValue: {}, closedRecord: true },
    { schema: 'operation', locate: () => roundSevenOperation(), missingKey: 'kind', invalidKey: 'status', invalidValue: 'bogus', malformedKey: 'metadata', malformedValue: [], closedRecord: true },
    { schema: 'call-metadata', locate: () => roundSevenChildPair(roundSevenOperation(), 'metadata'), missingKey: 'arguments', invalidKey: 'arguments', invalidValue: 'bogus', malformedKey: 'semantics', malformedValue: [], closedRecord: true },
    { schema: 'call-semantics', locate: roundSevenNonEmptySemantics, invalidKey: 'options', invalidValue: 'bogus', malformedKey: 'properties', malformedValue: {}, closedRecord: true },
    { schema: 'edit-box-semantics', locate: () => roundSevenChildPair(roundSevenChildPair(roundSevenCall('createEditBox'), 'semantics'), 'editBox'), invalidKey: 'defaultText', invalidValue: 'bogus', malformedKey: 'description', malformedValue: {}, closedRecord: true },
    { schema: 'scale-semantics', locate: () => roundSevenChildPair(roundSevenChildPair(roundSevenCall('scaleX'), 'semantics'), 'scale'), invalidKey: 'input', invalidValue: 'bogus', malformedKey: 'input', malformedValue: {}, closedRecord: true },
    { schema: 'parser-values', locate: () => roundSevenChildPair(roundSevenCall(), 'arguments'), array: true },
    { schema: 'parser-value', locate: roundSevenParserValue, missingKey: 'status', invalidKey: 'status', invalidValue: 'bogus', malformedKey: 'location', malformedValue: {}, closedRecord: true },
    { schema: 'parser-reference', locate: roundSevenParserReference, missingKey: 'path', invalidKey: 'kind', invalidValue: 'bogus', malformedKey: 'source', malformedValue: {}, closedRecord: true },
    { schema: 'parser-properties', locate: roundSevenProperties, array: true },
    { schema: 'parser-property', locate: () => roundSevenArrayElementPair(roundSevenProperties()), missingKey: 'name', invalidKey: 'sourceOrder', invalidValue: 'bogus', malformedKey: 'value', malformedValue: {}, closedRecord: true },
    { schema: 'enclosing-statement', locate: () => roundSevenChildPair(roundSevenCall(), 'enclosingStatement'), missingKey: 'source', invalidKey: 'terminator', invalidValue: 'bogus', malformedKey: 'deletionSource', malformedValue: {}, closedRecord: true },
    { schema: 'call-context', locate: () => roundSevenChildPair(roundSevenBranchCall() || roundSevenCall(), 'context'), missingKey: 'branchPath', invalidKey: 'reachability', invalidValue: 'bogus', malformedKey: 'loopPath', malformedValue: {}, closedRecord: true },
    { schema: 'branch-paths', locate: () => roundSevenChildPair(roundSevenChildPair(roundSevenCall(), 'context'), 'branchPath'), array: true },
    { schema: 'branch-path', locate: () => roundSevenArrayElementPair(roundSevenChildPair(roundSevenChildPair(roundSevenBranchCall(), 'context'), 'branchPath')), missingKey: 'boundaryId', invalidKey: 'arm', invalidValue: 'bogus', malformedKey: 'boundary', malformedValue: {}, closedRecord: true, schemaAbsent: true },
    { schema: 'loop-paths', locate: () => roundSevenChildPair(roundSevenChildPair(roundSevenCall(), 'context'), 'loopPath'), array: true },
    { schema: 'loop-path', locate: () => roundSevenArrayElementPair(roundSevenChildPair(roundSevenChildPair(roundSevenLoopCall(), 'context'), 'loopPath')), missingKey: 'source', invalidKey: 'kind', invalidValue: 'bogus', malformedKey: 'source', malformedValue: {}, closedRecord: true, schemaAbsent: true },
    { schema: 'descriptor-facts', locate: roundSevenNonEmptyFacts, array: false },
    { schema: 'descriptor-fact', locate: () => {
      const facts = roundSevenNonEmptyFacts();
      const before = asRecord(facts?.before.value);
      const after = asRecord(facts?.after.value);
      const key = before && after ? Object.keys(before).find(candidate => Object.prototype.hasOwnProperty.call(after, candidate)) : undefined;
      return key ? roundSevenChildPair(facts, key) : undefined;
    }, missingKey: 'status', invalidKey: 'status', invalidValue: 'bogus', malformedKey: 'source', malformedValue: {}, closedRecord: true },
    { schema: 'scale-resolution', locate: () => roundSevenChildPair(roundSevenScaleOperation(), 'scale'), missingKey: 'status', invalidKey: 'status', invalidValue: 'bogus', malformedKey: 'sourceArguments', malformedValue: {}, closedRecord: true },
    { schema: 'source-locations', locate: () => roundSevenChildPair(roundSevenChildPair(roundSevenScaleOperation(), 'scale'), 'sourceArguments'), array: true },
    { schema: 'source-location', locate: roundSevenSourceLocation, missingKey: 'file', invalidKey: 'file', invalidValue: 7, malformedKey: 'start', malformedValue: {}, closedRecord: true },
  ];
  const roundSevenAssignReference = (reference: RoundSevenNodeReference, value: unknown): void => {
    (reference.owner as Record<string | number, unknown>)[reference.key] = value;
  };
  const roundSevenMutatePair = (
    pair: RoundSevenNodePair | undefined,
    mutate: (reference: RoundSevenNodeReference) => boolean,
  ): boolean => Boolean(pair && mutate(pair.before) && mutate(pair.after));
  const roundSevenSchemaMutation = (
    id: string,
    name: string,
    target: RoundSevenSchemaTarget,
    mutate: (reference: RoundSevenNodeReference) => boolean,
  ): void => {
    roundSeven(id, 'F1', name, () => {
      const baseline = roundSevenSchemaResult.accepted === true && roundFiveCompare(roundSevenSchemaInput);
      const input = roundFiveCloneInput(roundSevenSchemaInput);
      const originalInput = roundSevenSchemaInput;
      roundSevenSchemaInput = input;
      let pair: RoundSevenNodePair | undefined;
      try {
        pair = target.locate();
      } finally {
        roundSevenSchemaInput = originalInput;
      }
      const mutationApplied = roundSevenMutatePair(pair, mutate);
      const mutatedVerdict = mutationApplied ? roundFiveCompare(input) : true;
      return {
        pass: baseline && mutationApplied && !mutatedVerdict,
        detail: {
          baseline,
          mutationApplied,
          mutationPaths: pair ? [pair.before.path, pair.after.path] : [],
          mutatedVerdict,
          schema: target.schema,
        },
      };
    });
  };
  for (const target of roundSevenSchemaTargets) {
    roundSeven(`R7-F1-${target.schema}-baseline`, 'F1', `${target.schema} exact real producer fixture baseline`, () => {
      const pair = target.locate();
      const baseline = roundSevenSchemaResult.accepted === true && roundFiveCompare(roundSevenSchemaInput);
      return {
        pass: baseline && (target.schemaAbsent ? pair === undefined : pair !== undefined),
        detail: {
          baseline,
          fixturePresent: pair !== undefined,
          schemaClassification: target.schemaAbsent ? 'absent-from-accepted-structural-fixtures' : 'real-producer-fixture',
          accepted: roundSevenSchemaResult.accepted,
          refusalReason: structuralResultReason(roundSevenSchemaResult),
          refusalDetail: structuralResultDetail(roundSevenSchemaResult),
          beforeCalls: roundSevenSchemaInput.beforeCalls.length,
          afterCalls: roundSevenSchemaInput.afterCalls.length,
          beforeOperations: roundSevenSchemaInput.beforeOperations.length,
          afterOperations: roundSevenSchemaInput.afterOperations.length,
          insertedCallIndex: roundSevenSchemaInput.insertedCallIndex,
          insertedOperationIndex: roundSevenSchemaInput.insertedOperationIndex,
        },
      };
    });
    if (target.schemaAbsent) continue;
    if (target.array) {
      roundSevenSchemaMutation(`R7-F1-${target.schema}-missing-element-contract`, `${target.schema} element missing its required producer contract`, target, reference => {
        if (!Array.isArray(reference.value)) return false;
        if (reference.value.length === 0) reference.value.push({});
        else reference.value[0] = {};
        return true;
      });
      roundSevenSchemaMutation(`R7-F1-${target.schema}-invalid-element-type`, `${target.schema} rejects an invalid element type`, target, reference => {
        if (!Array.isArray(reference.value)) return false;
        if (reference.value.length === 0) reference.value.push('round-seven-invalid');
        else reference.value[0] = 'round-seven-invalid';
        return true;
      });
      roundSevenSchemaMutation(`R7-F1-${target.schema}-malformed-container`, `${target.schema} rejects a malformed container`, target, reference => {
        roundSevenAssignReference(reference, {});
        return true;
      });
      continue;
    }
    if (target.schema === 'descriptor-facts') {
      roundSevenSchemaMutation('R7-F1-descriptor-facts-erased', 'emitted non-empty descriptor facts cannot be erased coherently', target, reference => {
        roundSevenAssignReference(reference, {});
        return asRecord(reference.value) !== undefined;
      });
      roundSevenSchemaMutation('R7-F1-descriptor-facts-malformed-fact', 'descriptor-facts rejects a malformed nested fact', target, reference => {
        const facts = asRecord(reference.value);
        const key = facts && Object.keys(facts)[0];
        if (!facts || !key) return false;
        facts[key] = {};
        return true;
      });
      continue;
    }
    if (target.missingKey) {
      roundSevenSchemaMutation(`R7-F1-${target.schema}-missing-${target.missingKey}`, `${target.schema} rejects missing required ${target.missingKey}`, target, reference => {
        const record = asRecord(reference.value);
        if (!record || !Object.prototype.hasOwnProperty.call(record, target.missingKey!)) return false;
        delete record[target.missingKey!];
        return true;
      });
    } else if (target.schema === 'call-semantics' || target.schema === 'edit-box-semantics' || target.schema === 'scale-semantics') {
      roundSevenSchemaMutation(`R7-F1-${target.schema}-erased-emitted-fields`, `${target.schema} cannot erase emitted optional fields while its operation metadata remains exact`, target, reference => {
        const record = asRecord(reference.value);
        if (!record || Object.keys(record).length === 0) return false;
        roundSevenAssignReference(reference, {});
        return true;
      });
    }
    if (target.invalidKey) {
      roundSevenSchemaMutation(`R7-F1-${target.schema}-invalid-${target.invalidKey}`, `${target.schema} rejects invalid ${target.invalidKey}`, target, reference => {
        const record = asRecord(reference.value);
        if (!record) return false;
        record[target.invalidKey!] = target.invalidValue;
        return true;
      });
    }
    if (target.malformedKey) {
      roundSevenSchemaMutation(`R7-F1-${target.schema}-malformed-${target.malformedKey}`, `${target.schema} rejects malformed nested ${target.malformedKey}`, target, reference => {
        const record = asRecord(reference.value);
        if (!record || !Object.prototype.hasOwnProperty.call(record, target.malformedKey!)) return false;
        record[target.malformedKey!] = target.malformedValue;
        return true;
      });
    }
    if (target.closedRecord) {
      roundSevenSchemaMutation(`R7-F1-${target.schema}-unexpected-key`, `${target.schema} rejects an unexpected closed-record key`, target, reference => {
        const record = asRecord(reference.value);
        if (!record) return false;
        record.__roundSevenUnexpected = true;
        return true;
      });
    }
  }

  const roundSevenReproduced = (
    id: string,
    name: string,
    locate: () => RoundSevenNodePair | undefined,
    replacement: unknown,
  ): void => roundSeven(id, 'F1', name, () => {
    const baseline = roundSevenSchemaResult.accepted === true && roundFiveCompare(roundSevenSchemaInput);
    const input = roundFiveCloneInput(roundSevenSchemaInput);
    const originalInput = roundSevenSchemaInput;
    roundSevenSchemaInput = input;
    let pair: RoundSevenNodePair | undefined;
    try {
      pair = locate();
    } finally {
      roundSevenSchemaInput = originalInput;
    }
    const mutationApplied = roundSevenMutatePair(pair, reference => {
      roundSevenAssignReference(reference, structuredClone(replacement));
      return true;
    });
    const mutatedVerdict = mutationApplied ? roundFiveCompare(input) : true;
    return { pass: baseline && mutationApplied && !mutatedVerdict, detail: { baseline, mutationApplied, mutatedVerdict } };
  });
  roundSevenReproduced('R7-F1-P1-call-enclosing-empty', 'call.enclosingStatement empty record fails closed', () => roundSevenChildPair(roundSevenCall(), 'enclosingStatement'), {});
  roundSevenReproduced('R7-F1-P1-call-semantics-empty', 'call.semantics empty record cannot erase emitted semantics', roundSevenNonEmptySemantics, {});
  roundSevenReproduced('R7-F1-P1-call-context-empty', 'call.context empty record fails closed', () => roundSevenChildPair(roundSevenCall(), 'context'), {});
  roundSevenReproduced('R7-F1-P1-operation-metadata-empty', 'operation.metadata empty record fails closed', () => roundSevenChildPair(roundSevenOperation(), 'metadata'), {});
  roundSevenReproduced('R7-F1-P1-operation-descriptorFacts-empty', 'operation.descriptorFacts empty record cannot erase emitted facts', roundSevenNonEmptyFacts, {});
  roundSevenReproduced('R7-F1-P1-operation-scale-empty', 'operation.scale empty record fails closed', () => roundSevenChildPair(roundSevenScaleOperation(), 'scale'), {});
  const roundSevenMutateParserRecords = (
    input: RoundFiveCorrespondenceInput,
    family: 'reference-path' | 'value-status',
  ): number => {
    const seen = new Set<object>();
    let mutations = 0;
    const visit = (value: unknown): void => {
      if (value === null || typeof value !== 'object' || seen.has(value)) return;
      seen.add(value);
      if (Array.isArray(value)) {
        for (const child of value) visit(child);
        return;
      }
      const record = value as Record<string, unknown>;
      if (family === 'reference-path'
        && typeof record.kind === 'string'
        && typeof record.path === 'string'
        && typeof record.origin === 'string'
        && roundFiveIsLocation(record.source)) {
        delete record.path;
        mutations += 1;
      }
      if (family === 'value-status'
        && typeof record.status === 'string'
        && typeof record.type === 'string'
        && typeof record.expression === 'string'
        && roundFiveIsLocation(record.location)) {
        record.status = 'bogus';
        mutations += 1;
      }
      for (const child of Object.values(record)) visit(child);
    };
    visit(input.beforeCalls);
    visit(input.afterCalls);
    visit(input.beforeOperations);
    visit(input.afterOperations);
    return mutations;
  };
  roundSeven('R7-F1-P1-parser-reference-missing-path', 'F1', 'parser reference missing required path fails closed', () => {
    const baseline = roundSevenSchemaResult.accepted === true && roundFiveCompare(roundSevenSchemaInput);
    const input = roundFiveCloneInput(roundSevenSchemaInput);
    const mutationCount = roundSevenMutateParserRecords(input, 'reference-path');
    const mutationApplied = mutationCount > 0;
    const mutatedVerdict = mutationApplied ? roundFiveCompare(input) : true;
    return { pass: baseline && mutationApplied && !mutatedVerdict, detail: { baseline, mutationApplied, mutationCount, mutatedVerdict } };
  });
  roundSeven('R7-F1-P1-parser-value-bogus-status', 'F1', 'parser value bogus status fails closed', () => {
    const baseline = roundSevenSchemaResult.accepted === true && roundFiveCompare(roundSevenSchemaInput);
    const input = roundFiveCloneInput(roundSevenSchemaInput);
    const mutationCount = roundSevenMutateParserRecords(input, 'value-status');
    const mutationApplied = mutationCount > 0;
    const mutatedVerdict = mutationApplied ? roundFiveCompare(input) : true;
    return { pass: baseline && mutationApplied && !mutatedVerdict, detail: { baseline, mutationApplied, mutationCount, mutatedVerdict } };
  });

  const roundSevenPosition = (text: string, offset: number): Record<string, number> => ({
    ...roundFiveLineColumnAt(text, offset),
    offset,
  });
  const roundSevenSetLocationRange = (
    location: unknown,
    text: string,
    startOffset: number,
    endOffset: number,
  ): boolean => {
    const record = asRecord(location);
    if (!record || startOffset < 0 || endOffset < startOffset || endOffset > text.length) return false;
    record.start = roundSevenPosition(text, startOffset);
    record.end = roundSevenPosition(text, endOffset);
    return true;
  };
  const roundSevenPreBoundaryPair = (
    input: RoundFiveCorrespondenceInput,
    scope: 'calls' | 'operations',
  ): RoundSevenNodePair | undefined => roundSevenRootPair(input, scope, before => {
    const source = asRecord(before.source);
    const start = asRecord(source?.start);
    return typeof start?.offset === 'number' && start.offset < input.entry.startOffset;
  });
  type RoundSevenBoundaryFamily =
    | 'call-source'
    | 'operation-source'
    | 'enclosing-source'
    | 'enclosing-deletionSource'
    | 'parser-location'
    | 'parser-sourceLiteral'
    | 'parser-reference-source'
    | 'descriptor-fact-source';
  const roundSevenBoundaryLocationPair = (
    input: RoundFiveCorrespondenceInput,
    family: RoundSevenBoundaryFamily,
  ): RoundSevenNodePair | undefined => {
    const callPair = roundSevenPreBoundaryPair(input, 'calls');
    const operationPair = roundSevenPreBoundaryPair(input, 'operations');
    if (family === 'call-source') return roundSevenChildPair(callPair, 'source');
    if (family === 'operation-source') return roundSevenChildPair(operationPair, 'source');
    if (family === 'enclosing-source') return roundSevenChildPair(roundSevenChildPair(callPair, 'enclosingStatement'), 'source');
    if (family === 'enclosing-deletionSource') return roundSevenChildPair(roundSevenChildPair(callPair, 'enclosingStatement'), 'deletionSource');
    const root = family === 'descriptor-fact-source' ? operationPair : callPair;
    return roundSevenFindNestedPair(root, (before, after) => {
      const beforeRecord = asRecord(before);
      const afterRecord = asRecord(after);
      if (family === 'parser-location') {
        return roundFiveIsLocation(beforeRecord?.location) && roundFiveIsLocation(afterRecord?.location);
      }
      if (family === 'parser-sourceLiteral') {
        return roundFiveIsLocation(beforeRecord?.sourceLiteral) && roundFiveIsLocation(afterRecord?.sourceLiteral);
      }
      if (family === 'parser-reference-source') {
        return typeof beforeRecord?.kind === 'string'
          && typeof beforeRecord.origin === 'string'
          && typeof beforeRecord.path === 'string'
          && roundFiveIsLocation(beforeRecord.source)
          && typeof afterRecord?.kind === 'string'
          && typeof afterRecord.origin === 'string'
          && typeof afterRecord.path === 'string'
          && roundFiveIsLocation(afterRecord.source);
      }
      return (beforeRecord?.status === 'known' || beforeRecord?.status === 'unavailable')
        && (afterRecord?.status === 'known' || afterRecord?.status === 'unavailable')
        && roundFiveIsLocation(beforeRecord.source)
        && roundFiveIsLocation(afterRecord.source);
    }) && (() => {
      const recordPair = roundSevenFindNestedPair(root, (before, after) => {
        const left = asRecord(before);
        const right = asRecord(after);
        if (family === 'parser-location') return roundFiveIsLocation(left?.location) && roundFiveIsLocation(right?.location);
        if (family === 'parser-sourceLiteral') return roundFiveIsLocation(left?.sourceLiteral) && roundFiveIsLocation(right?.sourceLiteral);
        if (family === 'parser-reference-source') return typeof left?.kind === 'string' && typeof left.path === 'string' && typeof left.origin === 'string'
          && roundFiveIsLocation(left.source) && typeof right?.kind === 'string' && typeof right.path === 'string'
          && typeof right.origin === 'string' && roundFiveIsLocation(right.source);
        return (left?.status === 'known' || left?.status === 'unavailable')
          && (right?.status === 'known' || right?.status === 'unavailable')
          && roundFiveIsLocation(left.source) && roundFiveIsLocation(right.source);
      });
      const key = family === 'parser-location' ? 'location'
        : family === 'parser-sourceLiteral' ? 'sourceLiteral'
          : 'source';
      return roundSevenChildPair(recordPair, key);
    })();
  };
  const roundSevenBoundaryFamilies: readonly RoundSevenBoundaryFamily[] = [
    'call-source',
    'operation-source',
    'enclosing-source',
    'enclosing-deletionSource',
    'parser-location',
    'parser-sourceLiteral',
    'parser-reference-source',
    'descriptor-fact-source',
  ];
  const roundSevenBoundaryEndRow = (
    prefix: 'D' | 'I',
    sourceInput: RoundFiveCorrespondenceInput,
    family: RoundSevenBoundaryFamily,
  ): void => roundSeven(`R7-F2-${prefix}-retained-end-at-anchor-${family}`, 'F2', `${prefix} retained ${family} END at splice anchor remains before the edit`, () => {
    const baseline = roundFiveCompare(sourceInput);
    const input = roundFiveCloneInput(sourceInput);
    const pair = roundSevenBoundaryLocationPair(input, family);
    const beforeLocation = asRecord(pair?.before.value);
    const afterLocation = asRecord(pair?.after.value);
    const beforeStart = asRecord(beforeLocation?.start);
    const afterStart = asRecord(afterLocation?.start);
    const beforeCompanionLocation = family === 'parser-sourceLiteral'
      ? asRecord(asRecord(pair?.before.owner)?.location)
      : undefined;
    const afterCompanionLocation = family === 'parser-sourceLiteral'
      ? asRecord(asRecord(pair?.after.owner)?.location)
      : undefined;
    const boundary = input.entry.startOffset;
    const mutationApplied = typeof beforeStart?.offset === 'number'
      && typeof afterStart?.offset === 'number'
      && beforeStart.offset <= boundary
      && afterStart.offset <= boundary
      && roundSevenSetLocationRange(beforeLocation, input.beforeText, beforeStart.offset, boundary)
      && roundSevenSetLocationRange(afterLocation, input.afterText, afterStart.offset, boundary)
      && (family !== 'parser-sourceLiteral'
        || (roundSevenSetLocationRange(beforeCompanionLocation, input.beforeText, beforeStart.offset, boundary)
          && roundSevenSetLocationRange(afterCompanionLocation, input.afterText, afterStart.offset, boundary)))
      && (family === 'operation-source' || family === 'descriptor-fact-source'
        || roundSevenMirrorCallLocationToRecords(
          input,
          pair,
          input.beforeText,
          beforeStart?.offset ?? -1,
          boundary,
          input.afterText,
          afterStart?.offset ?? -1,
          boundary,
        ))
      && (family === 'operation-source' || family === 'descriptor-fact-source'
        || family !== 'parser-sourceLiteral'
        || roundSevenMirrorCallLocationToRecords(
          input,
          pair,
          input.beforeText,
          beforeStart?.offset ?? -1,
          boundary,
          input.afterText,
          afterStart?.offset ?? -1,
          boundary,
          'location',
        ));
    const mutatedVerdict = mutationApplied ? roundFiveCompare(input) : false;
    return {
      pass: baseline && mutationApplied && mutatedVerdict,
      detail: { baseline, mutationApplied, mutatedVerdict, family, editKind: sourceInput.entry.kind, boundary },
    };
  });
  for (const family of roundSevenBoundaryFamilies) {
    roundSevenBoundaryEndRow('D', roundFiveDeletionInput, family);
    roundSevenBoundaryEndRow('I', roundFiveInsertionInput, family);
  }
  roundSeven('R7-F2-D-retained-start-at-deletion-end', 'F2', 'retained START exactly at deletion end maps to the first byte after deletion', () => {
    const baseline = roundFiveCompare(roundFiveDeletionInput);
    const input = roundFiveCloneInput(roundFiveDeletionInput);
    const pair = roundSevenBoundaryLocationPair(input, 'parser-reference-source');
    const beforeEnd = input.entry.endOffset;
    const afterStart = input.entry.startOffset + input.replacementLength;
    const mutationApplied = pair !== undefined
      && beforeEnd < input.beforeText.length
      && afterStart < input.afterText.length
      && roundSevenSetLocationRange(pair.before.value, input.beforeText, beforeEnd, beforeEnd + 1)
      && roundSevenSetLocationRange(pair.after.value, input.afterText, afterStart, afterStart + 1)
      && roundSevenMirrorCallLocationToRecords(
        input,
        pair,
        input.beforeText,
        beforeEnd,
        beforeEnd + 1,
        input.afterText,
        afterStart,
        afterStart + 1,
      );
    const mutatedVerdict = mutationApplied ? roundFiveCompare(input) : false;
    return { pass: baseline && mutationApplied && mutatedVerdict, detail: { baseline, mutationApplied, mutatedVerdict } };
  });
  roundSeven('R7-F2-I-retained-start-at-insertion-anchor', 'F2', 'retained START at insertion anchor shifts after inserted bytes', () => {
    const baseline = roundFiveCompare(roundFiveInsertionInput);
    const input = roundFiveCloneInput(roundFiveInsertionInput);
    const pair = roundSevenBoundaryLocationPair(input, 'parser-reference-source');
    const beforeStart = input.entry.startOffset;
    const afterStart = input.entry.startOffset + input.replacementLength;
    const mutationApplied = pair !== undefined
      && beforeStart < input.beforeText.length
      && afterStart < input.afterText.length
      && roundSevenSetLocationRange(pair.before.value, input.beforeText, beforeStart, beforeStart + 1)
      && roundSevenSetLocationRange(pair.after.value, input.afterText, afterStart, afterStart + 1)
      && roundSevenMirrorCallLocationToRecords(
        input,
        pair,
        input.beforeText,
        beforeStart,
        beforeStart + 1,
        input.afterText,
        afterStart,
        afterStart + 1,
      );
    const mutatedVerdict = mutationApplied ? roundFiveCompare(input) : false;
    return { pass: baseline && mutationApplied && mutatedVerdict, detail: { baseline, mutationApplied, mutatedVerdict } };
  });
  roundSeven('R7-F2-D-zero-width-start-at-deletion-end', 'F2', 'zero-width retained range at deletion end has after-splice START affinity', () => {
    const baseline = roundFiveCompare(roundFiveDeletionInput);
    const input = roundFiveCloneInput(roundFiveDeletionInput);
    const pair = roundSevenBoundaryLocationPair(input, 'parser-reference-source');
    const beforePoint = input.entry.endOffset;
    const afterPoint = input.entry.startOffset + input.replacementLength;
      const mutationApplied = pair !== undefined
      && roundSevenSetLocationRange(pair.before.value, input.beforeText, beforePoint, beforePoint)
      && roundSevenSetLocationRange(pair.after.value, input.afterText, afterPoint, afterPoint)
      && roundSevenMirrorCallLocationToRecords(
        input,
        pair,
        input.beforeText,
        beforePoint,
        beforePoint,
        input.afterText,
        afterPoint,
        afterPoint,
      );
    const mutatedVerdict = mutationApplied ? roundFiveCompare(input) : false;
    return { pass: baseline && mutationApplied && mutatedVerdict, detail: { baseline, mutationApplied, mutatedVerdict } };
  });
  roundSeven('R7-F2-I-zero-width-start-at-insertion-anchor', 'F2', 'zero-width retained range at insertion anchor has after-splice START affinity', () => {
    const baseline = roundFiveCompare(roundFiveInsertionInput);
    const input = roundFiveCloneInput(roundFiveInsertionInput);
    const pair = roundSevenBoundaryLocationPair(input, 'parser-reference-source');
    const beforePoint = input.entry.startOffset;
    const afterPoint = input.entry.startOffset + input.replacementLength;
      const mutationApplied = pair !== undefined
      && roundSevenSetLocationRange(pair.before.value, input.beforeText, beforePoint, beforePoint)
      && roundSevenSetLocationRange(pair.after.value, input.afterText, afterPoint, afterPoint)
      && roundSevenMirrorCallLocationToRecords(
        input,
        pair,
        input.beforeText,
        beforePoint,
        beforePoint,
        input.afterText,
        afterPoint,
        afterPoint,
      );
    const mutatedVerdict = mutationApplied ? roundFiveCompare(input) : false;
    return { pass: baseline && mutationApplied && mutatedVerdict, detail: { baseline, mutationApplied, mutatedVerdict } };
  });
  roundSeven('R7-F2-D-start-inside-deleted-interval', 'F2', 'START at deletion start remains unmappable for deleted content', () => {
    const baseline = roundFiveCompare(roundFiveDeletionInput);
    const input = roundFiveCloneInput(roundFiveDeletionInput);
    const pair = roundSevenBoundaryLocationPair(input, 'parser-reference-source');
    const afterStart = input.entry.startOffset + input.replacementLength;
    const mutationApplied = pair !== undefined
      && input.entry.endOffset > input.entry.startOffset
      && roundSevenSetLocationRange(pair.before.value, input.beforeText, input.entry.startOffset, input.entry.endOffset)
      && roundSevenSetLocationRange(pair.after.value, input.afterText, afterStart, afterStart);
    const mutatedVerdict = mutationApplied ? roundFiveCompare(input) : true;
    return { pass: baseline && mutationApplied && !mutatedVerdict, detail: { baseline, mutationApplied, mutatedVerdict } };
  });
  roundSeven('R7-F2-D-end-inside-deleted-interval', 'F2', 'END inside the deleted interval remains unmappable for overlap', () => {
    const baseline = roundFiveCompare(roundFiveDeletionInput);
    const input = roundFiveCloneInput(roundFiveDeletionInput);
    const pair = roundSevenBoundaryLocationPair(input, 'parser-reference-source');
    const beforeLocation = asRecord(pair?.before.value);
    const beforeStart = asRecord(beforeLocation?.start);
    const afterLocation = asRecord(pair?.after.value);
    const afterStart = asRecord(afterLocation?.start);
    const inside = input.entry.startOffset + 1;
    const mutationApplied = typeof beforeStart?.offset === 'number'
      && typeof afterStart?.offset === 'number'
      && inside < input.entry.endOffset
      && beforeStart.offset <= input.entry.startOffset
      && roundSevenSetLocationRange(beforeLocation, input.beforeText, beforeStart.offset, inside)
      && roundSevenSetLocationRange(afterLocation, input.afterText, afterStart.offset, input.entry.startOffset);
    const mutatedVerdict = mutationApplied ? roundFiveCompare(input) : true;
    return { pass: baseline && mutationApplied && !mutatedVerdict, detail: { baseline, mutationApplied, mutatedVerdict } };
  });

  interface RoundSevenAuditMatrixRow {
    readonly id: string;
    readonly family: 'order' | 'kernel';
    readonly name: string;
    readonly pass: boolean;
    readonly detail: string;
  }
  const roundSevenAuditRows: RoundSevenAuditMatrixRow[] = [];
  const roundSevenAudit = (
    id: string,
    family: RoundSevenAuditMatrixRow['family'],
    name: string,
    probe: () => { readonly pass: boolean; readonly detail?: unknown },
  ): void => {
    try {
      const result = probe();
      roundSevenAuditRows.push({ id, family, name, pass: result.pass, detail: causalDetail(result.detail) });
    } catch (error) {
      roundSevenAuditRows.push({
        id,
        family,
        name,
        pass: false,
        detail: causalDetail({ threw: true, error: error instanceof Error ? error.message : String(error) }),
      });
    }
  };

  interface RoundSevenAuditCorrespondenceInput extends RoundFiveCorrespondenceInput {
    readonly beforeRecords: readonly unknown[];
    readonly afterRecords: readonly unknown[];
  }
  const roundSevenAuditFile = (
    source: X4UiWorkspaceSource,
    path: string,
  ) => source.bundle?.sourceFiles.find(file => file.path === path);
  const roundSevenAuditInput = (
    before: SourceEditFixtureContext,
    after: SourceEditFixtureContext,
    entry: X4UiSourceEditStructuralEntry,
    replacementLength: number,
    insertedCallIndex = -1,
    insertedOperationIndex = -1,
  ): RoundSevenAuditCorrespondenceInput => {
    const beforeFile = roundSevenAuditFile(before.source, entry.path);
    const afterFile = roundSevenAuditFile(after.source, entry.path);
    if (!beforeFile || !afterFile) throw new Error('round-seven audit source file missing');
    return {
      beforeCalls: beforeFile.callModel.calls,
      afterCalls: afterFile.callModel.calls,
      beforeOperations: before.program.operations,
      afterOperations: after.program.operations,
      beforeRecords: beforeFile.callModel.records,
      afterRecords: afterFile.callModel.records,
      entry,
      beforeText: sourceText(before),
      afterText: sourceText(after),
      replacementLength,
      insertedCallIndex,
      insertedOperationIndex,
    };
  };
  const roundSevenAuditCompare = (input: RoundSevenAuditCorrespondenceInput): boolean =>
    compareX4UiSourceStructuralLedgerCorrespondence(
      input as unknown as Parameters<typeof compareX4UiSourceStructuralLedgerCorrespondence>[0],
    );
  const roundSevenAuditClone = (input: RoundSevenAuditCorrespondenceInput): RoundSevenAuditCorrespondenceInput => ({
    ...input,
    beforeCalls: structuredClone(input.beforeCalls),
    afterCalls: structuredClone(input.afterCalls),
    beforeOperations: structuredClone(input.beforeOperations),
    afterOperations: structuredClone(input.afterOperations),
    beforeRecords: structuredClone(input.beforeRecords),
    afterRecords: structuredClone(input.afterRecords),
  });
  const roundSevenAuditSourceRecords = (input: RoundSevenAuditCorrespondenceInput): {
    readonly before: readonly Record<string, unknown>[];
    readonly after: readonly Record<string, unknown>[];
  } => ({
    before: input.beforeRecords.map(value => asRecord(value)).filter((value): value is Record<string, unknown> => value !== undefined),
    after: input.afterRecords.map(value => asRecord(value)).filter((value): value is Record<string, unknown> => value !== undefined),
  });

  const propertyDeleteContext = contextFor(baseLua);
  const propertyDeleteCatalog = catalogFor(propertyDeleteContext);
  const propertyDeleteEntry = structuralDelete(propertyDeleteCatalog, entry => entry.callBindings.length === 1
    && entry.callBindings[0].callName === 'createText');
  const propertyDeleteBefore = sourceText(propertyDeleteContext);
  const propertyDeleteAfter = propertyDeleteBefore.slice(0, propertyDeleteEntry.startOffset)
    + propertyDeleteBefore.slice(propertyDeleteEntry.endOffset);
  const propertyDeleteAfterContext = contextFor(propertyDeleteAfter);
  const propertyDeleteInput = roundSevenAuditInput(
    propertyDeleteContext,
    propertyDeleteAfterContext,
    propertyDeleteEntry,
    0,
  );
  const propertyDeleteResult = structuralApply(
    propertyDeleteContext,
    propertyDeleteCatalog,
    propertyDeleteEntry,
    undefined,
    {
      path: propertyDeleteEntry.path,
      startOffset: propertyDeleteEntry.startOffset,
      endOffset: propertyDeleteEntry.endOffset,
      expectedText: propertyDeleteBefore.slice(propertyDeleteEntry.startOffset, propertyDeleteEntry.endOffset),
    },
  );
  roundSevenAudit('R7-AUDIT-F1-createText-property-delete-public', 'order', 'valid property-bearing createText deletion accepts through public discover/apply with exact CAS and 4/4/0 post-reparse authority', () => {
    const afterProjection = projectedProgramFor(propertyDeleteAfterContext.source);
    const afterFile = roundSevenAuditFile(propertyDeleteAfterContext.source, propertyDeleteEntry.path);
    const recordTypes = propertyDeleteInput.beforeRecords.map(value => asRecord(value)?.recordType);
    const exactCas = propertyDeleteEntry.expectedText
      === propertyDeleteBefore.slice(propertyDeleteEntry.startOffset, propertyDeleteEntry.endOffset)
      && propertyDeleteEntry.startOffset < propertyDeleteEntry.endOffset
      && propertyDeleteEntry.endOffset <= propertyDeleteBefore.length;
    const baselineProjected = propertyDeleteContext.program.status === 'projected'
      && isIssuedX4UiLayoutEvidencePairForModel(
        propertyDeleteContext.program,
        propertyDeleteContext.evidenceAuthority,
        propertyDeleteContext.source.bundle?.sourceFiles.find(file => file.path === propertyDeleteEntry.path)?.callModel,
      );
    const afterCalls = afterFile?.callModel.calls.length;
    const afterOperations = afterProjection?.program.operations.length;
    const afterGaps = afterProjection?.program.gaps.length;
    return {
      pass: propertyDeleteCatalog.status === 'ready'
        && propertyDeleteEntry.callBindings.length === 1
        && propertyDeleteEntry.callBindings[0].callName === 'createText'
        && recordTypes.includes('property')
        && baselineProjected
        && exactCas
        && propertyDeleteResult.accepted === true
        && propertyDeleteResult.reparsed
        && roundSevenAuditCompare(propertyDeleteInput)
        && afterCalls === 4
        && afterOperations === 4
        && afterGaps === 0,
      detail: {
        entryIssued: propertyDeleteCatalog.status === 'ready',
        callBindings: propertyDeleteEntry.callBindings.map(binding => binding.callName),
        recordTypes,
        baselineProjected,
        exactCas,
        accepted: propertyDeleteResult.accepted,
        reason: structuralResultReason(propertyDeleteResult),
        detail: structuralResultDetail(propertyDeleteResult),
        oracle: roundSevenAuditCompare(propertyDeleteInput),
        afterCalls,
        afterOperations,
        afterGaps,
      },
    };
  });

  const completeRecordLua = [
    'local menu = { name = "Complete records", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local table = frame:addTable(1, { width = 80, scaling = false })',
    'local row = table:addRow(false, {})',
    'row[1]:createText("recorded", { width = 20, scaling = true })',
    'local frameAlias = frame',
    'frame.onClick = function() end',
    'frame:display()',
    '',
  ].join('\n');
  const completeRecordInsertionLua = [
    'local menu = { name = "Complete insertion records", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local table = frame:addTable(1, { width = 80, scaling = false })',
    'table:addRow(false, {})[1]:createText("recorded", { width = 20, scaling = true })',
    'local frameAlias = frame',
    'frame.onClick = function() end',
    'frame:display()',
    '',
  ].join('\n');
  let completeRecordContext: SourceEditFixtureContext | undefined;
  let completeRecordCatalog: X4UiSourceEditCatalog | undefined;
  let completeRecordEntry: X4UiSourceEditDeleteEntry | undefined;
  let completeRecordInput: RoundSevenAuditCorrespondenceInput | undefined;
  let completeRecordResult: ReturnType<typeof applyX4UiSourceStructuralEdit> | undefined;
  try {
    completeRecordContext = contextFor(completeRecordLua);
    completeRecordCatalog = catalogFor(completeRecordContext);
    completeRecordEntry = structuralDelete(completeRecordCatalog, entry => entry.callBindings.length === 1
      && entry.callBindings[0].callName === 'createText');
    const afterText = sourceText(completeRecordContext).slice(0, completeRecordEntry.startOffset)
      + sourceText(completeRecordContext).slice(completeRecordEntry.endOffset);
    const afterContext = contextFor(afterText);
    completeRecordInput = roundSevenAuditInput(
      completeRecordContext,
      afterContext,
      completeRecordEntry,
      0,
    );
    completeRecordResult = structuralApply(completeRecordContext, completeRecordCatalog, completeRecordEntry);
  } catch {
    completeRecordContext = undefined;
  }
  roundSevenAudit('R7-AUDIT-F1-complete-property-handler-alias-order', 'order', 'property, handler, and alias records remain an independently ordered complete-record stream across fluent-source deletion', () => {
    const types = completeRecordInput?.beforeRecords.map(value => asRecord(value)?.recordType) || [];
    const oracle = completeRecordInput ? roundSevenAuditCompare(completeRecordInput) : false;
    return {
      pass: completeRecordContext !== undefined
        && completeRecordCatalog?.status === 'ready'
        && types.includes('property')
        && types.includes('handler')
        && types.includes('alias')
        && completeRecordEntry !== undefined
        && completeRecordResult?.accepted === true
        && oracle,
      detail: {
        recordTypes: types,
        entryIssued: completeRecordEntry !== undefined,
        accepted: completeRecordResult?.accepted,
        reason: completeRecordResult ? structuralResultReason(completeRecordResult) : undefined,
        detail: completeRecordResult ? structuralResultDetail(completeRecordResult) : undefined,
        oracle,
      },
    };
  });

  let completeRecordInsertionInput: RoundSevenAuditCorrespondenceInput | undefined;
  let completeRecordInsertionResult: ReturnType<typeof applyX4UiSourceStructuralEdit> | undefined;
  let completeRecordInsertionEntry: X4UiSourceEditInsertionEntry | undefined;
  let completeRecordInsertionContext: SourceEditFixtureContext | undefined;
  let completeRecordInsertionCatalog: X4UiSourceEditCatalog | undefined;
  try {
    completeRecordInsertionContext = contextFor(completeRecordInsertionLua);
    completeRecordInsertionCatalog = catalogFor(completeRecordInsertionContext);
    completeRecordInsertionEntry = structuralInsert(completeRecordInsertionCatalog, 'first-row');
    const insertionReplacement = `${completeRecordInsertionEntry.indentation}${firstRowPayload}${completeRecordInsertionEntry.lineEnding}`;
    const afterText = sourceText(completeRecordInsertionContext).slice(0, completeRecordInsertionEntry.startOffset)
      + insertionReplacement
      + sourceText(completeRecordInsertionContext).slice(completeRecordInsertionEntry.startOffset);
    const afterContext = contextFor(afterText);
    const afterFile = roundSevenAuditFile(afterContext.source, completeRecordInsertionEntry.path);
    const insertedStart = completeRecordInsertionEntry.startOffset + completeRecordInsertionEntry.indentation.length;
    const insertedEnd = completeRecordInsertionEntry.startOffset + insertionReplacement.length;
    const insertedCallIndex = afterFile?.callModel.calls.findIndex(call => call.name === 'addRow'
      && call.source.start.offset >= insertedStart
      && call.source.end.offset <= insertedEnd) ?? -1;
    const afterProjection = projectedProgramFor(afterContext.source);
    const insertedOperationIndex = afterProjection?.program.operations.findIndex(operation => operation.kind === 'addRow'
      && operation.source.start.offset >= insertedStart
      && operation.source.end.offset <= insertedEnd) ?? -1;
    completeRecordInsertionInput = roundSevenAuditInput(
      completeRecordInsertionContext,
      afterContext,
      completeRecordInsertionEntry,
      insertionReplacement.length,
      insertedCallIndex,
      insertedOperationIndex,
    );
    completeRecordInsertionResult = structuralApply(
      completeRecordInsertionContext,
      completeRecordInsertionCatalog,
      completeRecordInsertionEntry,
      firstRowPayload,
    );
  } catch {
    completeRecordInsertionInput = undefined;
  }
  roundSevenAudit('R7-AUDIT-F1-insertion-before-complete-records', 'order', 'insertion before property/handler/alias records derives order shift from the complete stream', () => {
    const records = completeRecordInsertionInput ? roundSevenAuditSourceRecords(completeRecordInsertionInput) : undefined;
    const types = records?.before.map(record => record.recordType) || [];
    const oracle = completeRecordInsertionInput ? roundSevenAuditCompare(completeRecordInsertionInput) : false;
    return {
      pass: completeRecordInsertionEntry !== undefined
        && completeRecordInsertionInput !== undefined
        && types.includes('property')
        && types.includes('handler')
        && types.includes('alias')
        && completeRecordInsertionResult?.accepted === true
        && oracle,
      detail: {
        entryIssued: completeRecordInsertionEntry !== undefined,
        recordTypes: types,
        accepted: completeRecordInsertionResult?.accepted,
        reason: completeRecordInsertionResult ? structuralResultReason(completeRecordInsertionResult) : undefined,
        detail: completeRecordInsertionResult ? structuralResultDetail(completeRecordInsertionResult) : undefined,
        oracle,
      },
    };
  });

  const fluentPropertyLua = [
    'local menu = { name = "Fluent property", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local table = frame:addTable(1, {})',
    'local row = table:addRow(false, {})',
    'row[1]:createText("fluent", { width = 20, scaling = true }):setColSpan(1)',
    'frame:display()',
    '',
  ].join('\n');
  let fluentPropertyInput: RoundSevenAuditCorrespondenceInput | undefined;
  let fluentPropertyResult: ReturnType<typeof applyX4UiSourceStructuralEdit> | undefined;
  try {
    const before = contextFor(fluentPropertyLua);
    const catalog = catalogFor(before);
    const entry = structuralDelete(catalog, candidate => candidate.callBindings.length === 2
      && candidate.callBindings.some(binding => binding.callName === 'createText')
      && candidate.callBindings.some(binding => binding.callName === 'setColSpan'));
    const after = contextFor(sourceText(before).slice(0, entry.startOffset) + sourceText(before).slice(entry.endOffset));
    fluentPropertyInput = roundSevenAuditInput(before, after, entry, 0);
    fluentPropertyResult = structuralApply(before, catalog, entry);
  } catch {
    fluentPropertyInput = undefined;
  }
  roundSevenAudit('R7-AUDIT-F1-fluent-property-delete', 'order', 'fluent property-bearing deletion removes its complete statement and preserves downstream order', () => {
    const oracle = fluentPropertyInput ? roundSevenAuditCompare(fluentPropertyInput) : false;
    return {
      pass: fluentPropertyInput !== undefined && fluentPropertyResult?.accepted === true && oracle,
      detail: {
        accepted: fluentPropertyResult?.accepted,
        reason: fluentPropertyResult ? structuralResultReason(fluentPropertyResult) : undefined,
        detail: fluentPropertyResult ? structuralResultDetail(fluentPropertyResult) : undefined,
        oracle,
      },
    };
  });

  const roundSevenAuditNegative = (
    id: string,
    name: string,
    mutate: (input: RoundSevenAuditCorrespondenceInput) => boolean,
  ): void => roundSevenAudit(id, 'order', name, () => {
    const baseline = roundSevenAuditCompare(propertyDeleteInput);
    const input = roundSevenAuditClone(propertyDeleteInput);
    const mutationApplied = mutate(input);
    let threw = false;
    let comparator = false;
    try {
      comparator = roundSevenAuditCompare(input);
    } catch {
      threw = true;
    }
    return {
      pass: baseline && mutationApplied && !threw && !comparator,
      detail: { baseline, mutationApplied, comparator, threw },
    };
  });
  roundSevenAuditNegative('R7-AUDIT-F2-coherent-fake-order', 'coherent fake complete-record order changes are rejected', input => {
    const records = input.afterRecords as unknown[];
    if (records.length < 2) return false;
    records.reverse();
    records.forEach((value, index) => {
      const record = asRecord(value);
      if (record) record.order = index;
    });
    return true;
  });
  roundSevenAuditNegative('R7-AUDIT-F2-missing-complete-record', 'missing complete records are rejected', input => {
    const records = input.afterRecords as unknown[];
    const index = records.findIndex(value => asRecord(value)?.recordType !== 'call');
    if (index < 0) return false;
    records.splice(index, 1);
    return true;
  });
  roundSevenAuditNegative('R7-AUDIT-F2-extra-complete-record', 'extra complete records are rejected', input => {
    const records = input.afterRecords as unknown[];
    if (records.length === 0) return false;
    records.push(structuredClone(records[records.length - 1]));
    return true;
  });
  roundSevenAuditNegative('R7-AUDIT-F2-reordered-complete-record', 'reordered complete records are rejected', input => {
    const records = input.afterRecords as unknown[];
    if (records.length < 2) return false;
    const first = records[0];
    records[0] = records[1];
    records[1] = first;
    return true;
  });
  roundSevenAuditNegative('R7-AUDIT-F2-call-operation-model-order-disagreement', 'call and operation modelOrder disagreement is rejected', input => {
    const operations = input.afterOperations as unknown[];
    const operation = operations.find(value => asRecord(value)?.kind === 'display') || operations[0];
    const record = asRecord(operation);
    if (!record || typeof record.modelOrder !== 'number') return false;
    record.modelOrder += 1;
    return true;
  });

  interface RoundSevenRetainedPayloadAuditRow {
    readonly id: string;
    readonly recordType: 'property' | 'handler' | 'alias';
    readonly field: string;
    readonly pass: boolean;
    readonly baseline: boolean;
    readonly mutationApplied: boolean;
    readonly comparator: boolean;
    readonly threw: boolean;
    readonly observationPass: boolean;
    readonly detail: string;
  }
  const retainedPayloadRows: RoundSevenRetainedPayloadAuditRow[] = [];
  const retainedPayloadRecord = (
    input: RoundSevenAuditCorrespondenceInput,
    recordType: RoundSevenRetainedPayloadAuditRow['recordType'],
  ): Record<string, unknown> | undefined => (input.afterRecords as readonly unknown[])
    .map(value => asRecord(value))
    .find(value => value?.recordType === recordType);
  const retainedPayloadAlternateSource = (
    input: RoundSevenAuditCorrespondenceInput,
    record: Record<string, unknown>,
  ): Record<string, unknown> | undefined => {
    const source = asRecord(record.source);
    const sourceStart = asRecord(source?.start);
    const sourceOffset = sourceStart?.offset;
    return (input.afterRecords as readonly unknown[])
      .map(value => asRecord(asRecord(value)?.source))
      .find(candidate => {
        const candidateStart = asRecord(candidate?.start);
        return candidate !== undefined
          && candidateStart?.offset !== sourceOffset;
      });
  };
  const retainedPayloadAudit = (
    id: string,
    recordType: RoundSevenRetainedPayloadAuditRow['recordType'],
    field: string,
    mutate: (record: Record<string, unknown>, input: RoundSevenAuditCorrespondenceInput) => boolean,
    sourceInput: RoundSevenAuditCorrespondenceInput | undefined = completeRecordInput,
    observations: () => boolean = () => true,
  ): void => {
    let baseline = false;
    let mutationApplied = false;
    let comparator = false;
    let threw = false;
    let observationPass = false;
    try {
      if (!sourceInput) throw new Error('complete-record public deletion input missing');
      const input = roundSevenAuditClone(sourceInput);
      baseline = roundSevenAuditCompare(input);
      const record = retainedPayloadRecord(input, recordType);
      mutationApplied = record !== undefined && mutate(record, input);
      try {
        comparator = roundSevenAuditCompare(input);
      } catch {
        threw = true;
      }
      observationPass = observations();
    } catch {
      threw = true;
      observationPass = false;
    }
    const pass = baseline && mutationApplied && !threw && !comparator && observationPass;
    retainedPayloadRows.push({
      id,
      recordType,
      field,
      pass,
      baseline,
      mutationApplied,
      comparator,
      threw,
      observationPass,
      detail: causalDetail({ baseline, mutationApplied, comparator, threw, observationPass }),
    });
  };
  const mutateString = (record: Record<string, unknown>, key: string): boolean => {
    const value = record[key];
    if (typeof value !== 'string') return false;
    record[key] = `${value}_FAKE`;
    return true;
  };
  const mutateNestedValueString = (record: Record<string, unknown>, key: string): boolean => {
    const value = asRecord(record.value);
    if (!value || typeof value[key] !== 'string') return false;
    value[key] = `${value[key]}_FAKE`;
    return true;
  };
  const mutateNestedValueLocation = (record: Record<string, unknown>): boolean => {
    const value = asRecord(record.value);
    const source = asRecord(record.source);
    if (!value || !source) return false;
    value.location = structuredClone(source);
    return true;
  };
  const mutateNestedValueSourceLiteral = (record: Record<string, unknown>): boolean => {
    const value = asRecord(record.value);
    const source = asRecord(record.source);
    if (!value || !source || !Object.prototype.hasOwnProperty.call(value, 'sourceLiteral')) return false;
    value.sourceLiteral = structuredClone(source);
    return true;
  };
  const mutateNestedValueField = (record: Record<string, unknown>, key: string): boolean => {
    const value = asRecord(record.value);
    if (!value || typeof value[key] !== 'string') return false;
    value[key] = `${value[key]}_FAKE`;
    return true;
  };
  const mutateContextReachability = (record: Record<string, unknown>): boolean => {
    const context = asRecord(record.context);
    if (!context || !['reachable', 'conditional', 'unreachable'].includes(String(context.reachability))) return false;
    context.reachability = context.reachability === 'reachable' ? 'conditional' : 'reachable';
    return true;
  };
  const mutateContextLocation = (record: Record<string, unknown>): boolean => {
    const context = asRecord(record.context);
    const source = asRecord(record.source);
    if (!context || !source) return false;
    context.source = structuredClone(source);
    return true;
  };
  const mutateSourceLocation = (
    record: Record<string, unknown>,
    input: RoundSevenAuditCorrespondenceInput,
  ): boolean => {
    const alternate = retainedPayloadAlternateSource(input, record);
    if (!alternate) return false;
    record.source = structuredClone(alternate);
    return true;
  };
  const mutateSourceOrder = (record: Record<string, unknown>): boolean => {
    const source = asRecord(record.source);
    const start = asRecord(source?.start)?.offset;
    const end = asRecord(source?.end)?.offset;
    const current = record.sourceOrder;
    if (typeof start !== 'number' || typeof end !== 'number' || typeof current !== 'number') return false;
    const replacement = current === start ? end : start;
    if (replacement === current || replacement < start || replacement > end) return false;
    record.sourceOrder = replacement;
    return true;
  };

  retainedPayloadAudit('R8B-RET-PROPERTY-path', 'property', 'path', record => mutateString(record, 'path'));
  retainedPayloadAudit('R8B-RET-PROPERTY-name', 'property', 'name', record => mutateString(record, 'name'));
  retainedPayloadAudit('R8B-RET-PROPERTY-record-type', 'property', 'recordType', record => {
    record.recordType = 'handler';
    return true;
  });
  retainedPayloadAudit('R8B-RET-PROPERTY-value-expression', 'property', 'value.expression', record => mutateNestedValueString(record, 'expression'));
  retainedPayloadAudit('R8B-RET-PROPERTY-value-status', 'property', 'value.status', record => mutateNestedValueField(record, 'status'));
  retainedPayloadAudit('R8B-RET-PROPERTY-value-type', 'property', 'value.type', record => mutateNestedValueField(record, 'type'));
  retainedPayloadAudit('R8B-RET-PROPERTY-value-location', 'property', 'value.location', record => mutateNestedValueLocation(record));
  retainedPayloadAudit('R8B-RET-PROPERTY-value-source-literal', 'property', 'value.sourceLiteral', record => mutateNestedValueSourceLiteral(record));
  retainedPayloadAudit('R8B-RET-PROPERTY-owner-payload', 'property', 'owner', record => {
    const value = asRecord(record.value);
    if (!value) return false;
    record.owner = structuredClone(value);
    return true;
  });
  retainedPayloadAudit('R8B-RET-PROPERTY-owner-undefined', 'property', 'owner(undefined)', record => {
    record.owner = undefined;
    return true;
  });
  retainedPayloadAudit('R8B-RET-PROPERTY-assignment', 'property', 'assignment', record => {
    if (!['table-field', 'member-assignment', 'index-assignment', 'function-declaration'].includes(String(record.assignment))) return false;
    record.assignment = record.assignment === 'table-field' ? 'member-assignment' : 'table-field';
    return true;
  });
  retainedPayloadAudit('R8B-RET-PROPERTY-context-reachability', 'property', 'context.reachability', record => mutateContextReachability(record));
  retainedPayloadAudit('R8B-RET-PROPERTY-context-source', 'property', 'context.source', record => mutateContextLocation(record));
  retainedPayloadAudit('R8B-RET-PROPERTY-unknown-extra', 'property', 'unknown extra key', record => {
    record.__retainedPayloadFake = true;
    return true;
  });
  retainedPayloadAudit('R8B-RET-PROPERTY-missing-required', 'property', 'missing value', record => {
    if (!Object.prototype.hasOwnProperty.call(record, 'value')) return false;
    delete record.value;
    return true;
  });
  retainedPayloadAudit('R8B-RET-PROPERTY-wrong-type', 'property', 'value wrong type', record => {
    record.value = 'not-a-parser-value';
    return true;
  });
  retainedPayloadAudit('R8B-RET-HANDLER-path', 'handler', 'path', record => mutateString(record, 'path'));
  retainedPayloadAudit('R8B-RET-HANDLER-value-expression', 'handler', 'value.expression', record => mutateNestedValueString(record, 'expression'));
  retainedPayloadAudit('R8B-RET-HANDLER-function-source', 'handler', 'functionSource', record => {
    const source = asRecord(record.source);
    if (!source) return false;
    record.functionSource = structuredClone(source);
    return true;
  });
  retainedPayloadAudit('R8B-RET-HANDLER-body-source', 'handler', 'bodySource', record => {
    const source = asRecord(record.source);
    if (!source) return false;
    record.bodySource = structuredClone(source);
    return true;
  });
  retainedPayloadAudit('R8B-RET-HANDLER-parameters', 'handler', 'parameters', record => {
    const parameters = record.parameters;
    if (!Array.isArray(parameters)) return false;
    record.parameters = [...parameters, '__fake_parameter'];
    return true;
  });
  retainedPayloadAudit('R8B-RET-HANDLER-context-reachability', 'handler', 'context.reachability', record => mutateContextReachability(record));
  retainedPayloadAudit('R8B-RET-HANDLER-context-source', 'handler', 'context.source', record => mutateContextLocation(record));
  retainedPayloadAudit('R8B-RET-HANDLER-unknown-extra', 'handler', 'unknown extra key', record => {
    record.__retainedPayloadFake = true;
    return true;
  });
  retainedPayloadAudit('R8B-RET-HANDLER-missing-required', 'handler', 'missing path', record => {
    if (!Object.prototype.hasOwnProperty.call(record, 'path')) return false;
    delete record.path;
    return true;
  });
  retainedPayloadAudit('R8B-RET-HANDLER-wrong-type', 'handler', 'context wrong type', record => {
    record.context = 'not-a-call-context';
    return true;
  });
  retainedPayloadAudit('R8B-RET-ALIAS-value-expression', 'alias', 'value.expression', record => mutateNestedValueString(record, 'expression'));
  retainedPayloadAudit('R8B-RET-ALIAS-alias-kind', 'alias', 'aliasKind', record => {
    if (!['definition', 'assignment'].includes(String(record.aliasKind))) return false;
    record.aliasKind = record.aliasKind === 'definition' ? 'assignment' : 'definition';
    return true;
  });
  retainedPayloadAudit('R8B-RET-ALIAS-context-reachability', 'alias', 'context.reachability', record => mutateContextReachability(record));
  retainedPayloadAudit('R8B-RET-ALIAS-context-source', 'alias', 'context.source', record => mutateContextLocation(record));
  retainedPayloadAudit('R8B-RET-ALIAS-unknown-extra', 'alias', 'unknown extra key', record => {
    record.__retainedPayloadFake = true;
    return true;
  });
  retainedPayloadAudit('R8B-RET-ALIAS-missing-required', 'alias', 'missing value', record => {
    if (!Object.prototype.hasOwnProperty.call(record, 'value')) return false;
    delete record.value;
    return true;
  });
  retainedPayloadAudit('R8B-RET-ALIAS-wrong-type', 'alias', 'aliasKind wrong type', record => {
    record.aliasKind = 7;
    return true;
  });
  retainedPayloadAudit('R8B-RET-ALL-source', 'property', 'source', (record, input) => mutateSourceLocation(record, input));
  retainedPayloadAudit('R8B-RET-ALL-sourceOrder', 'property', 'sourceOrder', record => mutateSourceOrder(record));
  retainedPayloadAudit('R8B-RET-ALL-order', 'property', 'order', record => {
    if (typeof record.order !== 'number') return false;
    record.order += 1;
    return true;
  });
  retainedPayloadAudit('R8B-RET-ALL-coherent-payload', 'property', 'path and value.expression', record => {
    const path = mutateString(record, 'path');
    const expression = mutateNestedValueString(record, 'expression');
    return path && expression;
  });
  retainedPayloadAudit(
    'R8B-RET-ALL-second-path-name-value',
    'property',
    'second public deletion path/name value.expression',
    record => mutateNestedValueString(record, 'expression'),
    fluentPropertyInput,
  );

  let retainedRecordAccessorReads = 0;
  retainedPayloadAudit(
    'R8B-RET-BOUNDARY-accessor',
    'property',
    'value accessor/getter',
    record => {
      const value = asRecord(record.value);
      if (!value) return false;
      Object.defineProperty(value, 'expression', {
        enumerable: true,
        configurable: true,
        get: () => {
          retainedRecordAccessorReads += 1;
          return 'getter-value';
        },
      });
      return true;
    },
    completeRecordInput,
    () => retainedRecordAccessorReads === 0,
  );
  retainedPayloadAudit('R8B-RET-BOUNDARY-custom-prototype', 'handler', 'value custom prototype', record => {
    const value = asRecord(record.value);
    if (!value) return false;
    record.value = Object.assign(Object.create({ inherited: true }), value);
    return true;
  });
  retainedPayloadAudit('R8B-RET-BOUNDARY-cycle', 'alias', 'context cycle', record => {
    const context = asRecord(record.context);
    if (!context) return false;
    context.__cycle = context;
    return true;
  });
  retainedPayloadAudit('R8B-RET-BOUNDARY-symbol', 'property', 'value symbol', record => {
    const value = asRecord(record.value);
    if (!value) return false;
    Object.defineProperty(value, Symbol('retainedPayload'), { enumerable: true, value: true });
    return true;
  });
  retainedPayloadAudit('R8B-RET-BOUNDARY-non-enumerable', 'handler', 'value non-enumerable', record => {
    const value = asRecord(record.value);
    if (!value) return false;
    Object.defineProperty(value, '__hidden', { enumerable: false, value: true });
    return true;
  });

  const roundSevenAuditKernelCoherentMutation = (
    input: RoundFiveCorrespondenceInput,
    mutate: (state: Record<string, unknown>) => boolean,
  ): { readonly mutationApplied: boolean; readonly comparator: boolean; readonly threw: boolean } => {
    const candidate = roundFiveCloneInput(input);
    let mutationApplied = false;
    for (const operation of [...candidate.beforeOperations, ...candidate.afterOperations]) {
      const kernel = asRecord(asRecord(operation)?.kernel);
      if (!kernel) continue;
      for (const key of ['stateBefore', 'stateAfter'] as const) {
        const state = asRecord(kernel[key]);
        if (state && mutate(state)) mutationApplied = true;
      }
    }
    let comparator = false;
    let threw = false;
    try {
      comparator = roundFiveCompare(candidate);
    } catch {
      threw = true;
    }
    return { mutationApplied, comparator, threw };
  };
  const roundSevenAuditKernelRow = (
    id: string,
    name: string,
    mutate: (state: Record<string, unknown>) => boolean,
  ): void => roundSevenAudit(id, 'kernel', name, () => {
    const baseline = roundFiveCompare(roundFiveInsertionInput);
    const outcome = roundSevenAuditKernelCoherentMutation(roundFiveInsertionInput, mutate);
    return {
      pass: baseline && outcome.mutationApplied && !outcome.threw && !outcome.comparator,
      detail: { baseline, ...outcome },
    };
  });
  roundSevenAuditKernelRow('R7-AUDIT-F3-kernel-root-closed-state', 'real producer kernel state rejects an unexpected root field', state => {
    if (Object.prototype.hasOwnProperty.call(state, '__roundSevenKernelUnexpected')) return false;
    state.__roundSevenKernelUnexpected = true;
    return true;
  });

  const roundSevenKernelIdentityInput = (context: SourceEditFixtureContext): RoundFiveCorrespondenceInput => {
    const file = roundSevenAuditFile(context.source, propertyDeleteEntry.path);
    if (!file) throw new Error('round-seven kernel source file missing');
    const beforeText = sourceText(context);
    const entry = structuredClone(propertyDeleteEntry) as unknown as Record<string, unknown>;
    entry.startOffset = beforeText.length;
    entry.endOffset = beforeText.length;
    entry.expectedText = '';
    entry.callBindings = [];
    return {
      beforeCalls: file.callModel.calls,
      afterCalls: structuredClone(file.callModel.calls),
      beforeRecords: file.callModel.records,
      afterRecords: structuredClone(file.callModel.records),
      beforeOperations: context.program.operations,
      afterOperations: structuredClone(context.program.operations),
      entry: entry as unknown as X4UiSourceEditStructuralEntry,
      beforeText,
      afterText: beforeText,
      replacementLength: 0,
      insertedCallIndex: -1,
      insertedOperationIndex: -1,
    };
  };
  const roundSevenKernelRefusalOnlyContext = contextFor([
    'local menu = { name = "Kernel refusal only", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local table = frame:addTable(0, {})',
    'frame:display()',
    '',
  ].join('\n'));
  const roundSevenKernelStateRefusalContext = contextFor([
    'local menu = { name = "Kernel state refusal", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local table = frame:addTable(1, { width = 80, reservescrollbar = true })',
    'local row = table:addRow(false, {})',
    'row[1]:createText("refusal", {})',
    'row[1]:setColSpan(0)',
    'frame:display()',
    '',
  ].join('\n'));
  const roundSevenKernelDiagnosticsContext = contextFor([
    'local menu = { name = "Kernel diagnostics", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local table = frame:addTable(1, { width = 80, reservescrollbar = true })',
    'local row = table:addRow(false, {})',
    'row[1]:createText("diagnostic", {})',
    'row[1]:setColSpan(2)',
    'frame:display()',
    '',
  ].join('\n'));
  const roundSevenKernelRefusalOnlyInput = roundSevenKernelIdentityInput(roundSevenKernelRefusalOnlyContext);
  const roundSevenKernelStateRefusalInput = roundSevenKernelIdentityInput(roundSevenKernelStateRefusalContext);
  const roundSevenKernelDiagnosticsInput = roundSevenKernelIdentityInput(roundSevenKernelDiagnosticsContext);
  interface RoundSevenKernelMatrixRow {
    readonly id: string;
    readonly name: string;
    readonly pass: boolean;
    readonly detail: string;
  }
  const roundSevenKernelRows: RoundSevenKernelMatrixRow[] = [];
  const roundSevenKernelOperation = (
    input: RoundFiveCorrespondenceInput,
    kind: string,
    mutate: (kernel: Record<string, unknown>) => boolean,
  ): boolean => {
    const operation = (input.afterOperations as readonly unknown[]).find(value => asRecord(value)?.kind === kind);
    const kernel = asRecord(asRecord(operation)?.kernel);
    return kernel ? mutate(kernel) : false;
  };
  const roundSevenKernelStateMutation = (
    input: RoundFiveCorrespondenceInput,
    kind: string,
    stateKey: 'stateBefore' | 'stateAfter',
    mutate: (state: Record<string, unknown>) => boolean,
  ): boolean => roundSevenKernelOperation(input, kind, kernel => {
    const state = asRecord(kernel[stateKey]);
    return state ? mutate(state) : false;
  });
  const roundSevenKernelRow = (
    id: string,
    name: string,
    input: RoundFiveCorrespondenceInput,
    mutate: (candidate: RoundFiveCorrespondenceInput) => boolean,
    observe?: () => number,
    observeTrap?: () => string | undefined,
    observationAccepted?: (observations: number | undefined, trap: string | undefined) => boolean,
  ): void => {
    try {
      const baseline = roundFiveCompare(input);
      const candidate = roundFiveCloneInput(input);
      const mutationApplied = mutate(candidate);
      let comparator = false;
      let threw = false;
      try {
        comparator = roundFiveCompare(candidate);
      } catch {
        threw = true;
      }
      const observations = observe?.();
      const trap = observeTrap?.();
      const observationPass = observationAccepted
        ? observationAccepted(observations, trap)
        : observations === undefined || observations === 0;
      const pass = baseline
        && mutationApplied
        && !threw
        && !comparator
        && observationPass;
      roundSevenKernelRows.push({
        id,
        name,
        pass,
        detail: causalDetail({ baseline, mutationApplied, comparator, threw, observations, trap }),
      });
    } catch (error) {
      roundSevenKernelRows.push({
        id,
        name,
        pass: false,
        detail: causalDetail({ threw: true, error: error instanceof Error ? error.message : String(error) }),
      });
    }
  };
  const roundSevenKernelSet = (record: Record<string, unknown>, key: string, value: unknown): boolean => {
    if (Object.prototype.hasOwnProperty.call(record, key)) return false;
    record[key] = value;
    return true;
  };
  const roundSevenKernelReplace = (record: Record<string, unknown>, key: string, value: unknown): boolean => {
    if (!Object.prototype.hasOwnProperty.call(record, key)) return false;
    record[key] = value;
    return true;
  };
  const roundSevenKernelDelete = (record: Record<string, unknown>, key: string): boolean => {
    if (!Object.prototype.hasOwnProperty.call(record, key)) return false;
    return delete record[key];
  };
  const roundSevenKernelStateField = (
    input: RoundFiveCorrespondenceInput,
    kind: string,
    stateKey: 'stateBefore' | 'stateAfter',
    field: string,
    value: unknown,
  ): boolean => roundSevenKernelStateMutation(input, kind, stateKey, state =>
    roundSevenKernelReplace(state, field, value));
  const roundSevenKernelNestedRecord = (
    input: RoundFiveCorrespondenceInput,
    kind: string,
    stateKey: 'stateBefore' | 'stateAfter',
    field: string,
    mutate: (record: Record<string, unknown>) => boolean,
  ): boolean => roundSevenKernelStateMutation(input, kind, stateKey, state => {
    const nested = asRecord(state[field]);
    return nested ? mutate(nested) : false;
  });

  roundSevenKernelRow('R7-KERNEL-transition-refusal-only', 'refusal-only transition preserves a closed refusal envelope', roundSevenKernelRefusalOnlyInput, input =>
    roundSevenKernelOperation(input, 'addTable', kernel => {
      const refusal = asRecord(kernel.refusal);
      return refusal ? roundSevenKernelReplace(refusal, 'message', `${String(refusal.message)} changed`) : false;
    }));
  roundSevenKernelRow('R7-KERNEL-transition-before-after', 'before+after transition rejects state drift', roundFiveInsertionInput, input =>
    roundSevenKernelStateField(input, 'addRow', 'stateAfter', 'frameWidth', 101));
  roundSevenKernelRow('R7-KERNEL-transition-before-after-state-refusal', 'before+after+state-refusal rejects refusal-envelope drift', roundSevenKernelStateRefusalInput, input =>
    roundSevenKernelOperation(input, 'setColSpan', kernel => {
      const refusal = asRecord(kernel.refusal);
      return refusal ? roundSevenKernelReplace(refusal, 'message', `${String(refusal.message)} changed`) : false;
    }));
  roundSevenKernelRow('R7-KERNEL-transition-after-only', 'after-only transition rejects state drift', roundFiveInsertionInput, input =>
    roundSevenKernelStateField(input, 'addTable', 'stateAfter', 'frameWidth', 101));
  roundSevenKernelRow('R7-KERNEL-transition-impossible-before-on-after-only', 'after-only cannot gain stateBefore', roundFiveInsertionInput, input =>
    roundSevenKernelOperation(input, 'addTable', kernel => {
      const after = asRecord(kernel.stateAfter);
      return after ? roundSevenKernelSet(kernel, 'stateBefore', structuredClone(after)) : false;
    }));
  roundSevenKernelRow('R7-KERNEL-transition-missing-after', 'before+after cannot lose stateAfter', roundFiveInsertionInput, input =>
    roundSevenKernelOperation(input, 'addRow', kernel => roundSevenKernelDelete(kernel, 'stateAfter')));
  roundSevenKernelRow('R7-KERNEL-transition-extra-envelope-key', 'kernel envelopes reject unexpected keys', roundFiveInsertionInput, input =>
    roundSevenKernelOperation(input, 'addRow', kernel => roundSevenKernelSet(kernel, '__unexpected', true)));

  roundSevenKernelRow('R7-KERNEL-state-extra-root', 'HelperTableState rejects an unexpected root key', roundFiveInsertionInput, input =>
    roundSevenKernelStateMutation(input, 'addTable', 'stateAfter', state => roundSevenKernelSet(state, '__unexpected', true)));
  roundSevenKernelRow('R7-KERNEL-state-provenance-id', 'provenance id is pinned to the producer contract', roundFiveInsertionInput, input =>
    roundSevenKernelNestedRecord(input, 'addTable', 'stateAfter', 'provenance', provenance => roundSevenKernelReplace(provenance, 'id', 'wrong')));
  roundSevenKernelRow('R7-KERNEL-state-provenance-line-pin', 'provenance helper line pins remain exact', roundFiveInsertionInput, input =>
    roundSevenKernelStateMutation(input, 'addTable', 'stateAfter', state => {
      const provenance = asRecord(state.provenance);
      const anchors = asRecord(provenance?.helperLineAnchors);
      const pin = anchors?.defaultWidgetScaling;
      if (!Array.isArray(pin) || typeof pin[0] !== 'number') return false;
      pin[0] += 1;
      return true;
    }));
  for (const field of ['frameWidth', 'requestedWidth'] as const) {
    roundSevenKernelRow(`R7-KERNEL-state-${field}-numeric`, `${field} rejects a non-finite number`, roundFiveInsertionInput, input =>
      roundSevenKernelStateField(input, 'addTable', 'stateAfter', field, Number.NaN));
  }
  for (const field of ['uiScale', 'borderSize', 'scrollbarWidth', 'standardContainerOffset'] as const) {
    roundSevenKernelRow(`R7-KERNEL-state-metrics-${field}`, `metrics.${field} rejects a non-finite number`, roundFiveInsertionInput, input =>
      roundSevenKernelNestedRecord(input, 'addTable', 'stateAfter', 'metrics', metrics => roundSevenKernelReplace(metrics, field, Number.NaN)));
  }
  roundSevenKernelRow('R7-KERNEL-state-properties-width', 'properties.width rejects a non-finite number', roundFiveInsertionInput, input =>
    roundSevenKernelNestedRecord(input, 'addTable', 'stateAfter', 'properties', properties => roundSevenKernelReplace(properties, 'width', Number.NaN)));
  roundSevenKernelRow('R7-KERNEL-state-properties-x', 'properties.x rejects a non-finite number', roundFiveInsertionInput, input =>
    roundSevenKernelNestedRecord(input, 'addTable', 'stateAfter', 'properties', properties => roundSevenKernelReplace(properties, 'x', Number.NaN)));
  roundSevenKernelRow('R7-KERNEL-state-properties-scaling', 'properties.scaling rejects a non-boolean', roundFiveInsertionInput, input =>
    roundSevenKernelNestedRecord(input, 'addTable', 'stateAfter', 'properties', properties => roundSevenKernelReplace(properties, 'scaling', 'true')));
  roundSevenKernelRow('R7-KERNEL-state-properties-reserve-scrollbar', 'properties.reserveScrollBar rejects a non-boolean', roundFiveInsertionInput, input =>
    roundSevenKernelNestedRecord(input, 'addTable', 'stateAfter', 'properties', properties => roundSevenKernelReplace(properties, 'reserveScrollBar', 1)));

  const roundSevenKernelColumnRow = (
    id: string,
    name: string,
    mutate: (column: Record<string, unknown>) => boolean,
  ): void => roundSevenKernelRow(id, name, roundFiveInsertionInput, input =>
    roundSevenKernelStateMutation(input, 'addTable', 'stateAfter', state => {
      const columns = state.columns;
      const column = Array.isArray(columns) ? asRecord(columns[0]) : undefined;
      return column ? mutate(column) : false;
    }));
  roundSevenKernelColumnRow('R7-KERNEL-state-columns-extra-key', 'columns reject an unexpected key', column => roundSevenKernelSet(column, '__unexpected', true));
  roundSevenKernelColumnRow('R7-KERNEL-state-columns-missing-field', 'columns reject a missing required field', column => roundSevenKernelDelete(column, 'percent'));
  roundSevenKernelColumnRow('R7-KERNEL-state-columns-width', 'columns.width rejects a non-finite number', column => roundSevenKernelReplace(column, 'width', Number.NaN));
  roundSevenKernelColumnRow('R7-KERNEL-state-columns-percent', 'columns.percent rejects a non-boolean', column => roundSevenKernelReplace(column, 'percent', 1));
  roundSevenKernelColumnRow('R7-KERNEL-state-columns-min', 'columns.min rejects a non-boolean', column => roundSevenKernelReplace(column, 'min', 1));
  roundSevenKernelColumnRow('R7-KERNEL-state-columns-weight', 'columns.weight rejects a negative number', column => roundSevenKernelReplace(column, 'weight', -1));
  roundSevenKernelColumnRow('R7-KERNEL-state-columns-colspan', 'columns.colspan rejects a non-positive index', column => roundSevenKernelReplace(column, 'colspan', 0));
  roundSevenKernelColumnRow('R7-KERNEL-state-columns-bgcolspan', 'columns.bgcolspan rejects a non-positive index', column => roundSevenKernelReplace(column, 'bgcolspan', 0));
  roundSevenKernelColumnRow('R7-KERNEL-state-columns-scaling', 'optional columns.scaling rejects a non-boolean', column => {
    column.scaling = 'true';
    return true;
  });

  const roundSevenKernelRowStateRow = (
    id: string,
    name: string,
    mutate: (row: Record<string, unknown>) => boolean,
  ): void => roundSevenKernelRow(id, name, roundFiveInsertionInput, input =>
    roundSevenKernelStateMutation(input, 'addRow', 'stateAfter', state => {
      const rows = state.rows;
      const row = Array.isArray(rows) ? asRecord(rows[0]) : undefined;
      return row ? mutate(row) : false;
    }));
  roundSevenKernelRowStateRow('R7-KERNEL-state-rows-extra-key', 'rows reject an unexpected key', row => roundSevenKernelSet(row, '__unexpected', true));
  roundSevenKernelRowStateRow('R7-KERNEL-state-rows-missing-field', 'rows reject a missing required field', row => roundSevenKernelDelete(row, 'fixed'));
  roundSevenKernelRowStateRow('R7-KERNEL-state-rows-fixed', 'rows.fixed rejects a non-boolean', row => roundSevenKernelReplace(row, 'fixed', 1));
  roundSevenKernelRowStateRow('R7-KERNEL-state-rows-border-below', 'rows.borderBelow rejects a non-boolean', row => roundSevenKernelReplace(row, 'borderBelow', 1));
  roundSevenKernelRowStateRow('R7-KERNEL-state-rows-padding-top', 'rows.paddingTop rejects a non-finite number', row => roundSevenKernelReplace(row, 'paddingTop', Number.NaN));
  roundSevenKernelRowStateRow('R7-KERNEL-state-rows-padding-bottom', 'rows.paddingBottom rejects a negative number', row => roundSevenKernelReplace(row, 'paddingBottom', -1));
  roundSevenKernelRowStateRow('R7-KERNEL-state-rows-scaling', 'rows.scaling rejects a non-boolean', row => roundSevenKernelReplace(row, 'scaling', 1));
  roundSevenKernelRowStateRow('R7-KERNEL-state-rows-group-index', 'optional rows.groupIndex rejects an out-of-range index', row => {
    row.groupIndex = 1;
    return true;
  });
  roundSevenKernelRowStateRow('R7-KERNEL-state-rows-cells-cardinality', 'rows.cells must match the column count', row => roundSevenKernelReplace(row, 'cells', []));

  const roundSevenKernelCellRow = (
    id: string,
    name: string,
    mutate: (cell: Record<string, unknown>) => boolean,
  ): void => roundSevenKernelRow(id, name, roundFiveInsertionInput, input =>
    roundSevenKernelStateMutation(input, 'createText', 'stateAfter', state => {
      const rows = state.rows;
      const row = Array.isArray(rows) ? asRecord(rows[0]) : undefined;
      const cells = row?.cells;
      const cell = Array.isArray(cells) ? asRecord(cells[0]) : undefined;
      return cell ? mutate(cell) : false;
    }));
  roundSevenKernelCellRow('R7-KERNEL-state-cells-extra-key', 'cells reject an unexpected key', cell => roundSevenKernelSet(cell, '__unexpected', true));
  roundSevenKernelCellRow('R7-KERNEL-state-cells-missing-field', 'cells reject a missing required field', cell => roundSevenKernelDelete(cell, 'type'));
  roundSevenKernelCellRow('R7-KERNEL-state-cells-type', 'cells.type rejects an unknown enum', cell => roundSevenKernelReplace(cell, 'type', 'unknown'));
  roundSevenKernelCellRow('R7-KERNEL-state-cells-colspan', 'cells.colspan rejects a negative index', cell => roundSevenKernelReplace(cell, 'colspan', -1));
  roundSevenKernelCellRow('R7-KERNEL-state-cells-bgcolspan', 'cells.bgcolspan rejects a negative index', cell => roundSevenKernelReplace(cell, 'bgcolspan', -1));
  roundSevenKernelCellRow('R7-KERNEL-state-cells-y', 'cells.y rejects a non-finite number', cell => roundSevenKernelReplace(cell, 'y', Number.NaN));
  roundSevenKernelCellRow('R7-KERNEL-state-cells-height', 'cells.height rejects a negative number', cell => roundSevenKernelReplace(cell, 'height', -1));
  roundSevenKernelCellRow('R7-KERNEL-state-cells-scaling', 'cells.scaling rejects a non-boolean', cell => roundSevenKernelReplace(cell, 'scaling', 1));
  roundSevenKernelCellRow('R7-KERNEL-state-cells-affect-row-height', 'cells.affectRowHeight rejects a non-boolean', cell => roundSevenKernelReplace(cell, 'affectRowHeight', 1));
  roundSevenKernelCellRow('R7-KERNEL-state-cells-min-text-height', 'optional cells.minTextHeight rejects a negative number', cell => {
    cell.minTextHeight = -1;
    return true;
  });

  roundSevenKernelRow('R7-KERNEL-state-row-groups-level', 'rowGroups.level rejects a negative index', roundFiveInsertionInput, input =>
    roundSevenKernelStateMutation(input, 'addTable', 'stateAfter', state => {
      state.rowGroups = [{ level: -1 }];
      return true;
    }));
  roundSevenKernelRow('R7-KERNEL-state-row-groups-extra-key', 'rowGroups reject an unexpected key', roundFiveInsertionInput, input =>
    roundSevenKernelStateMutation(input, 'addTable', 'stateAfter', state => {
      state.rowGroups = [{ level: 0, __unexpected: true }];
      return true;
    }));
  roundSevenKernelRow('R7-KERNEL-state-pre-final-rows', 'pre-final states cannot contain rows', roundFiveInsertionInput, input =>
    roundSevenKernelStateMutation(input, 'addTable', 'stateAfter', state => {
      state.rows = [{}];
      return true;
    }));
  roundSevenKernelRow('R7-KERNEL-state-columns-nonempty', 'states require at least one column', roundFiveInsertionInput, input =>
    roundSevenKernelStateMutation(input, 'addTable', 'stateAfter', state => {
      state.columns = [];
      return true;
    }));
  roundSevenKernelRow('R7-KERNEL-state-group-index-bounds', 'row groupIndex must be inside rowGroups', roundFiveInsertionInput, input =>
    roundSevenKernelStateMutation(input, 'addRow', 'stateAfter', state => {
      const rows = state.rows;
      const row = Array.isArray(rows) ? asRecord(rows[0]) : undefined;
      if (!row) return false;
      row.groupIndex = 1;
      return true;
    }));
  roundSevenKernelRow('R7-KERNEL-state-refusal-equality', 'refusal state must equal stateAfter and stateBefore', roundSevenKernelStateRefusalInput, input =>
    roundSevenKernelStateMutation(input, 'setColSpan', 'stateAfter', state => {
      const frameWidth = state.frameWidth;
      if (typeof frameWidth !== 'number') return false;
      state.frameWidth = frameWidth + 1;
      return true;
    }));

  const roundSevenKernelDiagnosticRow = (
    id: string,
    name: string,
    mutate: (diagnostic: Record<string, unknown>) => boolean,
  ): void => roundSevenKernelRow(id, name, roundSevenKernelDiagnosticsInput, input =>
    roundSevenKernelStateMutation(input, 'setColSpan', 'stateAfter', state => {
      const diagnostics = state.diagnostics;
      const diagnostic = Array.isArray(diagnostics) ? asRecord(diagnostics[0]) : undefined;
      return diagnostic ? mutate(diagnostic) : false;
    }));
  roundSevenKernelDiagnosticRow('R7-KERNEL-state-diagnostics-code', 'diagnostics.code rejects an unknown enum', diagnostic => roundSevenKernelReplace(diagnostic, 'code', 'unknown'));
  roundSevenKernelDiagnosticRow('R7-KERNEL-state-diagnostics-message', 'diagnostics.message rejects a non-string', diagnostic => roundSevenKernelReplace(diagnostic, 'message', 1));
  roundSevenKernelDiagnosticRow('R7-KERNEL-state-diagnostics-provenance', 'diagnostics.provenance remains pinned', diagnostic => {
    const provenance = asRecord(diagnostic.provenance);
    return provenance ? roundSevenKernelReplace(provenance, 'id', 'wrong') : false;
  });

  let accessorReads = 0;
  roundSevenKernelRow('R7-KERNEL-hostile-nested-accessor', 'nested accessor data fails closed without invoking its getter', roundFiveInsertionInput, input =>
    roundSevenKernelStateMutation(input, 'addTable', 'stateAfter', state => {
      const metrics: Record<string, unknown> = {};
      Object.defineProperty(metrics, 'uiScale', {
        enumerable: true,
        get: () => {
          accessorReads += 1;
          return 1;
        },
      });
      state.metrics = metrics;
      return true;
    }), () => accessorReads);
  let proxyReads = 0;
  let proxyTrap: string | undefined;
  // Browser-safe ECMAScript has no observation-free generic Proxy test. This row records the
  // measured getPrototypeOf trap while still requiring fail-closed comparison; accessor reads
  // remain required to be zero in the preceding row.
  roundSevenKernelRow('R7-KERNEL-hostile-nested-proxy', 'nested proxy data fails closed with its measured reflective trap recorded', roundFiveInsertionInput, input =>
    roundSevenKernelStateMutation(input, 'addTable', 'stateAfter', state => {
      const metrics = asRecord(state.metrics);
      if (!metrics) return false;
      const counter: TrapCounter = {
        get reads() {
          return proxyReads;
        },
        set reads(value: number) {
          proxyReads = value;
        },
        get trap() {
          return proxyTrap;
        },
        set trap(value: string | undefined) {
          proxyTrap = value;
        },
      };
      state.metrics = hostileProxy(structuredClone(metrics), counter);
      return true;
    }), () => proxyReads, () => proxyTrap, (observations, trap) => observations === 1 && trap === 'getPrototypeOf');
  roundSevenKernelRow('R7-KERNEL-hostile-custom-prototype', 'nested custom-prototype data fails closed', roundFiveInsertionInput, input =>
    roundSevenKernelStateMutation(input, 'addTable', 'stateAfter', state => {
      const metrics = asRecord(state.metrics);
      if (!metrics) return false;
      state.metrics = Object.assign(Object.create({ inherited: true }), metrics);
      return true;
    }));
  roundSevenKernelRow('R7-KERNEL-hostile-cycle', 'nested cycles fail closed', roundFiveInsertionInput, input =>
    roundSevenKernelStateMutation(input, 'addTable', 'stateAfter', state => {
      const metrics = asRecord(state.metrics);
      if (!metrics) return false;
      metrics.__cycle = state;
      return true;
    }));
  roundSevenKernelRow('R7-KERNEL-hostile-symbol', 'nested symbols fail closed', roundFiveInsertionInput, input =>
    roundSevenKernelStateMutation(input, 'addTable', 'stateAfter', state => {
      const metrics = asRecord(state.metrics);
      if (!metrics) return false;
      Object.defineProperty(metrics, Symbol('roundSeven'), { enumerable: true, value: true });
      return true;
    }));
  roundSevenKernelRow('R7-KERNEL-hostile-non-enumerable', 'nested non-enumerable data fails closed', roundFiveInsertionInput, input =>
    roundSevenKernelStateMutation(input, 'addTable', 'stateAfter', state => {
      const metrics = asRecord(state.metrics);
      if (!metrics) return false;
      Object.defineProperty(metrics, '__hidden', { enumerable: false, value: true });
      return true;
    }));

  const roundSevenKernelFailures = roundSevenKernelRows.filter(row => !row.pass);

  const b119PartialScalarStructuralCatalogIsEmpty = (catalog: X4UiSourceEditCatalog): boolean =>
    (catalog.structuralEntries || []).length === 0
      && (catalog.deleteEntries || []).length === 0
      && (catalog.replaceEntries || []).length === 0
      && (catalog.insertEntries || []).length === 0
      && (catalog.moveEntries || []).length === 0;
  const b119PartialScalarProgramIsMixed = (context: SourceEditFixtureContext): boolean =>
    context.program.status === 'partial'
      && context.program.operations.length > 0
      && context.program.operations.some(operation => operation.status === 'applied')
      && context.program.operations.some(operation => operation.status !== 'applied');
  const b119PartialScalarHasNoSuppliedInputs = (context: SourceEditFixtureContext): boolean =>
    (context.program.previewSampleBindings || []).length === 0
      && (context.program.previewPathSelections || []).length === 0
      && (context.program.previewLoopSelections || []).length === 0;
  const b119PartialScalarEntry = (
    catalog: X4UiSourceEditCatalog,
    expectedText: string,
    callName: string,
  ): X4UiEditableSourceEditEntry | undefined => catalog.editableEntries.filter(entry =>
    entry.valueType === 'string'
      && entry.expectedText === expectedText
      && entry.provenance.callName === callName
      && entry.provenance.fields.includes('arguments[0]'))[0];

  const b119PartialScalarDiscoveryContext = contextualImportContextFor(canonicalCorpus, b119PartialScalarMixedLua);
  const b119PartialScalarDiscoveryCatalog = catalogFor(b119PartialScalarDiscoveryContext);
  const b119PartialScalarDiscoveryTitleEntries = b119PartialScalarDiscoveryCatalog.editableEntries.filter(entry =>
    entry.valueType === 'string'
      && entry.expectedText === '"AI INFLUENCE"'
      && entry.provenance.callName === 'createText'
      && entry.provenance.fields.includes('arguments[0]'));
  const b119PartialScalarDiscoveryCloseEntries = b119PartialScalarDiscoveryCatalog.editableEntries.filter(entry =>
    entry.valueType === 'string'
      && entry.expectedText === '"CLOSE"'
      && entry.provenance.callName === 'setText'
      && entry.provenance.fields.includes('arguments[0]'));
  const b119PartialScalarDiscoveryRow: Check = {
    name: 'B119 fail-first mixed-stream loader-corpus discovery exposes only direct AI INFLUENCE and CLOSE scalars',
    pass: b119PartialScalarProgramIsMixed(b119PartialScalarDiscoveryContext)
      && b119PartialScalarHasNoSuppliedInputs(b119PartialScalarDiscoveryContext)
      && b119PartialScalarDiscoveryCatalog.status === 'ready'
      && b119PartialScalarDiscoveryCatalog.editable
      && b119PartialScalarDiscoveryTitleEntries.length === 1
      && b119PartialScalarDiscoveryCloseEntries.length === 1
      && b119PartialScalarStructuralCatalogIsEmpty(b119PartialScalarDiscoveryCatalog),
    detail: JSON.stringify({
      programStatus: b119PartialScalarDiscoveryContext.program.status,
      operationStatuses: b119PartialScalarDiscoveryContext.program.operations.map(operation => operation.status),
      catalogStatus: b119PartialScalarDiscoveryCatalog.status,
      catalogReason: b119PartialScalarDiscoveryCatalog.reason,
      editableEntries: b119PartialScalarDiscoveryCatalog.editableEntries.length,
      titleEntries: b119PartialScalarDiscoveryTitleEntries.length,
      closeEntries: b119PartialScalarDiscoveryCloseEntries.length,
      structuralEntries: (b119PartialScalarDiscoveryCatalog.structuralEntries || []).length,
      deleteEntries: (b119PartialScalarDiscoveryCatalog.deleteEntries || []).length,
      replaceEntries: (b119PartialScalarDiscoveryCatalog.replaceEntries || []).length,
      insertEntries: (b119PartialScalarDiscoveryCatalog.insertEntries || []).length,
      moveEntries: (b119PartialScalarDiscoveryCatalog.moveEntries || []).length,
      suppliedInputs: !b119PartialScalarHasNoSuppliedInputs(b119PartialScalarDiscoveryContext),
    }),
  };

  const b119PartialScalarApplyContext = contextualImportContextFor(canonicalCorpus, b119PartialScalarMixedLua);
  const b119PartialScalarApplyCatalog = catalogFor(b119PartialScalarApplyContext);
  const b119PartialScalarApplyTitleEntry = b119PartialScalarEntry(b119PartialScalarApplyCatalog, '"AI INFLUENCE"', 'createText');
  const b119PartialScalarApplyCloseEntry = b119PartialScalarEntry(b119PartialScalarApplyCatalog, '"CLOSE"', 'setText');
  const b119PartialScalarApplyBefore = sourceTextAt(b119PartialScalarApplyContext, contextualImportPath);
  const b119PartialScalarApplyTitleOutcome: PublicCallOutcome<X4UiSourceEditResult> = b119PartialScalarApplyTitleEntry === undefined
    ? { threw: false }
    : invokePublic(() => applyX4UiSourceEdit(
      b119PartialScalarApplyContext.workspace,
      b119PartialScalarApplyContext.source,
      b119PartialScalarApplyCatalog,
      b119PartialScalarApplyTitleEntry.id,
      'AI INFLUENCE updated',
      b119PartialScalarApplyTitleEntry.path,
      b119PartialScalarApplyTitleEntry.startOffset,
      b119PartialScalarApplyTitleEntry.endOffset,
      b119PartialScalarApplyTitleEntry.expectedText,
    ));
  const b119PartialScalarApplyCloseOutcome: PublicCallOutcome<X4UiSourceEditResult> = b119PartialScalarApplyCloseEntry === undefined
    ? { threw: false }
    : invokePublic(() => applyX4UiSourceEdit(
      b119PartialScalarApplyContext.workspace,
      b119PartialScalarApplyContext.source,
      b119PartialScalarApplyCatalog,
      b119PartialScalarApplyCloseEntry.id,
      'CLOSE NOW',
      b119PartialScalarApplyCloseEntry.path,
      b119PartialScalarApplyCloseEntry.startOffset,
      b119PartialScalarApplyCloseEntry.endOffset,
      b119PartialScalarApplyCloseEntry.expectedText,
    ));
  const b119PartialScalarApplyOutcomePass = (
    outcome: PublicCallOutcome<X4UiSourceEditResult>,
    entry: X4UiEditableSourceEditEntry | undefined,
  ): boolean => {
    if (entry === undefined || outcome.threw || outcome.value?.accepted !== true) return false;
    const result = outcome.value;
    return result.changed
      && result.reparsed
      && result.provenanceReestablished
      && result.catalog.status === 'ready'
      && result.catalog.editable
      && b119PartialScalarStructuralCatalogIsEmpty(result.catalog)
      && sourceTextAt(result, contextualImportPath) === b119PartialScalarApplyBefore.slice(0, entry.startOffset)
        + result.replacement
        + b119PartialScalarApplyBefore.slice(entry.endOffset);
  };
  const b119PartialScalarApplyOriginalUnchanged = sourceTextAt(
    b119PartialScalarApplyContext,
    contextualImportPath,
  ) === b119PartialScalarApplyBefore;
  const b119PartialScalarApplyRow: Check = {
    name: 'B119 fail-first mixed-stream loader-corpus apply accepts direct AI INFLUENCE and CLOSE edits only',
    pass: b119PartialScalarProgramIsMixed(b119PartialScalarApplyContext)
      && b119PartialScalarHasNoSuppliedInputs(b119PartialScalarApplyContext)
      && b119PartialScalarApplyCatalog.status === 'ready'
      && b119PartialScalarApplyCatalog.editable
      && b119PartialScalarApplyOutcomePass(b119PartialScalarApplyTitleOutcome, b119PartialScalarApplyTitleEntry)
      && b119PartialScalarApplyOutcomePass(b119PartialScalarApplyCloseOutcome, b119PartialScalarApplyCloseEntry)
      && b119PartialScalarApplyOriginalUnchanged,
    detail: JSON.stringify({
      programStatus: b119PartialScalarApplyContext.program.status,
      operationStatuses: b119PartialScalarApplyContext.program.operations.map(operation => operation.status),
      catalogStatus: b119PartialScalarApplyCatalog.status,
      catalogReason: b119PartialScalarApplyCatalog.reason,
      editableEntries: b119PartialScalarApplyCatalog.editableEntries.length,
      titleEntry: b119PartialScalarApplyTitleEntry?.id,
      closeEntry: b119PartialScalarApplyCloseEntry?.id,
      titleApply: {
        threw: b119PartialScalarApplyTitleOutcome.threw,
        accepted: b119PartialScalarApplyTitleOutcome.value?.accepted,
        changed: b119PartialScalarApplyTitleOutcome.value?.changed,
        reparsed: b119PartialScalarApplyTitleOutcome.value?.accepted === true ? b119PartialScalarApplyTitleOutcome.value.reparsed : undefined,
        provenanceReestablished: b119PartialScalarApplyTitleOutcome.value?.accepted === true ? b119PartialScalarApplyTitleOutcome.value.provenanceReestablished : undefined,
        reason: b119PartialScalarApplyTitleOutcome.value?.accepted === false ? b119PartialScalarApplyTitleOutcome.value.reason : undefined,
      },
      closeApply: {
        threw: b119PartialScalarApplyCloseOutcome.threw,
        accepted: b119PartialScalarApplyCloseOutcome.value?.accepted,
        changed: b119PartialScalarApplyCloseOutcome.value?.changed,
        reparsed: b119PartialScalarApplyCloseOutcome.value?.accepted === true ? b119PartialScalarApplyCloseOutcome.value.reparsed : undefined,
        provenanceReestablished: b119PartialScalarApplyCloseOutcome.value?.accepted === true ? b119PartialScalarApplyCloseOutcome.value.provenanceReestablished : undefined,
        reason: b119PartialScalarApplyCloseOutcome.value?.accepted === false ? b119PartialScalarApplyCloseOutcome.value.reason : undefined,
      },
      structuralEntries: (b119PartialScalarApplyCatalog.structuralEntries || []).length,
      deleteEntries: (b119PartialScalarApplyCatalog.deleteEntries || []).length,
      replaceEntries: (b119PartialScalarApplyCatalog.replaceEntries || []).length,
      insertEntries: (b119PartialScalarApplyCatalog.insertEntries || []).length,
      moveEntries: (b119PartialScalarApplyCatalog.moveEntries || []).length,
      originalSourceUnchanged: b119PartialScalarApplyOriginalUnchanged,
    }),
  };
  const b119PartialScalarFailFirstRows = [b119PartialScalarDiscoveryRow, b119PartialScalarApplyRow];
  checks.push(...b119PartialScalarFailFirstRows);
  console.log(`x4UiSourceEdits B119 partial-scalar fail-first: ${JSON.stringify(b119PartialScalarFailFirstRows)}`);

  const b119PartialScalarNoCorpusContext = contextualImportContextFor(undefined, b119PartialScalarMixedLua);
  const b119PartialScalarNoCorpusCatalog = catalogFor(b119PartialScalarNoCorpusContext);
  const b119PartialScalarNoCorpusBefore = sourceTextAt(b119PartialScalarNoCorpusContext, contextualImportPath);
  const b119PartialScalarNoCorpusApply = invokePublic(() => applyX4UiSourceEdit(
    b119PartialScalarNoCorpusContext.workspace,
    b119PartialScalarNoCorpusContext.source,
    b119PartialScalarNoCorpusCatalog,
    'missing-b119-partial-scalar-no-corpus-entry',
    'NO CORPUS',
  ));
  const b119PartialScalarNoCorpusRow: Check = {
    name: 'B119 mixed-stream scalar remains blanket-refused without loader-issued corpus',
    pass: b119PartialScalarProgramIsMixed(b119PartialScalarNoCorpusContext)
      && b119PartialScalarNoCorpusCatalog.status === 'locked'
      && b119PartialScalarNoCorpusCatalog.reason === 'operation-not-applied'
      && b119PartialScalarNoCorpusCatalog.editableEntries.length === 0
      && b119PartialScalarStructuralCatalogIsEmpty(b119PartialScalarNoCorpusCatalog)
      && b119PartialScalarNoCorpusApply.threw === false
      && b119PartialScalarNoCorpusApply.value?.accepted === false
      && b119PartialScalarNoCorpusApply.value.reason === 'unsupported-provenance'
      && b119PartialScalarNoCorpusApply.value.workspace === b119PartialScalarNoCorpusContext.workspace
      && b119PartialScalarNoCorpusApply.value.source === b119PartialScalarNoCorpusContext.source
      && sourceTextAt(b119PartialScalarNoCorpusApply.value, contextualImportPath) === b119PartialScalarNoCorpusBefore,
    detail: JSON.stringify({
      programStatus: b119PartialScalarNoCorpusContext.program.status,
      catalogStatus: b119PartialScalarNoCorpusCatalog.status,
      catalogReason: b119PartialScalarNoCorpusCatalog.reason,
      editableEntries: b119PartialScalarNoCorpusCatalog.editableEntries.length,
      structuralEntries: (b119PartialScalarNoCorpusCatalog.structuralEntries || []).length,
      apply: {
        threw: b119PartialScalarNoCorpusApply.threw,
        accepted: b119PartialScalarNoCorpusApply.value?.accepted,
        reason: b119PartialScalarNoCorpusApply.value?.accepted === false ? b119PartialScalarNoCorpusApply.value.reason : undefined,
      },
      sourceUnchanged: b119PartialScalarNoCorpusApply.value !== undefined
        && sourceTextAt(b119PartialScalarNoCorpusApply.value, contextualImportPath) === b119PartialScalarNoCorpusBefore,
    }),
  };
  checks.push(b119PartialScalarNoCorpusRow);
  console.log(`x4UiSourceEdits B119 partial-scalar no-corpus negative: ${JSON.stringify(b119PartialScalarNoCorpusRow)}`);

  const b119PartialScalarScenarioWorkspace = workspace(b119PartialScalarScenarioLua, {
    id: 'b119-partial-scalar-scenario-source-edits-selftest',
    name: 'B119 partial scalar scenario source edits selftest',
    passthroughFiles: [
      passthrough('README.md', '# scenario bytes remain untouched\r\n', { reason: 'unknown_domain' }),
      passthrough('ui.xml', uiXml.replaceAll('ui/edit.lua', b119PartialScalarScenarioPath)),
      passthrough(b119PartialScalarScenarioPath, b119PartialScalarScenarioLua, { reason: 'unparsed', bytes: new TextEncoder().encode(b119PartialScalarScenarioLua).length }),
      passthrough('ui/scenario-notes.txt', 'scenario sidecar remains untouched\r\n', { reason: 'unparsed' }),
    ],
  });
  const b119PartialScalarScenarioSource = buildX4UiWorkspaceSource(b119PartialScalarScenarioWorkspace);
  const b119PartialScalarScenarioFile = b119PartialScalarScenarioSource.bundle?.sourceFiles.find(file => file.path === b119PartialScalarScenarioPath);
  if (!b119PartialScalarScenarioFile) throw new Error('B119 partial scalar scenario source file missing');
  const b119PartialScalarScenarioModel = normalizeX4UiSourceEditLayoutModel(b119PartialScalarScenarioFile.callModel);
  const b119PartialScalarScenarioTarget = createX4UiLayoutTargetCatalog(b119PartialScalarScenarioModel).targets.find(target =>
    target.kind === 'function' && target.name === 'menu.display');
  if (!b119PartialScalarScenarioTarget) throw new Error('B119 partial scalar scenario target missing');
  const b119PartialScalarScenarioProfile: X4UiLayoutProjectionProfile = {
    ...profileFor(b119PartialScalarScenarioModel),
    localExpansion: { maxDepth: 4, maxInvocations: 16 },
  };
  const b119PartialScalarScenarioBaseResult = projectX4UiLayoutProgram(
    b119PartialScalarScenarioModel,
    b119PartialScalarScenarioTarget,
    b119PartialScalarScenarioProfile,
    undefined,
    undefined,
    undefined,
    canonicalCorpus,
  );
  if (b119PartialScalarScenarioBaseResult.status === 'refused' || !b119PartialScalarScenarioBaseResult.program
    || !b119PartialScalarScenarioBaseResult.evidenceAuthority) {
    throw new Error(`B119 partial scalar scenario base projection refused: ${b119PartialScalarScenarioBaseResult.status}`);
  }
  const b119PartialScalarScenarioBaseProgram = b119PartialScalarScenarioBaseResult.program;
  const b119PartialScalarScenarioBaseContext: SourceEditFixtureContext = {
    workspace: b119PartialScalarScenarioWorkspace,
    source: b119PartialScalarScenarioSource,
    program: b119PartialScalarScenarioBaseProgram,
    evidenceAuthority: b119PartialScalarScenarioBaseResult.evidenceAuthority,
  };
  const b119PartialScalarScenarioBaseCatalog = catalogFor(b119PartialScalarScenarioBaseContext);
  const b119PartialScalarScenarioDirectEntry = b119PartialScalarScenarioBaseCatalog.editableEntries.find(entry =>
    entry.provenance.callName === 'createFrameHandle'
      && entry.expectedText === '90'
      && entry.provenance.fields.some(field => field.includes('width')));
  const b119PartialScalarScenarioReadyBefore = sourceTextAt(
    b119PartialScalarScenarioBaseContext,
    b119PartialScalarScenarioPath,
  );
  const b119PartialScalarScenarioReadyApply = b119PartialScalarScenarioDirectEntry === undefined
    ? undefined
    : invokePublic(() => applyX4UiSourceEdit(
      b119PartialScalarScenarioWorkspace,
      b119PartialScalarScenarioSource,
      b119PartialScalarScenarioBaseCatalog,
      b119PartialScalarScenarioDirectEntry.id,
      95,
      b119PartialScalarScenarioDirectEntry.path,
      b119PartialScalarScenarioDirectEntry.startOffset,
      b119PartialScalarScenarioDirectEntry.endOffset,
      b119PartialScalarScenarioDirectEntry.expectedText,
    ));
  const b119PartialScalarScenarioReadyApplyValue = b119PartialScalarScenarioReadyApply?.value;
  const b119PartialScalarScenarioReadyAfter = b119PartialScalarScenarioReadyApplyValue?.accepted === true
    ? sourceTextAt(b119PartialScalarScenarioReadyApplyValue, b119PartialScalarScenarioPath)
    : undefined;
  const b119PartialScalarScenarioReadyExpected = b119PartialScalarScenarioDirectEntry === undefined
    ? undefined
    : b119PartialScalarScenarioReadyBefore.slice(0, b119PartialScalarScenarioDirectEntry.startOffset)
      + '95'
      + b119PartialScalarScenarioReadyBefore.slice(b119PartialScalarScenarioDirectEntry.endOffset);
  const b119PartialScalarScenarioReadyControlRow: Check = {
    name: 'B119 mixed scenario without preview inputs retains a READY applied direct scalar control',
    pass: b119PartialScalarProgramIsMixed(b119PartialScalarScenarioBaseContext)
      && b119PartialScalarHasNoSuppliedInputs(b119PartialScalarScenarioBaseContext)
      && b119PartialScalarScenarioBaseCatalog.status === 'ready'
      && b119PartialScalarScenarioBaseCatalog.editable
      && b119PartialScalarScenarioDirectEntry !== undefined
      && b119PartialScalarScenarioReadyApply?.threw === false
      && b119PartialScalarScenarioReadyApplyValue?.accepted === true
      && b119PartialScalarScenarioReadyApplyValue.changed
      && b119PartialScalarScenarioReadyApplyValue.reparsed
      && b119PartialScalarScenarioReadyApplyValue.provenanceReestablished
      && b119PartialScalarScenarioReadyAfter === b119PartialScalarScenarioReadyExpected
      && sourceTextAt(b119PartialScalarScenarioBaseContext, b119PartialScalarScenarioPath)
        === b119PartialScalarScenarioReadyBefore
      && b119PartialScalarStructuralCatalogIsEmpty(b119PartialScalarScenarioBaseCatalog),
    detail: JSON.stringify({
      programStatus: b119PartialScalarScenarioBaseProgram.status,
      operationStatuses: b119PartialScalarScenarioBaseProgram.operations.map(operation => operation.status),
      catalogStatus: b119PartialScalarScenarioBaseCatalog.status,
      catalogReason: b119PartialScalarScenarioBaseCatalog.reason,
      editableEntries: b119PartialScalarScenarioBaseCatalog.editableEntries.length,
      directEntry: b119PartialScalarScenarioDirectEntry && {
        id: b119PartialScalarScenarioDirectEntry.id,
        callName: b119PartialScalarScenarioDirectEntry.provenance.callName,
        fields: b119PartialScalarScenarioDirectEntry.provenance.fields,
        expectedText: b119PartialScalarScenarioDirectEntry.expectedText,
      },
      structuralEntries: b119PartialScalarScenarioBaseCatalog.structuralEntries.length,
      suppliedInputs: !b119PartialScalarHasNoSuppliedInputs(b119PartialScalarScenarioBaseContext),
      readyApply: {
        threw: b119PartialScalarScenarioReadyApply?.threw,
        accepted: b119PartialScalarScenarioReadyApplyValue?.accepted,
        changed: b119PartialScalarScenarioReadyApplyValue?.accepted === true ? b119PartialScalarScenarioReadyApplyValue.changed : undefined,
        reparsed: b119PartialScalarScenarioReadyApplyValue?.accepted === true ? b119PartialScalarScenarioReadyApplyValue.reparsed : undefined,
        provenanceReestablished: b119PartialScalarScenarioReadyApplyValue?.accepted === true ? b119PartialScalarScenarioReadyApplyValue.provenanceReestablished : undefined,
        exactDetachedSource: b119PartialScalarScenarioReadyAfter === b119PartialScalarScenarioReadyExpected,
        originalSourceUnchanged: sourceTextAt(b119PartialScalarScenarioBaseContext, b119PartialScalarScenarioPath)
          === b119PartialScalarScenarioReadyBefore,
      },
    }),
  };
  checks.push(b119PartialScalarScenarioReadyControlRow);
  console.log(`x4UiSourceEdits B119 partial-scalar no-input READY control: ${JSON.stringify(b119PartialScalarScenarioReadyControlRow)}`);

  const b119PartialScalarScenarioSampleInput = b119PartialScalarScenarioBaseProgram.sampleCatalog.entries.length === 0
    ? undefined
    : {
      catalogId: b119PartialScalarScenarioBaseProgram.sampleCatalog.id,
      source: b119PartialScalarScenarioBaseProgram.sampleCatalog.sourceIdentity,
      values: b119PartialScalarScenarioBaseProgram.sampleCatalog.entries.map(entry => ({
        id: entry.id,
        value: entry.expectedType === 'number' ? 9 : entry.expectedType === 'boolean' ? true : 'guarded',
      })),
    };
  const b119PartialScalarScenarioPathEntry = b119PartialScalarScenarioBaseProgram.previewPathCatalog.entries[0];
  const b119PartialScalarScenarioPathInput = b119PartialScalarScenarioPathEntry === undefined
    ? undefined
    : {
      catalogId: b119PartialScalarScenarioBaseProgram.previewPathCatalog.id,
      source: b119PartialScalarScenarioBaseProgram.previewPathCatalog.sourceIdentity,
      selections: [{
        id: b119PartialScalarScenarioPathEntry.id,
        boundaryId: b119PartialScalarScenarioPathEntry.boundaryId,
        armId: b119PartialScalarScenarioPathEntry.armId,
      }],
    };
  const b119PartialScalarScenarioProjectionFor = (input: {
    readonly sample?: typeof b119PartialScalarScenarioSampleInput;
    readonly path?: typeof b119PartialScalarScenarioPathInput;
  }) => projectX4UiLayoutProgram(
    b119PartialScalarScenarioModel,
    b119PartialScalarScenarioTarget,
    b119PartialScalarScenarioProfile,
    input.sample,
    input.path,
    undefined,
    canonicalCorpus,
  );
  const b119PartialScalarScenarioCases = [
    {
      id: 'B119 mixed scalar with unconsumed source-bound sample input refuses',
      inputKind: 'sample',
      active: (context: SourceEditFixtureContext) => context.program.previewSampleBindings.length > 0,
      result: b119PartialScalarScenarioProjectionFor({ sample: b119PartialScalarScenarioSampleInput }),
    },
    {
      id: 'B119 mixed scalar with active source-bound path input refuses',
      inputKind: 'path',
      active: (context: SourceEditFixtureContext) => context.program.previewPathSelections.length > 0,
      result: b119PartialScalarScenarioProjectionFor({ path: b119PartialScalarScenarioPathInput }),
    },
  ];
  const b119PartialScalarScenarioRows: Check[] = b119PartialScalarScenarioCases.map(testCase => {
    const scenarioContext = testCase.result.status === 'refused' || !testCase.result.program || !testCase.result.evidenceAuthority
      ? undefined
      : {
        workspace: b119PartialScalarScenarioWorkspace,
        source: b119PartialScalarScenarioSource,
        program: testCase.result.program,
        evidenceAuthority: testCase.result.evidenceAuthority,
      };
    const scenarioCatalog = scenarioContext === undefined ? undefined : catalogFor(scenarioContext);
    const scenarioLockedEntry = scenarioCatalog?.lockedEntries.find(entry => entry.callName === 'createText'
      && entry.expectedText === '"SCENARIO"');
    const scenarioBefore = sourceTextAt(
      scenarioContext || { source: b119PartialScalarScenarioSource },
      b119PartialScalarScenarioPath,
    );
    const scenarioApply = scenarioCatalog === undefined
      ? undefined
      : invokePublic(() => applyX4UiSourceEdit(
        b119PartialScalarScenarioWorkspace,
        b119PartialScalarScenarioSource,
        scenarioCatalog,
        b119PartialScalarScenarioDirectEntry?.id || `missing-${testCase.inputKind}-scenario-entry`,
        95,
        b119PartialScalarScenarioDirectEntry?.path,
        b119PartialScalarScenarioDirectEntry?.startOffset,
        b119PartialScalarScenarioDirectEntry?.endOffset,
        b119PartialScalarScenarioDirectEntry?.expectedText,
      ));
    const applyValue = scenarioApply?.value;
    const expectedScenarioRefusalDetail = 'mixed-stream scalar editing requires consumed source-bound samples, only source-owned finite dispatch selections, and only source-proven loop counts; clear unsupported preview inputs and reproject the target';
    const pass = scenarioContext !== undefined
      && testCase.active(scenarioContext)
      && scenarioContext.program.status === 'partial'
      && scenarioCatalog?.status === 'locked'
      && scenarioCatalog.reason === 'unsupported-provenance'
      && scenarioCatalog.detail === expectedScenarioRefusalDetail
      && scenarioCatalog.editableEntries.length === 0
      && b119PartialScalarStructuralCatalogIsEmpty(scenarioCatalog)
      && (testCase.inputKind !== 'sample'
        || (b119PartialScalarScenarioSampleInput !== undefined
          && b119PartialScalarScenarioSampleInput.values.length > 0
          && scenarioContext.program.previewSampleBindings.length === b119PartialScalarScenarioSampleInput.values.length
          && scenarioContext.program.previewSampleBindings.some(binding => binding.status === 'not-applied')))
      && scenarioApply?.threw === false
      && applyValue?.accepted === false
      && applyValue.reason === 'unsupported-provenance'
      && applyValue.detail === expectedScenarioRefusalDetail
      && b119PartialScalarScenarioDirectEntry !== undefined
      && applyValue.workspace === b119PartialScalarScenarioWorkspace
      && applyValue.source === b119PartialScalarScenarioSource
      && sourceTextAt(applyValue, b119PartialScalarScenarioPath) === scenarioBefore;
    return {
      name: testCase.id,
      pass,
      detail: JSON.stringify({
        inputKind: testCase.inputKind,
        projectionStatus: testCase.result.status,
        refusal: 'refusal' in testCase.result ? testCase.result.refusal : undefined,
        programStatus: scenarioContext?.program.status,
        active: scenarioContext === undefined ? false : testCase.active(scenarioContext),
        sampleBindings: scenarioContext?.program.previewSampleBindings.length,
        pathSelections: scenarioContext?.program.previewPathSelections.length,
        loopSelections: scenarioContext?.program.previewLoopSelections.length,
        sampleBindingStatuses: scenarioContext?.program.previewSampleBindings.map(binding => ({ id: binding.id, status: binding.status })),
        sampleNotApplied: scenarioContext?.program.previewSampleBindings.filter(binding => binding.status === 'not-applied').length,
        baseReady: b119PartialScalarScenarioBaseCatalog.status === 'ready'
          && b119PartialScalarScenarioBaseCatalog.editable,
        baseDirectEntry: b119PartialScalarScenarioDirectEntry?.id,
        sampleInputIssued: b119PartialScalarScenarioSampleInput !== undefined
          && b119PartialScalarScenarioSampleInput.values.length === b119PartialScalarScenarioBaseProgram.sampleCatalog.entries.length,
        lockedEntry: scenarioLockedEntry?.id,
        catalogStatus: scenarioCatalog?.status,
        catalogReason: scenarioCatalog?.reason,
        catalogDetail: scenarioCatalog?.detail,
        editableEntries: scenarioCatalog?.editableEntries.length,
        structuralEntries: scenarioCatalog?.structuralEntries.length,
        apply: {
          threw: scenarioApply?.threw,
          accepted: applyValue?.accepted,
          reason: applyValue?.accepted === false ? applyValue.reason : undefined,
          detail: applyValue?.accepted === false ? applyValue.detail : undefined,
        },
        sourceUnchanged: applyValue !== undefined
          && sourceTextAt(applyValue, b119PartialScalarScenarioPath) === scenarioBefore,
      }),
    };
  });
  checks.push(...b119PartialScalarScenarioRows);
  console.log(`x4UiSourceEdits B119 partial-scalar active-input negatives: ${JSON.stringify(b119PartialScalarScenarioRows)}`);

  const b119PartialScalarLoopScenarioWorkspace = workspace(b119PartialScalarLoopScenarioLua, {
    id: 'b119-partial-scalar-loop-scenario-source-edits-selftest',
    name: 'B119 partial scalar loop scenario source edits selftest',
    passthroughFiles: [
      passthrough('README.md', '# loop scenario bytes remain untouched\r\n', { reason: 'unknown_domain' }),
      passthrough('ui.xml', uiXml.replaceAll('ui/edit.lua', b119PartialScalarLoopScenarioPath)),
      passthrough(b119PartialScalarLoopScenarioPath, b119PartialScalarLoopScenarioLua, { reason: 'unparsed', bytes: new TextEncoder().encode(b119PartialScalarLoopScenarioLua).length }),
      passthrough('ui/loop-scenario-notes.txt', 'loop scenario sidecar remains untouched\r\n', { reason: 'unparsed' }),
    ],
  });
  const b119PartialScalarLoopScenarioSource = buildX4UiWorkspaceSource(b119PartialScalarLoopScenarioWorkspace);
  const b119PartialScalarLoopScenarioFile = b119PartialScalarLoopScenarioSource.bundle?.sourceFiles.find(file => file.path === b119PartialScalarLoopScenarioPath);
  if (!b119PartialScalarLoopScenarioFile) throw new Error('B119 partial scalar loop scenario source file missing');
  const b119PartialScalarLoopScenarioModel = normalizeX4UiSourceEditLayoutModel(b119PartialScalarLoopScenarioFile.callModel);
  const b119PartialScalarLoopScenarioTarget = createX4UiLayoutTargetCatalog(b119PartialScalarLoopScenarioModel).targets.find(target =>
    target.kind === 'function' && target.name === 'menu.createFrame');
  if (!b119PartialScalarLoopScenarioTarget) throw new Error('B119 partial scalar loop scenario target missing');
  const b119PartialScalarLoopScenarioProfile: X4UiLayoutProjectionProfile = {
    ...profileFor(b119PartialScalarLoopScenarioModel),
    localExpansion: { maxDepth: 4, maxInvocations: 16 },
  };
  const b119PartialScalarLoopScenarioBaseResult = projectX4UiLayoutProgram(
    b119PartialScalarLoopScenarioModel,
    b119PartialScalarLoopScenarioTarget,
    b119PartialScalarLoopScenarioProfile,
    undefined,
    undefined,
    undefined,
    canonicalCorpus,
  );
  if (b119PartialScalarLoopScenarioBaseResult.status === 'refused'
    || !b119PartialScalarLoopScenarioBaseResult.program
    || !b119PartialScalarLoopScenarioBaseResult.evidenceAuthority) {
    throw new Error(`B119 partial scalar loop scenario base projection refused: ${b119PartialScalarLoopScenarioBaseResult.status}`);
  }
  const b119PartialScalarLoopScenarioBaseProgram = b119PartialScalarLoopScenarioBaseResult.program;
  const b119PartialScalarLoopScenarioBaseContext: SourceEditFixtureContext = {
    workspace: b119PartialScalarLoopScenarioWorkspace,
    source: b119PartialScalarLoopScenarioSource,
    program: b119PartialScalarLoopScenarioBaseResult.program,
    evidenceAuthority: b119PartialScalarLoopScenarioBaseResult.evidenceAuthority,
  };
  const b119PartialScalarLoopScenarioBaseCatalog = catalogFor(b119PartialScalarLoopScenarioBaseContext);
  const b119PartialScalarLoopScenarioDirectEntry = b119PartialScalarLoopScenarioBaseCatalog.editableEntries.find(entry =>
    entry.provenance.callName === 'createFrameHandle'
      && entry.expectedText === '100'
      && entry.provenance.fields.some(field => field.includes('width')));
  const b119PartialScalarLoopScenarioReadyBefore = sourceTextAt(
    b119PartialScalarLoopScenarioBaseContext,
    b119PartialScalarLoopScenarioPath,
  );
  const b119PartialScalarLoopScenarioReadyApply = b119PartialScalarLoopScenarioDirectEntry === undefined
    ? undefined
    : invokePublic(() => applyX4UiSourceEdit(
      b119PartialScalarLoopScenarioWorkspace,
      b119PartialScalarLoopScenarioSource,
      b119PartialScalarLoopScenarioBaseCatalog,
      b119PartialScalarLoopScenarioDirectEntry.id,
      105,
      b119PartialScalarLoopScenarioDirectEntry.path,
      b119PartialScalarLoopScenarioDirectEntry.startOffset,
      b119PartialScalarLoopScenarioDirectEntry.endOffset,
      b119PartialScalarLoopScenarioDirectEntry.expectedText,
    ));
  const b119PartialScalarLoopScenarioReadyApplyValue = b119PartialScalarLoopScenarioReadyApply?.value;
  const b119PartialScalarLoopScenarioReadyAfter = b119PartialScalarLoopScenarioReadyApplyValue?.accepted === true
    ? sourceTextAt(b119PartialScalarLoopScenarioReadyApplyValue, b119PartialScalarLoopScenarioPath)
    : undefined;
  const b119PartialScalarLoopScenarioReadyExpected = b119PartialScalarLoopScenarioDirectEntry === undefined
    ? undefined
    : b119PartialScalarLoopScenarioReadyBefore.slice(0, b119PartialScalarLoopScenarioDirectEntry.startOffset)
      + '105'
      + b119PartialScalarLoopScenarioReadyBefore.slice(b119PartialScalarLoopScenarioDirectEntry.endOffset);
  const b119PartialScalarLoopScenarioReadyControlRow: Check = {
    name: 'B119 loop scenario without preview inputs retains a READY applied direct scalar control',
    pass: b119PartialScalarProgramIsMixed(b119PartialScalarLoopScenarioBaseContext)
      && b119PartialScalarHasNoSuppliedInputs(b119PartialScalarLoopScenarioBaseContext)
      && b119PartialScalarLoopScenarioBaseCatalog.status === 'ready'
      && b119PartialScalarLoopScenarioBaseCatalog.editable
      && b119PartialScalarLoopScenarioDirectEntry !== undefined
      && b119PartialScalarLoopScenarioReadyApply?.threw === false
      && b119PartialScalarLoopScenarioReadyApplyValue?.accepted === true
      && b119PartialScalarLoopScenarioReadyApplyValue.changed
      && b119PartialScalarLoopScenarioReadyApplyValue.reparsed
      && b119PartialScalarLoopScenarioReadyApplyValue.provenanceReestablished
      && b119PartialScalarLoopScenarioReadyAfter === b119PartialScalarLoopScenarioReadyExpected
      && sourceTextAt(b119PartialScalarLoopScenarioBaseContext, b119PartialScalarLoopScenarioPath)
        === b119PartialScalarLoopScenarioReadyBefore
      && b119PartialScalarStructuralCatalogIsEmpty(b119PartialScalarLoopScenarioBaseCatalog),
    detail: JSON.stringify({
      programStatus: b119PartialScalarLoopScenarioBaseProgram.status,
      operationStatuses: b119PartialScalarLoopScenarioBaseProgram.operations.map(operation => operation.status),
      catalogStatus: b119PartialScalarLoopScenarioBaseCatalog.status,
      catalogReason: b119PartialScalarLoopScenarioBaseCatalog.reason,
      editableEntries: b119PartialScalarLoopScenarioBaseCatalog.editableEntries.length,
      directEntry: b119PartialScalarLoopScenarioDirectEntry && {
        id: b119PartialScalarLoopScenarioDirectEntry.id,
        callName: b119PartialScalarLoopScenarioDirectEntry.provenance.callName,
        fields: b119PartialScalarLoopScenarioDirectEntry.provenance.fields,
        expectedText: b119PartialScalarLoopScenarioDirectEntry.expectedText,
      },
      structuralEntries: b119PartialScalarLoopScenarioBaseCatalog.structuralEntries.length,
      readyApply: {
        threw: b119PartialScalarLoopScenarioReadyApply?.threw,
        accepted: b119PartialScalarLoopScenarioReadyApplyValue?.accepted,
        changed: b119PartialScalarLoopScenarioReadyApplyValue?.accepted === true ? b119PartialScalarLoopScenarioReadyApplyValue.changed : undefined,
        reparsed: b119PartialScalarLoopScenarioReadyApplyValue?.accepted === true ? b119PartialScalarLoopScenarioReadyApplyValue.reparsed : undefined,
        provenanceReestablished: b119PartialScalarLoopScenarioReadyApplyValue?.accepted === true ? b119PartialScalarLoopScenarioReadyApplyValue.provenanceReestablished : undefined,
        exactDetachedSource: b119PartialScalarLoopScenarioReadyAfter === b119PartialScalarLoopScenarioReadyExpected,
        originalSourceUnchanged: sourceTextAt(b119PartialScalarLoopScenarioBaseContext, b119PartialScalarLoopScenarioPath)
          === b119PartialScalarLoopScenarioReadyBefore,
      },
    }),
  };
  checks.push(b119PartialScalarLoopScenarioReadyControlRow);
  console.log(`x4UiSourceEdits B119 partial-scalar loop no-input READY control: ${JSON.stringify(b119PartialScalarLoopScenarioReadyControlRow)}`);

  const b119PartialScalarLoopScenarioEntry = b119PartialScalarLoopScenarioBaseProgram.previewLoopCatalog.entries[0];
  const b119PartialScalarLoopScenarioInput = b119PartialScalarLoopScenarioEntry === undefined
    ? undefined
    : {
      catalogId: b119PartialScalarLoopScenarioBaseProgram.previewLoopCatalog.id,
      source: b119PartialScalarLoopScenarioBaseProgram.previewLoopCatalog.sourceIdentity,
      targetId: b119PartialScalarLoopScenarioBaseProgram.target.id,
      profileId: b119PartialScalarLoopScenarioBaseProgram.previewLoopCatalog.profileId,
      selections: [{ id: b119PartialScalarLoopScenarioEntry.id, iterationCount: 2 }],
    };
  const b119PartialScalarLoopScenarioResult = b119PartialScalarLoopScenarioInput === undefined
    ? undefined
    : projectX4UiLayoutProgram(
      b119PartialScalarLoopScenarioModel,
      b119PartialScalarLoopScenarioTarget,
      b119PartialScalarLoopScenarioProfile,
      undefined,
      undefined,
      undefined,
      canonicalCorpus,
      b119PartialScalarLoopScenarioInput,
    );
  const b119PartialScalarLoopScenarioContext = b119PartialScalarLoopScenarioResult === undefined
    || b119PartialScalarLoopScenarioResult.status === 'refused'
    || !b119PartialScalarLoopScenarioResult.program
    || !b119PartialScalarLoopScenarioResult.evidenceAuthority
    ? undefined
    : {
      workspace: b119PartialScalarLoopScenarioWorkspace,
      source: b119PartialScalarLoopScenarioSource,
      program: b119PartialScalarLoopScenarioResult.program,
      evidenceAuthority: b119PartialScalarLoopScenarioResult.evidenceAuthority,
    } satisfies SourceEditFixtureContext;
  const b119PartialScalarLoopScenarioCatalog = b119PartialScalarLoopScenarioContext === undefined
    ? undefined
    : catalogFor(b119PartialScalarLoopScenarioContext);
  const b119PartialScalarLoopScenarioBefore = sourceTextAt(
    b119PartialScalarLoopScenarioContext || { source: b119PartialScalarLoopScenarioSource },
    b119PartialScalarLoopScenarioPath,
  );
  const b119PartialScalarLoopScenarioApply = b119PartialScalarLoopScenarioCatalog === undefined
    ? undefined
    : invokePublic(() => applyX4UiSourceEdit(
      b119PartialScalarLoopScenarioWorkspace,
      b119PartialScalarLoopScenarioSource,
      b119PartialScalarLoopScenarioCatalog,
      b119PartialScalarLoopScenarioDirectEntry?.id || 'missing-loop-scenario-entry',
      105,
      b119PartialScalarLoopScenarioDirectEntry?.path,
      b119PartialScalarLoopScenarioDirectEntry?.startOffset,
      b119PartialScalarLoopScenarioDirectEntry?.endOffset,
      b119PartialScalarLoopScenarioDirectEntry?.expectedText,
    ));
  const b119PartialScalarLoopScenarioApplyValue = b119PartialScalarLoopScenarioApply?.value;
  const b119PartialScalarLoopScenarioRefusalDetail = 'mixed-stream scalar editing requires consumed source-bound samples, only source-owned finite dispatch selections, and only source-proven loop counts; clear unsupported preview inputs and reproject the target';
  const b119PartialScalarLoopScenarioRow: Check = {
    name: 'B119 mixed scalar with active source-bound loop input refuses',
    pass: b119PartialScalarLoopScenarioContext !== undefined
      && b119PartialScalarLoopScenarioResult?.status === 'partial'
      && b119PartialScalarLoopScenarioContext.program.status === 'partial'
      && b119PartialScalarLoopScenarioContext.program.previewLoopSelections.length === 1
      && b119PartialScalarLoopScenarioCatalog?.status === 'locked'
      && b119PartialScalarLoopScenarioCatalog.reason === 'unsupported-provenance'
      && b119PartialScalarLoopScenarioCatalog.detail === b119PartialScalarLoopScenarioRefusalDetail
      && b119PartialScalarLoopScenarioCatalog.editableEntries.length === 0
      && b119PartialScalarStructuralCatalogIsEmpty(b119PartialScalarLoopScenarioCatalog)
      && b119PartialScalarLoopScenarioApply?.threw === false
      && b119PartialScalarLoopScenarioApplyValue?.accepted === false
      && b119PartialScalarLoopScenarioApplyValue.reason === 'unsupported-provenance'
      && b119PartialScalarLoopScenarioApplyValue.detail === b119PartialScalarLoopScenarioRefusalDetail
      && b119PartialScalarLoopScenarioDirectEntry !== undefined
      && b119PartialScalarLoopScenarioApplyValue.workspace === b119PartialScalarLoopScenarioWorkspace
      && b119PartialScalarLoopScenarioApplyValue.source === b119PartialScalarLoopScenarioSource
      && sourceTextAt(b119PartialScalarLoopScenarioApplyValue, b119PartialScalarLoopScenarioPath)
        === b119PartialScalarLoopScenarioBefore,
    detail: JSON.stringify({
      projectionStatus: b119PartialScalarLoopScenarioResult?.status,
      refusal: b119PartialScalarLoopScenarioResult && 'refusal' in b119PartialScalarLoopScenarioResult
        ? b119PartialScalarLoopScenarioResult.refusal
        : undefined,
      programStatus: b119PartialScalarLoopScenarioContext?.program.status,
      loopSelections: b119PartialScalarLoopScenarioContext?.program.previewLoopSelections.length,
      baseReady: b119PartialScalarLoopScenarioBaseCatalog.status === 'ready'
        && b119PartialScalarLoopScenarioBaseCatalog.editable,
      baseDirectEntry: b119PartialScalarLoopScenarioDirectEntry?.id,
      catalogStatus: b119PartialScalarLoopScenarioCatalog?.status,
      catalogReason: b119PartialScalarLoopScenarioCatalog?.reason,
      catalogDetail: b119PartialScalarLoopScenarioCatalog?.detail,
      editableEntries: b119PartialScalarLoopScenarioCatalog?.editableEntries.length,
      structuralEntries: b119PartialScalarLoopScenarioCatalog?.structuralEntries.length,
      apply: {
        threw: b119PartialScalarLoopScenarioApply?.threw,
        accepted: b119PartialScalarLoopScenarioApplyValue?.accepted,
        reason: b119PartialScalarLoopScenarioApplyValue?.accepted === false ? b119PartialScalarLoopScenarioApplyValue.reason : undefined,
        detail: b119PartialScalarLoopScenarioApplyValue?.accepted === false ? b119PartialScalarLoopScenarioApplyValue.detail : undefined,
      },
      sourceUnchanged: b119PartialScalarLoopScenarioApplyValue !== undefined
        && sourceTextAt(b119PartialScalarLoopScenarioApplyValue, b119PartialScalarLoopScenarioPath)
          === b119PartialScalarLoopScenarioBefore,
    }),
  };
  checks.push(b119PartialScalarLoopScenarioRow);
  console.log(`x4UiSourceEdits B119 partial-scalar loop active-input negative: ${JSON.stringify(b119PartialScalarLoopScenarioRow)}`);

  const aggregateFailures = aggregateRows.filter(row => !row.pass);
  const failedBeforeFinalAssert = checks.filter(item => !item.pass);
  const causalFailures = causalRows.filter(row => !row.pass);
  const roundFourFailures = roundFourRows.filter(row => !row.pass);
  const roundFiveFailures = roundFiveRows.filter(row => !row.pass);
  const roundSixFailures = roundSixRows.filter(row => !row.pass);
  const roundSevenFailures = roundSevenRows.filter(row => !row.pass);
  const roundSevenAuditFailures = roundSevenAuditRows.filter(row => !row.pass);
  const retainedPayloadFailures = retainedPayloadRows.filter(row => !row.pass);
  console.log(`x4UiSourceEdits 8B round-two causal matrix: ${JSON.stringify({
    rows: causalRows.length,
    red: causalFailures.length,
    redRows: causalFailures,
    priorGreen: checks.length - failedBeforeFinalAssert.length,
    priorTotal: checks.length,
    priorScalar: scalarChecksBeforeBatch8B,
    priorStructural: structuralChecks.filter(item => item.pass).length,
  })}`);
  console.log(`x4UiSourceEdits 8B round-three aggregate matrix: ${JSON.stringify({
    rows: aggregateRows.length,
    red: aggregateFailures.length,
    redRows: aggregateFailures,
    green: aggregateRows.length - aggregateFailures.length,
  })}`);
  console.log(`x4UiSourceEdits 8B round-four causal matrix: ${JSON.stringify({
    rows: roundFourRows.length,
    red: roundFourFailures.length,
    redRowIds: roundFourFailures.map(row => row.id),
    redRows: roundFourFailures,
    green: roundFourRows.length - roundFourFailures.length,
  })}`);
  console.log(`x4UiSourceEdits 8B round-five coordinator-correction matrix: ${JSON.stringify({
    rows: roundFiveRows.length,
    red: roundFiveFailures.length,
    redRowIds: roundFiveFailures.map(row => row.id),
    redRows: roundFiveFailures,
    green: roundFiveRows.length - roundFiveFailures.length,
  })}`);
  console.log(`x4UiSourceEdits 8B round-six executable-reproduction matrix: ${JSON.stringify({
    rows: roundSixRows.length,
    red: roundSixFailures.length,
    redRowIds: roundSixFailures.map(row => row.id),
    redRows: roundSixFailures,
    green: roundSixRows.length - roundSixFailures.length,
    familyCounts: Object.fromEntries(['F1', 'F2', 'F3'].map(family => [family, roundSixRows.filter(row => row.family === family).length])),
    familyReds: Object.fromEntries(['F1', 'F2', 'F3'].map(family => [family, roundSixFailures.filter(row => row.family === family).length])),
  })}`);
  console.log(`x4UiSourceEdits 8B round-seven fresh-audit correction matrix: ${JSON.stringify({
    rows: roundSevenRows.length,
    red: roundSevenFailures.length,
    redRowIds: roundSevenFailures.map(row => row.id),
    redRows: roundSevenFailures,
    green: roundSevenRows.length - roundSevenFailures.length,
    familyCounts: Object.fromEntries(['F1', 'F2'].map(family => [family, roundSevenRows.filter(row => row.family === family).length])),
    familyReds: Object.fromEntries(['F1', 'F2'].map(family => [family, roundSevenFailures.filter(row => row.family === family).length])),
  })}`);
  console.log(`x4UiSourceEdits 8B round-seven audit candidate matrix: ${JSON.stringify({
    rows: roundSevenAuditRows.length,
    red: roundSevenAuditFailures.length,
    redRowIds: roundSevenAuditFailures.map(row => row.id),
    redRows: roundSevenAuditFailures,
    green: roundSevenAuditRows.length - roundSevenAuditFailures.length,
    familyCounts: Object.fromEntries(['order', 'kernel'].map(family => [family, roundSevenAuditRows.filter(row => row.family === family).length])),
    familyReds: Object.fromEntries(['order', 'kernel'].map(family => [family, roundSevenAuditFailures.filter(row => row.family === family).length])),
  })}`);
  console.log(`x4UiSourceEdits 8B round-seven producer-grounded kernel matrix: ${JSON.stringify({
    rows: roundSevenKernelRows.length,
    red: roundSevenKernelFailures.length,
    redRowIds: roundSevenKernelFailures.map(row => row.id),
    redRows: roundSevenKernelFailures,
    green: roundSevenKernelRows.length - roundSevenKernelFailures.length,
  })}`);
  console.log(`x4UiSourceEdits 8B retained-payload audit matrix: ${JSON.stringify({
    rows: retainedPayloadRows.length,
    allRows: retainedPayloadRows,
    red: retainedPayloadFailures.length,
    redRowIds: retainedPayloadFailures.map(row => row.id),
    redRows: retainedPayloadFailures,
    green: retainedPayloadRows.length - retainedPayloadFailures.length,
    recordTypes: Object.fromEntries(['property', 'handler', 'alias'].map(recordType => [
      recordType,
      retainedPayloadRows.filter(row => row.recordType === recordType).length,
    ])),
  })}`);
  console.log(`x4UiSourceEdits 8B tests-first fail-first: prior scalar ${scalarChecksBeforeBatch8B}/${scalarChecksBeforeBatch8B}; structural ${structuralChecks.filter(item => item.pass).length}/${structuralChecks.length}; prior total ${checks.length - failedBeforeFinalAssert.length}/${checks.length}; causal ${causalRows.length - causalFailures.length}/${causalRows.length}`);

  assert.equal(failedBeforeFinalAssert.length, 0, JSON.stringify(failedBeforeFinalAssert));
  assert.equal(causalFailures.length, 0, JSON.stringify(causalFailures));
  assert.equal(aggregateFailures.length, 0, JSON.stringify(aggregateFailures));
  assert.equal(roundFourFailures.length, 0, JSON.stringify(roundFourFailures));
  assert.equal(roundFiveFailures.length, 0, JSON.stringify(roundFiveFailures));
  assert.equal(roundSixFailures.length, 0, JSON.stringify(roundSixFailures));
  assert.equal(roundSevenFailures.length, 0, JSON.stringify(roundSevenFailures));
  assert.equal(roundSevenAuditFailures.length, 0, JSON.stringify(roundSevenAuditFailures));
  assert.equal(roundSevenKernelFailures.length, 0, JSON.stringify(roundSevenKernelFailures));
  assert.equal(retainedPayloadFailures.length, 0, JSON.stringify(retainedPayloadFailures));
  console.log(`x4UiSourceEdits selftest: PASS (${checks.length}/${checks.length})`);
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
