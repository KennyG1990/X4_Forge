import { strict as assert } from 'node:assert';
import type { ModWorkspace, PassthroughFile } from '../types';
import { addX4UiSourceBundleRegistration } from './x4UiSourceBundle';
import {
  buildX4UiWorkspaceSource,
  commitX4UiWorkspaceSourceSplice,
  createX4UiWorkspaceMenu,
  exportX4UiWorkspaceLua,
  importX4UiWorkspaceLua,
  isIssuedX4UiWorkspaceSourcePair,
  NOT_VERIFIED_IN_GAME,
  X4_UI_WORKSPACE_LUA_MAX_FILE_BYTES,
  X4_UI_WORKSPACE_LUA_MAX_TOTAL_INLINE_BYTES,
  spliceX4UiWorkspaceSource
} from './x4UiWorkspaceSource';

const firstLua = [
  '-- first',
  'local frame = Menus.createFrameHandle()',
  'frame:addTable(2)',
  'frame:addRow()',
  'frame[1][1]:setText("first")',
  ''
].join('\r\n');
const secondLua = [
  '-- second',
  'local frame = Menus.createFrameHandle()',
  'frame:addTable(3)',
  ''
].join('\n');
const orphanLua = '-- retained but not registered\r\n';
const uiXml = [
  '\uFEFF<?xml version="1.0" encoding="utf-8"?>',
  '<addon name="fixture" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
  '  <environment type="menus">',
  '    <!-- registration order is authoritative -->',
  '    <file name="ui/second.lua" />',
  '    <file name="ui/first.lua" />',
  '  </environment>',
  '</addon>',
  ''
].join('\r\n');

function passthrough(path: string, content?: string, extra: Partial<PassthroughFile> = {}): PassthroughFile {
  return {
    path,
    ...(content === undefined ? {} : { content }),
    ...extra
  };
}

function workspace(
  files: PassthroughFile[] = [],
  extra: Partial<ModWorkspace> = {}
): ModWorkspace {
  return {
    id: 'workspace_fixture',
    name: 'Workspace Fixture',
    version: '1.0.0',
    author: 'Forge',
    description: 'B119 workspace source fixture',
    nodes: [],
    links: [],
    uiWidgets: [],
    uiTheme: {
      backgroundColor: '#000000',
      borderColor: '#111111',
      accentColor: '#00ffff',
      opacity: 1,
      showIcons: true
    },
    compileSettings: {
      md: false,
      ui: true,
      ai: false,
      library: false,
      translations: false,
      patches: false
    },
    passthroughFiles: files,
    ...extra
  } as ModWorkspace;
}

function buttonWidget(): ModWorkspace['uiWidgets'][number] {
  return {
    id: 'active_widget',
    type: 'button',
    x: 10,
    y: 10,
    w: 120,
    h: 32,
    label: 'Active',
    properties: {}
  };
}

function fixtureWorkspace(): ModWorkspace {
  return workspace([
    passthrough('content.xml', '<content id="fixture"/>', { reason: 'unknown_domain' }),
    passthrough('ui.xml', uiXml, { reason: 'partial', bytes: uiXml.length }),
    passthrough('ui/first.lua', firstLua, { reason: 'unparsed' }),
    passthrough('README.md', '# retained\n', { reason: 'unknown_domain' }),
    passthrough('ui/second.lua', secondLua, { reason: 'partial' }),
    passthrough('ui/orphan.lua', orphanLua, { reason: 'unknown_domain' })
  ]);
}

function sourceFile(source: ReturnType<typeof buildX4UiWorkspaceSource>, path: string) {
  const file = source.bundle?.sourceFiles.find(candidate => candidate.path === path);
  assert.ok(file, `bundle source ${path} should exist`);
  return file;
}

function deepFreeze<T>(value: T, seen: WeakSet<object> = new WeakSet<object>()): T {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return value;
  const objectValue = value as unknown as object;
  if (seen.has(objectValue)) return value;
  seen.add(objectValue);
  const record = value as unknown as Record<PropertyKey, unknown>;
  for (const key of Reflect.ownKeys(record)) deepFreeze(record[key], seen);
  return Object.freeze(value);
}

function deepCloneAndFreeze<T>(value: T): T {
  return deepFreeze(structuredClone(value) as T);
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function inlineUtf8Bytes(files: readonly PassthroughFile[] | undefined): number {
  return (files ?? []).reduce((total, file) => total + (typeof file.content === 'string' ? utf8Bytes(file.content) : 0), 0);
}

function singleSourceFixture(
  text: string,
  extra: Partial<ModWorkspace> = {},
  bytes: number | undefined = utf8Bytes(text)
): {
  workspace: ModWorkspace;
  source: ReturnType<typeof buildX4UiWorkspaceSource>;
} {
  const root = '<addon><environment type="menus"><file name="ui/edit.lua"/></environment></addon>';
  const files = [
    passthrough('ui.xml', root, { reason: 'partial', bytes: utf8Bytes(root) }),
    passthrough('ui/edit.lua', text, {
      reason: 'partial',
      ...(bytes === undefined ? {} : { bytes })
    }),
    passthrough('README.md', '# retained\n', { reason: 'unknown_domain' })
  ];
  const fixture = workspace(files, extra);
  return { workspace: fixture, source: buildX4UiWorkspaceSource(fixture) };
}

function editText(text: string, expectedText: string, replacement: string) {
  const startOffset = text.indexOf(expectedText);
  assert.ok(startOffset >= 0, `expected test text should exist: ${expectedText}`);
  return {
    path: 'ui/edit.lua',
    startOffset,
    endOffset: startOffset + expectedText.length,
    expectedText,
    replacement
  };
}

function assertImportRefusal(
  result: ReturnType<typeof importX4UiWorkspaceLua>,
  workspaceValue: ModWorkspace,
  source: ReturnType<typeof buildX4UiWorkspaceSource>,
  beforeJson: string,
  reason?: string
): void {
  assert.equal(result.accepted, false);
  assert.equal(result.changed, false);
  assert.equal(result.workspace, workspaceValue, 'import refusal must preserve workspace identity');
  assert.equal(result.source, source, 'import refusal must preserve source identity');
  assert.equal(result.verification, NOT_VERIFIED_IN_GAME);
  if (reason !== undefined) assert.equal(result.reason, reason);
  assert.equal(JSON.stringify(workspaceValue), beforeJson, 'import refusal must not mutate the caller workspace');
}

function assertExportRefusal(
  result: ReturnType<typeof exportX4UiWorkspaceLua>,
  workspaceValue: ModWorkspace,
  source: ReturnType<typeof buildX4UiWorkspaceSource>,
  reason?: string
): void {
  assert.equal(result.accepted, false);
  assert.equal(result.changed, false);
  assert.equal(result.workspace, workspaceValue, 'export refusal must preserve workspace identity');
  assert.equal(result.source, source, 'export refusal must preserve source identity');
  assert.equal(result.verification, NOT_VERIFIED_IN_GAME);
  if (reason !== undefined) assert.equal(result.reason, reason);
}

function withoutPassthroughFiles(value: ModWorkspace): ModWorkspace {
  const clone = structuredClone(value) as ModWorkspace;
  delete clone.passthroughFiles;
  return clone;
}

function runLuaFileRoundtripMatrix(): void {
  const arbitraryLua = [
    '\uFEFF-- arbitrary imported source 🚀',
    'local state = {}',
    'function state.refresh(value)',
    '  state.value = value',
    '  return state.value',
    'end',
    'return state',
    ''
  ].join('\r\n');
  const dynamicLua = [
    'local menu = { name = "Dynamic", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 100 })',
    'local count = getCount()',
    'local table = frame:addTable(count, { width = 2, height = 20 })',
    'frame:display()',
    ''
  ].join('\n');

  const original = fixtureWorkspace();
  const source = buildX4UiWorkspaceSource(original);
  const originalJson = JSON.stringify(original);
  const originalMetadata = withoutPassthroughFiles(original);
  const exported = exportX4UiWorkspaceLua(original, source, 'ui/first.lua');
  assert.equal(exported.accepted, true, 'a parsed source file without known lint errors exports');
  if (exported.accepted) {
    assert.equal(exported.changed, false);
    assert.equal(exported.workspace, original);
    assert.equal(exported.source, source);
    assert.equal(exported.path, 'ui/first.lua');
    assert.equal(exported.text, firstLua, 'export must return the exact source text');
    assert.equal(exported.lint.parsed, true);
    assert.equal(exported.lint.hasErrors, false);
    assert.equal(exported.verification, NOT_VERIFIED_IN_GAME);
  }

  const imported = importX4UiWorkspaceLua(original, source, {
    path: 'ui/nested/imported.lua',
    text: arbitraryLua
  });
  if (imported.accepted === false) throw new Error(imported.detail);
  assert.equal(imported.changed, true);
  assert.equal(imported.path, 'ui/nested/imported.lua');
  assert.notEqual(imported.workspace, original);
  assert.notEqual(imported.source, source);
  assert.equal(imported.verification, NOT_VERIFIED_IN_GAME);
  assert.equal(JSON.stringify(original), originalJson, 'accepted import must not mutate the caller workspace');
  assert.deepEqual(withoutPassthroughFiles(imported.workspace), originalMetadata, 'workspace metadata and siblings must survive import');
  assert.equal(isIssuedX4UiWorkspaceSourcePair(imported.workspace, imported.source), true);
  assert.equal(imported.source.status, 'source-owned');
  assert.equal(imported.source.projection?.luaFiles.find(file => file.path === 'ui/nested/imported.lua')?.text, arbitraryLua);
  const importedRecord = imported.workspace.passthroughFiles?.find(file => file.path === 'ui/nested/imported.lua');
  assert.ok(importedRecord);
  assert.equal(importedRecord.content, arbitraryLua);
  assert.equal(importedRecord.bytes, utf8Bytes(arbitraryLua), 'import byte accounting must measure UTF-8');
  assert.equal(imported.workspace.passthroughFiles?.find(file => file.path === 'README.md')?.content, '# retained\n');
  const importedRegistration = imported.source.bundle?.registrations.filter(
    registration => registration.rawPath === 'ui/nested/imported.lua'
  );
  assert.equal(importedRegistration?.length, 1);
  assert.equal(importedRegistration?.[0].resolution, 'resolved');
  assert.equal(
    imported.workspace.passthroughFiles?.find(file => file.path === 'ui.xml')?.content?.match(/ui\/nested\/imported\.lua/g)?.length,
    1,
    'import must add one byte-local registration'
  );
  const expectedRegistration = addX4UiSourceBundleRegistration(source.bundle!, {
    path: 'ui/nested/imported.lua',
    text: arbitraryLua
  });
  assert.equal(expectedRegistration.accepted, true);
  if (expectedRegistration.accepted) {
    assert.equal(
      imported.workspace.passthroughFiles?.find(file => file.path === 'ui.xml')?.content,
      expectedRegistration.bundle.uiXml,
      'import must use the existing byte-local registration transaction'
    );
    const expectedFiles = original.passthroughFiles!.map((file, index) => index === 1
      ? { ...file, content: expectedRegistration.bundle.uiXml, bytes: utf8Bytes(expectedRegistration.bundle.uiXml) }
      : { ...file });
    expectedFiles.push({ path: 'ui/nested/imported.lua', content: arbitraryLua, reason: 'partial', bytes: utf8Bytes(arbitraryLua) });
    assert.deepEqual(imported.workspace.passthroughFiles, expectedFiles, 'all passthrough records and metadata must be preserved exactly');
  }
  const importedRoundTrip = exportX4UiWorkspaceLua(imported.workspace, imported.source, 'ui/nested/imported.lua');
  if (importedRoundTrip.accepted === false) throw new Error(importedRoundTrip.detail);
  assert.equal(importedRoundTrip.path, 'ui/nested/imported.lua');
  assert.equal(importedRoundTrip.text, arbitraryLua, 'BOM, CRLF, Unicode, and comments must survive round-trip export');
  const unicodeFilenameImport = importX4UiWorkspaceLua(original, source, {
    path: 'ui/普通-über.lua',
    text: arbitraryLua
  });
  if (unicodeFilenameImport.accepted === false) throw new Error(unicodeFilenameImport.detail);
  const unicodeFilenameExport = exportX4UiWorkspaceLua(unicodeFilenameImport.workspace, unicodeFilenameImport.source, 'ui/普通-über.lua');
  assert.equal(unicodeFilenameExport.accepted, true);
  if (unicodeFilenameExport.accepted) assert.equal(unicodeFilenameExport.path, 'ui/普通-über.lua');

  const dynamicImport = importX4UiWorkspaceLua(original, source, { path: 'ui/dynamic.lua', text: dynamicLua });
  if (dynamicImport.accepted === false) throw new Error(dynamicImport.detail);
  const dynamicExport = exportX4UiWorkspaceLua(dynamicImport.workspace, dynamicImport.source, 'ui/dynamic.lua');
  if (dynamicExport.accepted === false) throw new Error(dynamicExport.detail);
  assert.equal(dynamicExport.text, dynamicLua);
  assert.equal(dynamicExport.lint.parsed, true);
  assert.equal(dynamicExport.lint.hasErrors, false);
  assert.equal(dynamicExport.lint.hasVerificationGaps, true, 'unknown runtime values remain explicit');
  assert.equal(dynamicExport.lint.status, 'not-statically-verified');

  const lintErrorImport = importX4UiWorkspaceLua(original, source, {
    path: 'ui/lint-error.lua',
    text: firstLua.replace('frame:addTable(2)', 'frame:addTable(24)')
  });
  if (lintErrorImport.accepted === false) throw new Error(lintErrorImport.detail);
  const lintErrorExport = exportX4UiWorkspaceLua(lintErrorImport.workspace, lintErrorImport.source, 'ui/lint-error.lua');
  assertExportRefusal(lintErrorExport, lintErrorImport.workspace, lintErrorImport.source, 'lint-errors');
  assert.equal(lintErrorExport.lint?.hasErrors, true);
  assert.ok(lintErrorExport.lint?.findings.some(finding => finding.code === 'x4-ui.add-table-column-limit' && finding.severity === 'error'));

  const blankWorkspace = workspace();
  const blankSource = buildX4UiWorkspaceSource(blankWorkspace);
  assertExportRefusal(
    exportX4UiWorkspaceLua(blankWorkspace, blankSource, 'ui/blank.lua'),
    blankWorkspace,
    blankSource,
    'source-unavailable'
  );
  const blankImport = importX4UiWorkspaceLua(blankWorkspace, blankSource, {
    path: 'ui/blank-import.lua',
    text: arbitraryLua
  });
  if (blankImport.accepted === false) throw new Error(blankImport.detail);
  assert.deepEqual(blankImport.workspace.passthroughFiles?.map(file => file.path), ['ui.xml', 'ui/blank-import.lua']);
  assert.equal(blankImport.source.status, 'source-owned');

  const frozenWorkspace = deepCloneAndFreeze(original);
  const frozenSource = buildX4UiWorkspaceSource(frozenWorkspace);
  const frozenJson = JSON.stringify(frozenWorkspace);
  const frozenImport = importX4UiWorkspaceLua(frozenWorkspace, frozenSource, {
    path: 'ui/frozen-import.lua',
    text: arbitraryLua
  });
  assert.equal(frozenImport.accepted, true, 'import must work with frozen caller state');
  assert.equal(JSON.stringify(frozenWorkspace), frozenJson, 'frozen caller state must remain unchanged');

  const inPlaceWorkspace = fixtureWorkspace();
  const inPlaceSource = buildX4UiWorkspaceSource(inPlaceWorkspace);
  const inPlaceFiles = inPlaceWorkspace.passthroughFiles!;
  const inPlaceOriginalLua = inPlaceFiles[2].content;
  inPlaceFiles[2].content = `${String(inPlaceOriginalLua)}-- changed in place\n`;
  const inPlaceBefore = JSON.stringify(inPlaceWorkspace);
  assertImportRefusal(
    importX4UiWorkspaceLua(inPlaceWorkspace, inPlaceSource, { path: 'ui/in-place.lua', text: arbitraryLua }),
    inPlaceWorkspace,
    inPlaceSource,
    inPlaceBefore,
    'workspace-source-mismatch'
  );
  assertExportRefusal(
    exportX4UiWorkspaceLua(inPlaceWorkspace, inPlaceSource, 'ui/first.lua'),
    inPlaceWorkspace,
    inPlaceSource,
    'workspace-source-mismatch'
  );

  const compileMutationWorkspace = fixtureWorkspace();
  const compileMutationSource = buildX4UiWorkspaceSource(compileMutationWorkspace);
  compileMutationWorkspace.compileSettings = { ...compileMutationWorkspace.compileSettings, ui: false };
  const compileMutationBefore = JSON.stringify(compileMutationWorkspace);
  assertImportRefusal(
    importX4UiWorkspaceLua(compileMutationWorkspace, compileMutationSource, { path: 'ui/compile-mutation.lua', text: arbitraryLua }),
    compileMutationWorkspace,
    compileMutationSource,
    compileMutationBefore,
    'workspace-source-mismatch'
  );
  assertExportRefusal(
    exportX4UiWorkspaceLua(compileMutationWorkspace, compileMutationSource, 'ui/first.lua'),
    compileMutationWorkspace,
    compileMutationSource,
    'workspace-source-mismatch'
  );

  const copiedExportWorkspace = structuredClone(original) as ModWorkspace;
  assertExportRefusal(
    exportX4UiWorkspaceLua(copiedExportWorkspace, source, 'ui/first.lua'),
    copiedExportWorkspace,
    source,
    'workspace-source-mismatch'
  );
  const forgedExportSource = deepCloneAndFreeze(source);
  assertExportRefusal(
    exportX4UiWorkspaceLua(original, forgedExportSource, 'ui/first.lua'),
    original,
    forgedExportSource,
    'workspace-source-mismatch'
  );

  const pathCases: Array<[string, string]> = [
    ['ui/not-lua.txt', 'wrong-extension'],
    ['../escape.lua', 'unsafe-traversal-path'],
    ['ui/../escape.lua', 'unsafe-traversal-path'],
    ['/absolute.lua', 'unsafe-absolute-path'],
    ['C:\\absolute.lua', 'unsafe-absolute-path'],
    ['ui/unsafe\u0000.lua', 'invalid-path'],
    [`ui/lone-\uD800.lua`, 'invalid-path'],
    ['ui/./dot.lua', 'invalid-path'],
    ['ui//empty-segment.lua', 'invalid-path'],
    ['ui/CON.lua', 'device-name'],
    ['ui/sub/PRN.lua', 'device-name'],
    ['ui/COM¹.lua', 'device-name'],
    ['ui/COM².lua', 'device-name'],
    ['ui/COM³.lua', 'device-name'],
    ['ui/LPT¹.lua', 'device-name'],
    ['ui/LPT².lua', 'device-name'],
    ['ui/LPT³.lua', 'device-name'],
    ['ui/nested/com³.lua', 'device-name'],
    ['ui/COM¹/safe.lua', 'device-name'],
    ['UI\\FIRST.LUA', 'path-collision']
  ];
  for (const [path, reason] of pathCases) {
    const before = JSON.stringify(original);
    assertImportRefusal(importX4UiWorkspaceLua(original, source, { path, text: arbitraryLua }), original, source, before, reason);
    if (reason === 'device-name') {
      assertExportRefusal(exportX4UiWorkspaceLua(original, source, path), original, source, 'device-name');
    }
  }

  const nulTextBefore = JSON.stringify(original);
  assertImportRefusal(
    importX4UiWorkspaceLua(original, source, { path: 'ui/nul-content.lua', text: 'return \u0000' }),
    original,
    source,
    nulTextBefore,
    'nul-content'
  );
  const binaryTextBefore = JSON.stringify(original);
  assertImportRefusal(
    importX4UiWorkspaceLua(original, source, { path: 'ui/binary.lua', text: 'return \u0001' }),
    original,
    source,
    binaryTextBefore,
    'binary-content'
  );
  const loneHighBefore = JSON.stringify(original);
  assertImportRefusal(
    importX4UiWorkspaceLua(original, source, { path: 'ui/lone-high.lua', text: `return \uD800` }),
    original,
    source,
    loneHighBefore,
    'lone-surrogate'
  );
  const loneLowBefore = JSON.stringify(original);
  assertImportRefusal(
    importX4UiWorkspaceLua(original, source, { path: 'ui/lone-low.lua', text: `return \uDC00` }),
    original,
    source,
    loneLowBefore,
    'lone-surrogate'
  );

  const tooLargeBefore = JSON.stringify(original);
  assertImportRefusal(
    importX4UiWorkspaceLua(original, source, {
      path: 'ui/too-large.lua',
      text: 'x'.repeat(X4_UI_WORKSPACE_LUA_MAX_FILE_BYTES + 1)
    }),
    original,
    source,
    tooLargeBefore,
    'file-too-large'
  );
  const exactBytesLua = `--${'x'.repeat(X4_UI_WORKSPACE_LUA_MAX_FILE_BYTES - 3)}\n`;
  assert.equal(utf8Bytes(exactBytesLua), X4_UI_WORKSPACE_LUA_MAX_FILE_BYTES);
  const exactBytesImport = importX4UiWorkspaceLua(original, source, { path: 'ui/exact-boundary.lua', text: exactBytesLua });
   if (exactBytesImport.accepted === false) throw new Error(exactBytesImport.detail);
  const exactBytesExport = exportX4UiWorkspaceLua(exactBytesImport.workspace, exactBytesImport.source, 'ui/exact-boundary.lua');
  assert.equal(exactBytesExport.accepted, true, 'an exact-boundary source remains exportable');
  if (exactBytesExport.accepted) assert.equal(exactBytesExport.text, exactBytesLua);

  const multibyteBodyLength = X4_UI_WORKSPACE_LUA_MAX_FILE_BYTES - 3;
  const multibyteEmojiCount = Math.floor(multibyteBodyLength / 4);
  const multibyteRemainder = multibyteBodyLength - multibyteEmojiCount * 4;
  const multibyteLua = `--${'🚀'.repeat(multibyteEmojiCount)}${'x'.repeat(multibyteRemainder)}\n`;
  assert.equal(utf8Bytes(multibyteLua), X4_UI_WORKSPACE_LUA_MAX_FILE_BYTES);
  const multibyteImport = importX4UiWorkspaceLua(original, source, { path: 'ui/multibyte.lua', text: multibyteLua });
  if (multibyteImport.accepted === false) throw new Error(multibyteImport.detail);
  const multibyteRecord = multibyteImport.workspace.passthroughFiles?.find(file => file.path === 'ui/multibyte.lua');
  assert.equal(multibyteRecord?.bytes, X4_UI_WORKSPACE_LUA_MAX_FILE_BYTES);
  const multibyteExport = exportX4UiWorkspaceLua(multibyteImport.workspace, multibyteImport.source, 'ui/multibyte.lua');
  assert.equal(multibyteExport.accepted, true);
  if (multibyteExport.accepted) assert.equal(multibyteExport.text, multibyteLua);

  const exportOverCapText = `--${'x'.repeat(X4_UI_WORKSPACE_LUA_MAX_FILE_BYTES - 2)}\n`;
  assert.equal(utf8Bytes(exportOverCapText), X4_UI_WORKSPACE_LUA_MAX_FILE_BYTES + 1);
  const exportOverCapFixture = singleSourceFixture(exportOverCapText);
  const exportOverCap = exportX4UiWorkspaceLua(exportOverCapFixture.workspace, exportOverCapFixture.source, 'ui/edit.lua');
  assertExportRefusal(exportOverCap, exportOverCapFixture.workspace, exportOverCapFixture.source, 'file-too-large');

  const aggregateExactRoot = '<addon name="aggregate"><environment type="menus"></environment></addon>';
  const aggregateExactBase = workspace([
    passthrough('ui.xml', aggregateExactRoot, { reason: 'partial' }),
    passthrough('README.md', '', { reason: 'unknown_domain' })
  ]);
  const aggregateExactSource = buildX4UiWorkspaceSource(aggregateExactBase);
  const aggregateExactText = 'return "🚀"\n';
  const aggregateExactRegistration = addX4UiSourceBundleRegistration(aggregateExactSource.bundle!, {
    path: 'ui/aggregate-exact.lua',
    text: aggregateExactText
  });
  assert.equal(aggregateExactRegistration.accepted, true);
  if (aggregateExactRegistration.accepted) {
    const fixedAggregateBytes = utf8Bytes(aggregateExactRegistration.bundle.uiXml) + utf8Bytes(aggregateExactText);
    const exactReadmeBytes = X4_UI_WORKSPACE_LUA_MAX_TOTAL_INLINE_BYTES - fixedAggregateBytes;
    assert.ok(exactReadmeBytes >= 0);
    aggregateExactBase.passthroughFiles![1].content = 'r'.repeat(exactReadmeBytes);
    const aggregateExactBefore = JSON.stringify(aggregateExactBase);
    const aggregateExactResult = importX4UiWorkspaceLua(aggregateExactBase, buildX4UiWorkspaceSource(aggregateExactBase), {
      path: 'ui/aggregate-exact.lua',
      text: aggregateExactText
    });
    if (aggregateExactResult.accepted === false) throw new Error(aggregateExactResult.detail);
    assert.equal(inlineUtf8Bytes(aggregateExactResult.workspace.passthroughFiles), X4_UI_WORKSPACE_LUA_MAX_TOTAL_INLINE_BYTES);
    assert.notEqual(JSON.stringify(aggregateExactResult.workspace), aggregateExactBefore, 'the exact-boundary aggregate transaction should commit');
    assert.equal(JSON.stringify(aggregateExactBase), aggregateExactBefore, 'the exact-boundary aggregate caller must remain unchanged');
    const aggregateExactExport = exportX4UiWorkspaceLua(aggregateExactResult.workspace, aggregateExactResult.source, 'ui/aggregate-exact.lua');
    if (aggregateExactExport.accepted === false) throw new Error(aggregateExactExport.detail);
    assert.equal(aggregateExactExport.text, aggregateExactText, 'the exact-boundary aggregate source must export unchanged');
  }
  const aggregateOverExportWorkspace = workspace([
    passthrough('ui.xml', '<addon name="aggregate-over"><environment type="menus"><file name="ui/aggregate-over.lua"/></environment></addon>'),
    passthrough('ui/aggregate-over.lua', 'return 1\n'),
    passthrough('README.md', 'x'.repeat(X4_UI_WORKSPACE_LUA_MAX_TOTAL_INLINE_BYTES))
  ]);
  const aggregateOverExportSource = buildX4UiWorkspaceSource(aggregateOverExportWorkspace);
  assertExportRefusal(
    exportX4UiWorkspaceLua(aggregateOverExportWorkspace, aggregateOverExportSource, 'ui/aggregate-over.lua'),
    aggregateOverExportWorkspace,
    aggregateOverExportSource,
    'aggregate-too-large'
  );
  const aggregateWorkspace = workspace([passthrough('README.md', 'x'.repeat(X4_UI_WORKSPACE_LUA_MAX_TOTAL_INLINE_BYTES))]);
  const aggregateSource = buildX4UiWorkspaceSource(aggregateWorkspace);
  const aggregateBefore = JSON.stringify(aggregateWorkspace);
  assertImportRefusal(
    importX4UiWorkspaceLua(aggregateWorkspace, aggregateSource, { path: 'ui/aggregate.lua', text: 'return 1\n' }),
    aggregateWorkspace,
    aggregateSource,
    aggregateBefore,
    'aggregate-too-large'
  );

  const malformedBefore = JSON.stringify(original);
  assertImportRefusal(
    importX4UiWorkspaceLua(original, source, { path: 'ui/malformed.lua', text: 'function broken(' }),
    original,
    source,
    malformedBefore,
    // SourceBundle intentionally exposes this as an umbrella refusal rather
    // than a parser-only diagnosis at this owner boundary.
    'resulting-source-invalid'
  );

  const staleWorkspace = structuredClone(original) as ModWorkspace;
  staleWorkspace.passthroughFiles![2].content = `${firstLua}-- stale\n`;
  const staleBefore = JSON.stringify(staleWorkspace);
  assertImportRefusal(
    importX4UiWorkspaceLua(staleWorkspace, source, { path: 'ui/stale.lua', text: arbitraryLua }),
    staleWorkspace,
    source,
    staleBefore,
    'workspace-source-mismatch'
  );
  const forgedSource = deepCloneAndFreeze(source);
  const forgedBefore = JSON.stringify(original);
  assertImportRefusal(
    importX4UiWorkspaceLua(original, forgedSource, { path: 'ui/forged.lua', text: arbitraryLua }),
    original,
    forgedSource,
    forgedBefore,
    'workspace-source-mismatch'
  );

  const lockedWorkspace = workspace([
    passthrough('ui.xml', '<addon><environment type="menus"><file name="ui/bad.lua"/></environment></addon>'),
    passthrough('ui/bad.lua', 'function broken(')
  ]);
  const lockedSource = buildX4UiWorkspaceSource(lockedWorkspace);
  const lockedBefore = JSON.stringify(lockedWorkspace);
  assert.equal(lockedSource.status, 'locked');
  assertImportRefusal(
    importX4UiWorkspaceLua(lockedWorkspace, lockedSource, { path: 'ui/repair.lua', text: arbitraryLua }),
    lockedWorkspace,
    lockedSource,
    lockedBefore,
    'source-locked'
  );

  const shadowBase = fixtureWorkspace();
  const shadowWorkspace = workspace(shadowBase.passthroughFiles!, { uiWidgets: [buttonWidget()] });
  const shadowSource = buildX4UiWorkspaceSource(shadowWorkspace);
  const shadowBefore = JSON.stringify(shadowWorkspace);
  assert.equal(shadowSource.status, 'generated-shadowing-source');
  assertImportRefusal(
    importX4UiWorkspaceLua(shadowWorkspace, shadowSource, { path: 'ui/shadow.lua', text: arbitraryLua }),
    shadowWorkspace,
    shadowSource,
    shadowBefore,
    'generated-shadowing-source'
  );

  assertExportRefusal(
    exportX4UiWorkspaceLua(original, source, '../escape.lua'),
    original,
    source,
    'unsafe-traversal-path'
  );
  assertExportRefusal(
    exportX4UiWorkspaceLua(original, source, 'ui/orphan.lua'),
    original,
    source,
    'not-registered'
  );
  assertExportRefusal(
    exportX4UiWorkspaceLua(original, source, 'ui/missing.lua'),
    original,
    source,
    'not-registered'
  );
}

function detachmentExtra(): Partial<ModWorkspace> {
  return {
    nodes: [{
      id: 'node',
      type: 'action',
      label: 'Action',
      xmlTag: 'action',
      x: 1,
      y: 2,
      properties: { nested: { value: 'original' } },
      propertiesSchema: [],
      inputs: [],
      outputs: []
    }],
    links: [{
      id: 'link',
      sourceNodeId: 'node',
      sourcePortId: 'out',
      targetNodeId: 'node',
      targetPortId: 'in',
      waypoints: [{ x: 3, y: 4 }]
    }],
    uiWidgets: [{
      id: 'widget',
      type: 'button',
      x: 5,
      y: 6,
      w: 100,
      h: 24,
      label: 'Widget',
      properties: { nested: { value: 'original' } },
      includeInBuild: false
    }],
    uiTheme: {
      backgroundColor: '#000000',
      borderColor: '#111111',
      accentColor: '#00ffff',
      opacity: 1,
      showIcons: true
    },
    compileSettings: {
      md: false,
      ui: true,
      ai: false,
      library: false,
      translations: false,
      patches: false
    }
  };
}

function runCausalMatrix(): void {
  const asciiText = [
    '-- ascii',
    'local frame = Menus.createFrameHandle()',
    'frame:addTable(1)',
    ''
  ].join('\n');
  const deletionText = [
    '-- deletion',
    'local frame = Menus.createFrameHandle()',
    'frame:addTable(123)',
    ''
  ].join('\n');
  const unicodeText = [
    '-- cafe',
    'local frame = Menus.createFrameHandle()',
    'frame:addTable(1)',
    ''
  ].join('\n');

  const rows: readonly { id: string; description: string; run: () => void }[] = [
    {
      id: 'A',
      description: 'accepted ASCII insertion updates bytes',
      run: () => {
        const { workspace: input, source } = singleSourceFixture(asciiText);
        const result = spliceX4UiWorkspaceSource(input, source, editText(asciiText, '1', '123'));
        assert.equal(result.accepted, true);
        const expected = asciiText.replace('1', '123');
        const changed = result.workspace.passthroughFiles?.[1];
        assert.equal(changed?.content, expected);
        assert.equal(changed?.bytes, utf8Bytes(expected));
      }
    },
    {
      id: 'B',
      description: 'accepted ranged deletion updates bytes',
      run: () => {
        const { workspace: input, source } = singleSourceFixture(deletionText);
        const result = spliceX4UiWorkspaceSource(input, source, editText(deletionText, '23', ''));
        assert.equal(result.accepted, true);
        const expected = deletionText.replace('23', '');
        const changed = result.workspace.passthroughFiles?.[1];
        assert.equal(changed?.content, expected);
        assert.equal(changed?.bytes, utf8Bytes(expected));
      }
    },
    {
      id: 'C',
      description: 'astral and non-ASCII source uses actual UTF-8 bytes',
      run: () => {
        const { workspace: input, source } = singleSourceFixture(unicodeText);
        const result = spliceX4UiWorkspaceSource(input, source, editText(unicodeText, 'e', 'é🚀'));
        assert.equal(result.accepted, true);
        const expected = unicodeText.replace('e', 'é🚀');
        assert.notEqual(expected.length, utf8Bytes(expected));
        const changed = result.workspace.passthroughFiles?.[1];
        assert.equal(changed?.content, expected);
        assert.equal(changed?.bytes, utf8Bytes(expected));
      }
    },
    {
      id: 'D',
      description: 'accepted output detaches caller-owned workspace and source graph',
      run: () => {
        const { workspace: input, source } = singleSourceFixture(
          asciiText,
          detachmentExtra()
        );
        const result = spliceX4UiWorkspaceSource(input, source, editText(asciiText, '1', '2'));
        assert.equal(result.accepted, true, 'D accepted');
        assert.notEqual(result.workspace, input, 'D workspace');
        assert.notEqual(result.workspace.nodes, input.nodes, 'D nodes array');
        assert.notEqual(result.workspace.nodes[0], input.nodes[0], 'D node record');
        assert.notEqual(result.workspace.links, input.links, 'D links array');
        assert.notEqual(result.workspace.links[0], input.links[0], 'D link record');
        assert.notEqual(result.workspace.uiWidgets, input.uiWidgets, 'D widgets array');
        assert.notEqual(result.workspace.uiWidgets[0], input.uiWidgets[0], 'D widget record');
        assert.notEqual(result.workspace.uiTheme, input.uiTheme, 'D theme');
        assert.notEqual(result.workspace.compileSettings, input.compileSettings, 'D compile settings');
        assert.notEqual(result.workspace.passthroughFiles, input.passthroughFiles, 'D passthrough array');
        for (const [index, record] of (result.workspace.passthroughFiles || []).entries()) {
          assert.notEqual(record, input.passthroughFiles?.[index], `passthrough record ${index} must detach`);
        }
        assert.notEqual(result.source, source, 'D source');
        assert.notEqual(result.source.rootFile, source.rootFile, 'D root record');
        assert.notEqual(result.source.rootCandidates, source.rootCandidates, 'D root candidates');
        assert.notEqual(result.source.luaFiles, source.luaFiles, 'D lua records');
        assert.notEqual(result.source.registeredLuaFiles, source.registeredLuaFiles, 'D registered lua records');
        assert.notEqual(result.source.cas, source.cas, 'D CAS');
        assert.notEqual(result.source.cas.passthroughFiles, source.cas.passthroughFiles, 'D CAS passthrough');
        assert.notEqual(result.source.cas.luaBindings, source.cas.luaBindings, 'D CAS bindings');
        assert.notEqual(result.source.bundle, source.bundle, 'D bundle');
        assert.notEqual(result.source.bundle?.sourceFiles, source.bundle?.sourceFiles, 'D bundle sources');
      }
    },
    {
      id: 'E',
      description: 'caller input remains identical, mutable, and unfrozen',
      run: () => {
        const { workspace: input, source } = singleSourceFixture(
          asciiText,
          detachmentExtra()
        );
        const originalJson = JSON.stringify(input);
        const originalNodes = input.nodes;
        const originalNode = input.nodes[0];
        const originalNodeProperties = originalNode.properties;
        const originalFiles = input.passthroughFiles;
        const result = spliceX4UiWorkspaceSource(input, source, editText(asciiText, '1', '2'));
        assert.equal(result.accepted, true, 'E accepted');
        const returnedNode = result.workspace.nodes[0];
        (returnedNode.properties as Record<string, unknown>).nested = { value: 'returned' };
        (result.workspace.passthroughFiles![0] as PassthroughFile).path = 'mutated-in-return';
        deepFreeze(result.workspace);
        assert.equal(JSON.stringify(input), originalJson, 'E input JSON');
        assert.equal(input.nodes, originalNodes, 'E nodes array identity');
        assert.equal(input.nodes[0], originalNode, 'E node identity');
        assert.equal(input.nodes[0].properties, originalNodeProperties, 'E properties identity');
        assert.equal(input.passthroughFiles, originalFiles, 'E passthrough array identity');
        assert.equal(Object.isFrozen(input), false, 'E workspace unfrozen');
        assert.equal(Object.isFrozen(input.nodes), false, 'E nodes array unfrozen');
        assert.equal(Object.isFrozen(input.nodes[0]), false, 'E node unfrozen');
        assert.equal(Object.isFrozen(input.nodes[0].properties), false, 'E properties unfrozen');
        assert.equal(Object.isFrozen(input.passthroughFiles), false, 'E passthrough array unfrozen');
        assert.equal(Object.isFrozen(input.passthroughFiles![0]), false, 'E passthrough record unfrozen');
      }
    }
  ];

  const redRows: string[] = [];
  for (const row of rows) {
    try {
      row.run();
      console.log(`WorkspaceSource causal ${row.id} GREEN: ${row.description}`);
    } catch (error) {
      const detail = error instanceof Error
        ? `${error.message} @ ${error.stack?.split('\n')[1]?.trim() || 'unknown'}`
        : String(error);
      redRows.push(row.id);
      console.log(`WorkspaceSource causal ${row.id} RED: ${row.description} :: ${detail}`);
    }
  }
  console.log(
    `WorkspaceSource causal matrix: ${rows.length - redRows.length}/${rows.length} green; `
      + `red=${redRows.length}; rows=${redRows.join(',') || 'none'}`
  );
  assert.deepEqual(redRows, [], 'all WorkspaceSource causal matrix rows must pass');
}

function runReadOnlyMenuCreationRegression(): void {
  for (const mode of ['frozen', 'read-only'] as const) {
    const metadataKey = Symbol('retained source metadata');
    const sibling = passthrough('content.xml', '<content id="kept"/>\r\n', { reason: 'unknown_domain', bytes: 22 });
    Object.defineProperty(sibling, metadataKey, {
      value: { origin: 'import', tags: ['retained'] }, enumerable: false, writable: false, configurable: false
    });
    const seed = workspace([sibling]);
    if (mode === 'read-only') Object.setPrototypeOf(seed, null);
    Object.defineProperty(seed, metadataKey, {
      value: { history: ['before creation'] }, enumerable: false, writable: false, configurable: false
    });
    const first = createX4UiWorkspaceMenu(seed, buildX4UiWorkspaceSource(seed), 'First repair menu');
    assert.equal(first.accepted, true);
    const firstText = sourceFile(first.source, first.menu.path).text;
    const edited = spliceX4UiWorkspaceSource(first.workspace, first.source, {
      ...editText(firstText, '"First repair menu"', '"Edited first menu"'), path: first.menu.path
    });
    assert.equal(edited.accepted, true, `${mode}: realistic first-menu title splice must succeed`);
    const input = edited.workspace;
    if (mode === 'frozen') deepFreeze(input);
    else Object.defineProperty(input, 'passthroughFiles', { writable: false, configurable: false, enumerable: false });
    assert.equal(isIssuedX4UiWorkspaceSourcePair(input, edited.source), true, `${mode}: freezing must retain the exact issued pair`);
    const inputFiles = input.passthroughFiles!;
    const inputJson = JSON.stringify(input);
    const inputDescriptors = Object.getOwnPropertyDescriptors(input);
    const fileDescriptors = inputFiles.map(file => Object.getOwnPropertyDescriptors(file));
    const filesDescriptor = Object.getOwnPropertyDescriptor(input, 'passthroughFiles')!;
    assert.equal(filesDescriptor.writable, false);

    // SourceEdits returns frozen accepted workspaces; New menu must consume that
    // same issued identity without assigning through its read-only descriptors.
    const next = createX4UiWorkspaceMenu(input, edited.source, 'Second repair menu');
    assert.equal(next.accepted, true, `${mode}: New menu after an immutable source edit must succeed`);
    assert.equal(isIssuedX4UiWorkspaceSourcePair(next.workspace, next.source), true);
    assert.equal(next.source.status, 'source-owned');
    assert.equal(next.source.shippable, true);
    assert.notEqual(next.workspace, input);
    assert.equal(Object.getPrototypeOf(next.workspace), Object.getPrototypeOf(input));
    assert.notEqual(next.workspace.passthroughFiles, inputFiles);
    assert.equal(next.workspace.passthroughFiles?.length, inputFiles.length + 1);
    assert.deepEqual(Object.getOwnPropertyDescriptor(next.workspace, 'passthroughFiles'), {
      ...filesDescriptor, value: next.workspace.passthroughFiles
    }, `${mode}: replace only the property value, retaining its descriptor flags`);
    for (const key of Reflect.ownKeys(input)) {
      if (key === 'passthroughFiles') continue;
      assert.deepEqual(Object.getOwnPropertyDescriptor(next.workspace, key), Object.getOwnPropertyDescriptor(input, key),
        `${mode}: unrelated own property ${String(key)} retains its descriptor and data`);
    }
    const retainedMetadata = Object.getOwnPropertyDescriptor(next.workspace, metadataKey)?.value;
    const inputMetadata = Object.getOwnPropertyDescriptor(input, metadataKey)?.value;
    assert.notEqual(retainedMetadata, inputMetadata);
    assert.deepEqual(Object.getOwnPropertyDescriptors(retainedMetadata.history),
      Object.getOwnPropertyDescriptors(inputMetadata.history),
      `${mode}: nested metadata array descriptors are retained`);
    for (const [index, file] of inputFiles.entries()) {
      if (file.path === 'ui.xml') continue;
      const retained = next.workspace.passthroughFiles![index];
      assert.notEqual(retained, file);
      assert.equal(Object.getPrototypeOf(retained), Object.getPrototypeOf(file));
      assert.deepEqual(Object.getOwnPropertyDescriptors(retained), fileDescriptors[index],
        `${mode}: sibling ${file.path} retains exact bytes, metadata and descriptors`);
    }
    const oldRoot = inputFiles.find(file => file.path === 'ui.xml')!;
    const newRoot = next.workspace.passthroughFiles!.find(file => file.path === 'ui.xml')!;
    assert.equal(newRoot.content?.includes(first.menu.path), true);
    assert.equal(newRoot.content?.includes(next.menu.path), true);
    assert.equal(newRoot.reason, oldRoot.reason);
    assert.equal(newRoot.bytes, utf8Bytes(newRoot.content!));
    assert.equal(sourceFile(next.source, first.menu.path).text, firstText.replace('"First repair menu"', '"Edited first menu"'));
    const nextEdit = spliceX4UiWorkspaceSource(input, edited.source, {
      ...editText(sourceFile(edited.source, first.menu.path).text, '"Edited first menu"', '"Edited again"'), path: first.menu.path
    });
    assert.equal(nextEdit.accepted, true, `${mode}: the shared clone also supports a subsequent source splice`);
    assert.equal(isIssuedX4UiWorkspaceSourcePair(nextEdit.workspace, nextEdit.source), true);
    assert.deepEqual(Object.getOwnPropertyDescriptor(nextEdit.workspace, 'passthroughFiles'), {
      ...filesDescriptor, value: nextEdit.workspace.passthroughFiles
    });
    assert.equal(sourceFile(nextEdit.source, first.menu.path).text, firstText.replace('"First repair menu"', '"Edited again"'));
    assert.equal(JSON.stringify(input), inputJson, `${mode}: original workspace bytes are unchanged`);
    assert.equal(input.passthroughFiles, inputFiles);
    assert.deepEqual(Object.getOwnPropertyDescriptors(input), inputDescriptors);
    inputFiles.forEach((file, index) => assert.deepEqual(Object.getOwnPropertyDescriptors(file), fileDescriptors[index]));
    assert.equal(Object.isFrozen(input), mode === 'frozen');
    assert.equal(Object.isFrozen(seed), false, 'freezing the detached edit must not freeze the earlier caller');
    const stale = createX4UiWorkspaceMenu(next.workspace, edited.source, 'Stale repair menu');
    assert.equal(stale.accepted, false, `${mode}: the old issued source cannot authorize the new workspace`);
    assert.equal(stale.reason, 'workspace-source-mismatch');
    const duplicate = createX4UiWorkspaceMenu(next.workspace, next.source, 'Second repair menu');
    assert.equal(duplicate.accepted, false);
    assert.equal(duplicate.reason, 'path-collision');
    console.log(`WorkspaceSource New menu after ${mode} source edit: PASS`);
  }
  const withoutFiles = workspace();
  delete withoutFiles.passthroughFiles;
  deepFreeze(withoutFiles);
  const firstFromMissing = createX4UiWorkspaceMenu(withoutFiles, buildX4UiWorkspaceSource(withoutFiles), 'Missing files menu');
  assert.equal(firstFromMissing.accepted, true, 'source-less creation still adds an absent optional passthroughFiles property');
  assert.equal(firstFromMissing.workspace.passthroughFiles?.length, 2);
  assert.equal(Object.hasOwn(withoutFiles, 'passthroughFiles'), false, 'the frozen source-less caller remains unchanged');
}

function run(): void {
  const original = fixtureWorkspace();
  const originalFiles = original.passthroughFiles!;
  const originalJson = JSON.stringify(original);
  const source = buildX4UiWorkspaceSource(original);

  assert.equal(source.status, 'source-owned');
  assert.equal(source.reason, 'source-owned');
  assert.equal(source.verification, NOT_VERIFIED_IN_GAME);
  assert.equal(source.bundle?.xml.status, 'parsed');
  assert.deepEqual(
    source.bundle?.orderedFiles.map(file => file.path),
    ['ui/second.lua', 'ui/first.lua'],
    'registered Lua must materialize in ui.xml registration order'
  );
  assert.deepEqual(
    source.projection?.luaFiles.map(file => file.path),
    ['ui/first.lua', 'ui/second.lua', 'ui/orphan.lua'],
    'no-edit projection must retain passthrough input order including unregistered Lua'
  );
  assert.equal(source.bundle?.unregisteredFiles[0].path, 'ui/orphan.lua');
  assert.equal(source.luaFiles[0].path, 'ui/first.lua');
  assert.equal(source.luaFiles[0].reason, 'unparsed');
  assert.equal(source.rootFile?.path, 'ui.xml');
  assert.equal(source.rootFile?.reason, 'partial');
  assert.equal(source.projection?.uiXml, uiXml);
  assert.equal(source.projection?.luaFiles[0].text, firstLua);
  assert.equal(source.projection?.luaFiles[1].text, secondLua);
  assert.equal(source.projection?.luaFiles[2].text, orphanLua);
  assert.equal(source.compile.generatedRootUiXml, false);
  assert.equal(source.compile.authority, 'source-owned');
  assert.equal(source.compile.shippable, true);
  assert.equal(source.shippable, true);
  assert.equal(source.editable, true);
  assert.equal(JSON.stringify(original), originalJson, 'projection must not mutate workspace input');
  assert.equal(original.passthroughFiles, originalFiles, 'input array identity must remain intact');
  assert.ok(Object.isFrozen(source));
  assert.ok(Object.isFrozen(source.cas));
  assert.ok(Object.isFrozen(source.cas.passthroughFiles));
  assert.ok(Object.isFrozen(source.bundle));
  assert.ok(Object.isFrozen(source.projection));
  assert.deepEqual(
    buildX4UiWorkspaceSource(original),
    buildX4UiWorkspaceSource(original),
    'identical workspace inputs must produce deterministic adapter results'
  );

  const secondWorkspace = fixtureWorkspace();
  const secondSource = buildX4UiWorkspaceSource(secondWorkspace);
  assert.equal(isIssuedX4UiWorkspaceSourcePair(original, source), true, 'exact source pair must be issued');
  assert.equal(isIssuedX4UiWorkspaceSourcePair(secondWorkspace, secondSource), true, 'each build must issue its exact pair');

  const clonedWorkspace = deepCloneAndFreeze(original);
  const clonedSource = deepCloneAndFreeze(source);
  assert.ok(Object.isFrozen(clonedWorkspace));
  assert.ok(Object.isFrozen(clonedWorkspace.passthroughFiles));
  assert.ok(Object.isFrozen(clonedSource));
  assert.ok(Object.isFrozen(clonedSource.cas));
  assert.equal(
    isIssuedX4UiWorkspaceSourcePair(clonedWorkspace, clonedSource),
    false,
    'a deeply cloned and frozen coherent pair must fail closed'
  );
  assert.equal(isIssuedX4UiWorkspaceSourcePair(clonedWorkspace, source), false, 'workspace clones must fail');
  assert.equal(isIssuedX4UiWorkspaceSourcePair(original, clonedSource), false, 'source clones must fail');
  assert.equal(isIssuedX4UiWorkspaceSourcePair(original, secondSource), false, 'cross-build source pairs must fail');
  assert.equal(isIssuedX4UiWorkspaceSourcePair(secondWorkspace, source), false, 'cross-build workspace pairs must fail');

  const statusCases = [
    [workspace(originalFiles, { uiWidgets: [buttonWidget()] }), 'generated-shadowing-source'],
    [workspace([]), 'unavailable'],
    [workspace([
      passthrough('ui.xml', '<addon><environment type="menus"><file name="ui/missing.lua"/></environment></addon>')
    ]), 'locked']
  ] as const;
  for (const [statusWorkspace, expectedStatus] of statusCases) {
    const statusSource = buildX4UiWorkspaceSource(statusWorkspace);
    assert.equal(statusSource.status, expectedStatus);
    assert.equal(isIssuedX4UiWorkspaceSourcePair(statusWorkspace, statusSource), true);
  }

  let observableProxyReads = 0;
  const proxyHandler: ProxyHandler<object> = {
    get() {
      observableProxyReads += 1;
      throw new Error('proxy get trap should not run');
    },
    has() {
      observableProxyReads += 1;
      throw new Error('proxy has trap should not run');
    },
    ownKeys() {
      observableProxyReads += 1;
      throw new Error('proxy ownKeys trap should not run');
    },
    getOwnPropertyDescriptor() {
      observableProxyReads += 1;
      throw new Error('proxy descriptor trap should not run');
    },
    getPrototypeOf() {
      observableProxyReads += 1;
      throw new Error('proxy prototype trap should not run');
    }
  };
  const proxyWorkspace = new Proxy(original, proxyHandler);
  const proxySource = new Proxy(source, proxyHandler);
  assert.doesNotThrow(() => isIssuedX4UiWorkspaceSourcePair(proxyWorkspace, source));
  assert.equal(isIssuedX4UiWorkspaceSourcePair(proxyWorkspace, source), false);
  assert.doesNotThrow(() => isIssuedX4UiWorkspaceSourcePair(original, proxySource));
  assert.equal(isIssuedX4UiWorkspaceSourcePair(original, proxySource), false);
  assert.equal(observableProxyReads, 0, 'proxy traps must not be observed');

  let observableGetterReads = 0;
  const accessorWorkspace = Object.defineProperty({}, 'workspace', {
    get() {
      observableGetterReads += 1;
      throw new Error('workspace getter should not run');
    }
  });
  const accessorSource = Object.defineProperty({}, 'source', {
    get() {
      observableGetterReads += 1;
      throw new Error('source getter should not run');
    }
  });
  assert.doesNotThrow(() => isIssuedX4UiWorkspaceSourcePair(accessorWorkspace, source));
  assert.equal(isIssuedX4UiWorkspaceSourcePair(accessorWorkspace, source), false);
  assert.doesNotThrow(() => isIssuedX4UiWorkspaceSourcePair(original, accessorSource));
  assert.equal(isIssuedX4UiWorkspaceSourcePair(original, accessorSource), false);
  assert.equal(observableGetterReads, 0, 'accessors must not be observed');

  const primitiveCandidates: readonly [unknown, unknown][] = [
    [null, source],
    [undefined, source],
    [0, source],
    ['workspace', source],
    [original, null],
    [original, undefined],
    [original, 0],
    [original, 'source']
  ];
  for (const [workspaceCandidate, sourceCandidate] of primitiveCandidates) {
    assert.doesNotThrow(() => isIssuedX4UiWorkspaceSourcePair(workspaceCandidate, sourceCandidate));
    assert.equal(isIssuedX4UiWorkspaceSourcePair(workspaceCandidate, sourceCandidate), false);
  }

  const first = sourceFile(source, 'ui/first.lua');
  const firstOffset = first.text.indexOf('2');
  assert.ok(firstOffset >= 0);
  runCausalMatrix();
  const accepted = commitX4UiWorkspaceSourceSplice(original, source, {
    path: 'ui/first.lua',
    startOffset: firstOffset,
    endOffset: firstOffset + 1,
    expectedText: '2',
    replacement: '4'
  });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.reason, null);
  assert.notEqual(accepted.workspace, original);
  assert.notEqual(accepted.workspace.passthroughFiles![1], originalFiles[1], 'root record must detach');
  assert.equal(accepted.workspace.passthroughFiles![2].path, 'ui/first.lua');
  assert.equal(accepted.workspace.passthroughFiles![2].content, firstLua.replace('addTable(2)', 'addTable(4)'));
  assert.notEqual(accepted.workspace.passthroughFiles![2], originalFiles[2], 'exactly one record must be replaced');
  assert.notEqual(accepted.workspace.passthroughFiles![3], originalFiles[3], 'unrelated records must detach');
  assert.notEqual(accepted.workspace.passthroughFiles![4], originalFiles[4], 'registered sibling must detach');
  assert.equal(originalFiles[2].content, firstLua, 'source workspace must remain unchanged');
  assert.equal(accepted.source.status, 'source-owned');
  assert.equal(
    isIssuedX4UiWorkspaceSourcePair(accepted.workspace, accepted.source),
    true,
    'successful splice output must issue its exact next pair'
  );

  const staleTextFiles = originalFiles.map((file, index) => index === 2
    ? { ...file, content: `${file.content}-- concurrent edit\n` }
    : file);
  const staleTextWorkspace = workspace(staleTextFiles);
  const staleText = spliceX4UiWorkspaceSource(staleTextWorkspace, source, {
    path: 'ui/first.lua',
    startOffset: firstOffset,
    endOffset: firstOffset + 1,
    expectedText: '2',
    replacement: '4'
  });
  assert.equal(staleText.accepted, false);
  assert.equal(staleText.reason, 'concurrent-passthrough-change');
  assert.equal(staleText.workspace, staleTextWorkspace, 'stale target must return exact workspace identity');
  assert.equal(staleText.source, source, 'stale target must return exact source identity');

  const unrelatedChangedWorkspace = workspace(originalFiles.map((file, index) => index === 3
    ? { ...file, content: '# concurrently changed\n' }
    : file));
  const unrelatedChanged = spliceX4UiWorkspaceSource(unrelatedChangedWorkspace, source, {
    path: 'ui/first.lua',
    startOffset: firstOffset,
    endOffset: firstOffset + 1,
    expectedText: '2',
    replacement: '4'
  });
  assert.equal(unrelatedChanged.accepted, false);
  assert.equal(unrelatedChanged.reason, 'concurrent-passthrough-change');
  assert.equal(unrelatedChanged.workspace, unrelatedChangedWorkspace);

  const staleExpected = spliceX4UiWorkspaceSource(original, source, {
    path: 'ui/first.lua',
    startOffset: firstOffset,
    endOffset: firstOffset + 1,
    expectedText: '9',
    replacement: '4'
  });
  assert.equal(staleExpected.accepted, false);
  assert.equal(staleExpected.reason, 'expected-text-mismatch');
  assert.equal(staleExpected.workspace, original);
  assert.equal(staleExpected.source, source);

  const activeWidgets = buildX4UiWorkspaceSource(
    workspace(originalFiles, { uiWidgets: [buttonWidget()] })
  );
  assert.equal(activeWidgets.status, 'generated-shadowing-source');
  assert.equal(activeWidgets.reason, 'generated-root-ui-xml');
  assert.equal(activeWidgets.compile.generatedRootUiXml, true);
  assert.deepEqual(activeWidgets.compile.generatedCollisions, ['ui.xml']);
  assert.equal(activeWidgets.projection, null, 'shadowed source must never be shippable projection');
  assert.equal(activeWidgets.compile.shippableProjection, null);
  assert.equal(activeWidgets.shippable, false);
  assert.equal(spliceX4UiWorkspaceSource(workspace(originalFiles, { uiWidgets: [buttonWidget()] }), activeWidgets, {
    path: 'ui/first.lua', startOffset: firstOffset, endOffset: firstOffset + 1, expectedText: '2', replacement: '4'
  }).reason, 'generated-shadowing-source');

  const activeCustomLua = buildX4UiWorkspaceSource(
    workspace(originalFiles, { customLua: '-- generated custom UI\n' })
  );
  assert.equal(activeCustomLua.status, 'generated-shadowing-source');
  assert.equal(activeCustomLua.compile.activeCustomLua, true);
  assert.equal(activeCustomLua.compile.generatedRootUiXml, true);

  const compileGuardWorkspace = workspace(originalFiles, {
    uiWidgets: [buttonWidget()],
    compileSettings: { md: false, ui: false, ai: false, library: false, translations: false, patches: false }
  });
  const compileGuardSource = buildX4UiWorkspaceSource(compileGuardWorkspace);
  assert.equal(compileGuardSource.status, 'source-owned');
  compileGuardWorkspace.uiWidgets[0].label = 'Changed after inspection';
  const compileGuardCreation = createX4UiWorkspaceMenu(compileGuardWorkspace, compileGuardSource, 'Compile Drift');
  assert.equal(compileGuardCreation.accepted, false);
  assert.equal(compileGuardCreation.reason, 'workspace-source-mismatch');

  const disabledUi = buildX4UiWorkspaceSource(
    workspace(originalFiles, {
      uiWidgets: [buttonWidget()],
      customLua: 'return true\n',
      compileSettings: { md: false, ui: false, ai: false, library: false, translations: false, patches: false }
    })
  );
  assert.equal(disabledUi.status, 'source-owned', 'disabled UI compile must not invent generated output');
  assert.equal(disabledUi.compile.uiCompileEnabled, false);
  assert.equal(disabledUi.compile.generatedRootUiXml, false);
  assert.equal(disabledUi.compile.shippable, true);

  const generatedPathCollision = buildX4UiWorkspaceSource(original, {
    generatedPaths: ['ui/first.lua']
  });
  assert.equal(generatedPathCollision.status, 'generated-shadowing-source');
  assert.equal(generatedPathCollision.reason, 'generated-path-collision');
  assert.deepEqual(generatedPathCollision.compile.generatedCollisions, ['ui/first.lua']);
  assert.equal(generatedPathCollision.projection, null);

  const noSource = buildX4UiWorkspaceSource(workspace([]));
  assert.equal(noSource.status, 'unavailable');
  assert.equal(noSource.reason, 'no-root-ui-xml');
  assert.equal(noSource.bundle, null);

  const duplicateRootWorkspace = workspace([
    passthrough('ui.xml', uiXml),
    passthrough('UI.XML', uiXml),
    passthrough('ui/first.lua', firstLua),
    passthrough('ui/second.lua', secondLua)
  ]);
  const duplicateRoot = buildX4UiWorkspaceSource(duplicateRootWorkspace);
  assert.equal(duplicateRoot.status, 'unavailable');
  assert.equal(duplicateRoot.reason, 'duplicate-root-ui-xml');
  assert.equal(duplicateRoot.rootCandidates.length, 2);
  assert.equal(duplicateRoot.bundle, null, 'duplicate roots must never choose a winner');

  const omittedRoot = buildX4UiWorkspaceSource(workspace([
    passthrough('ui.xml', undefined, { omitted: true, bytes: uiXml.length }),
    passthrough('ui/first.lua', firstLua)
  ]));
  assert.equal(omittedRoot.status, 'unavailable');
  assert.equal(omittedRoot.reason, 'omitted-root-ui-xml');

  const missingLua = buildX4UiWorkspaceSource(workspace([
    passthrough('ui.xml', '<addon><environment type="menus"><file name="ui/missing.lua"/></environment></addon>')
  ]));
  assert.equal(missingLua.status, 'locked');
  assert.ok(missingLua.reasons.includes('missing-registered-lua'));

  const omittedLua = buildX4UiWorkspaceSource(workspace([
    passthrough('ui.xml', '<addon><environment type="menus"><file name="ui/missing.lua"/></environment></addon>'),
    passthrough('ui/missing.lua', undefined, { omitted: true, bytes: 99 })
  ]));
  assert.equal(omittedLua.status, 'locked');
  assert.ok(omittedLua.reasons.includes('omitted-lua-source'));
  assert.ok(omittedLua.reasons.includes('missing-registered-lua'));

  const duplicateRegistration = buildX4UiWorkspaceSource(workspace([
    passthrough('ui.xml', '<addon><environment type="menus"><file name="ui/first.lua"/><file name="ui/first.lua"/></environment></addon>'),
    passthrough('ui/first.lua', firstLua)
  ]));
  assert.equal(duplicateRegistration.status, 'locked');
  assert.ok(duplicateRegistration.reasons.includes('duplicate-registered-lua'));

  const ambiguousLua = buildX4UiWorkspaceSource(workspace([
    passthrough('ui.xml', '<addon><environment type="menus"><file name="ui/first.lua"/></environment></addon>'),
    passthrough('ui/first.lua', firstLua),
    passthrough('ui/first.lua', firstLua)
  ]));
  assert.equal(ambiguousLua.status, 'locked');
  assert.ok(ambiguousLua.reasons.includes('ambiguous-registered-lua'));

  const unsafePaths = buildX4UiWorkspaceSource(workspace([
    passthrough('ui.xml', [
      '<addon><environment type="menus">',
      '<file name="../escape.lua"/>',
      '<file name="/absolute.lua"/>',
      '<file name="C:\\absolute.lua"/>',
      '<file name="ui/unsafe\u0000.lua"/>',
      '<file name="ui\\safe-spelling.lua"/>',
      '</environment></addon>'
    ].join('')),
    passthrough('../escape.lua', '-- escape\n'),
    passthrough('/absolute.lua', '-- absolute\n'),
    passthrough('C:\\absolute.lua', '-- absolute\n'),
    passthrough('ui/unsafe\u0000.lua', '-- nul\n'),
    passthrough('ui\\safe-spelling.lua', '-- backslash spelling\n')
  ]));
  assert.equal(unsafePaths.status, 'locked');
  assert.ok(unsafePaths.reasons.includes('unsafe-source-path'));
  assert.ok(unsafePaths.bundle?.registrations.some(registration => registration.resolution === 'unsafe-traversal'));
  assert.ok(unsafePaths.bundle?.registrations.some(registration => registration.resolution === 'unsafe-absolute'));
  assert.ok(unsafePaths.bundle?.registrations.some(registration => registration.resolution === 'invalid-path'));

  const malformedXml = buildX4UiWorkspaceSource(workspace([
    passthrough('ui.xml', '<addon><environment type="menus"><file name="ui/first.lua"></addon>'),
    passthrough('ui/first.lua', firstLua)
  ]));
  assert.equal(malformedXml.status, 'locked');
  assert.ok(malformedXml.reasons.includes('malformed-xml'));

  const malformedLua = buildX4UiWorkspaceSource(workspace([
    passthrough('ui.xml', '<addon><environment type="menus"><file name="ui/bad.lua"/></environment></addon>'),
    passthrough('ui/bad.lua', 'local = syntax error\n')
  ]));
  assert.equal(malformedLua.status, 'locked');
  assert.ok(malformedLua.reasons.includes('malformed-lua'));

  const directOptions = buildX4UiWorkspaceSource(
    original,
    { passthroughLuaFiles: [originalFiles[2], originalFiles[4], originalFiles[5]] }
  );
  assert.equal(directOptions.status, 'source-owned');
  assert.deepEqual(directOptions.projection?.luaFiles.map(file => file.path), [
    'ui/first.lua', 'ui/second.lua', 'ui/orphan.lua'
  ]);

  const noOp = spliceX4UiWorkspaceSource(original, source, {
    path: 'ui/first.lua', startOffset: firstOffset, endOffset: firstOffset + 1, expectedText: '2', replacement: '2'
  });
  assert.equal(noOp.accepted, true);
  assert.equal(noOp.workspace, original, 'same-text splice must preserve workspace identity');

  const blankWorkspace = workspace([]);
  const blankSource = buildX4UiWorkspaceSource(blankWorkspace);
  const blankJson = JSON.stringify(blankWorkspace);
  const created = createX4UiWorkspaceMenu(blankWorkspace, blankSource, 'Captain "First" Menu');
  assert.equal(created.accepted, true);
  assert.equal(created.changed, true);
  assert.equal(created.menu.name, 'Captain "First" Menu');
  assert.equal(created.menu.path, 'ui/captain_first_menu.lua');
  assert.equal(created.menu.menuName, 'captain_first_menu_menu');
  assert.equal(created.menu.targetName, 'menu.createFrame');
  assert.equal(created.verification, NOT_VERIFIED_IN_GAME);
  assert.notEqual(created.workspace, blankWorkspace);
  assert.notEqual(created.source, blankSource);
  assert.equal(JSON.stringify(blankWorkspace), blankJson, 'blank creation must not mutate the caller workspace');
  assert.deepEqual(
    created.workspace.passthroughFiles?.map(file => file.path),
    ['ui.xml', 'ui/captain_first_menu.lua']
  );
  const createdRoot = created.workspace.passthroughFiles?.[0];
  const createdLua = created.workspace.passthroughFiles?.[1];
  assert.equal(
    createdRoot?.content?.includes('<addon name="workspace_fixture"'),
    true,
    'new ui.xml must use the workspace artifact identity instead of a shared constant addon name'
  );
  assert.equal(createdRoot?.bytes, utf8Bytes(createdRoot?.content || ''));
  assert.equal(createdLua?.bytes, utf8Bytes(createdLua?.content || ''));
  assert.equal(created.source.status, 'source-owned');
  assert.equal(created.source.shippable, true);
  assert.equal(created.source.editable, true);
  assert.equal(isIssuedX4UiWorkspaceSourcePair(created.workspace, created.source), true);
  assert.equal(created.source.bundle?.registrations.length, 1);
  assert.equal(created.source.bundle?.registrations[0].rawPath, 'ui/captain_first_menu.lua');
  assert.equal(created.source.bundle?.registrations[0].resolution, 'resolved');
  const createdFile = created.source.bundle?.sourceFiles.find(file => file.path === created.menu.path);
  assert.ok(createdFile);
  assert.equal(createdFile.registered, true);
  assert.equal(createdFile.editable, true);
  assert.equal(createdFile.parseStatus, 'parsed');
  assert.notEqual(createdFile.verificationStatus, 'locked', 'the created scaffold must remain parseable');
  assert.equal(createdFile.callModel.calls.some(call => (
    call.name === 'createFrameHandle' && call.context.name === 'menu.createFrame'
  )), true, 'created Lua must expose the direct menu.createFrame lifecycle');
  assert.equal(createdFile.callModel.calls.some(call => (
    call.name === 'addTable' && call.context.name === 'menu.createFrame'
  )), true, 'created Lua must build the two-column table in menu.createFrame');
  assert.equal(createdFile.callModel.calls.some(call => (
    call.name === 'createText' && call.context.name === 'menu.createFrame'
  )), true, 'created Lua must expose a visible text cell in menu.createFrame');
  assert.ok(createdLua?.content?.includes('Captain \\"First\\" Menu'));
  assert.ok(createdLua?.content?.includes('frame:addTable(2'));
  assert.ok(createdLua?.content?.includes('row[1]:createText('));
  assert.match(
    createdLua?.content || '',
    /Helper\.createFrameHandle\(menu, \{ x = 20, y = 20, width = 530, height = 180,/,
    'frame geometry must be represented by direct editable literals'
  );
  assert.match(
    createdLua?.content || '',
    /menu\.frame:addTable\(2, \{ x = 0, y = 0, width = 530, tabOrder = 1,/,
    'table geometry must be represented by direct editable literals'
  );
  assert.match(
    createdLua?.content || '',
    /row\[1\]:createText\("[^\n]+", \{ font = "Zekton", fontsize = 9, y = 2, halign = "center", wordwrap = false \}\)/,
    'text style must be represented by direct editable literals'
  );
  assert.equal(createdLua?.content?.includes('local width = Helper.scaleX(530)'), false);
  assert.equal(createdLua?.content?.includes('local height = Helper.scaleY(180)'), false);
  assert.equal(createdLua?.content?.includes('Helper.headerRowCenteredProperties'), false);
  assert.equal(
    /createText\([^\n]*height\s*=/.test(createdLua?.content || ''),
    false,
    'the scaffold must retain automatic text height'
  );
  assert.equal(createdLua?.content?.includes('local widgets'), false, 'creation must not use the uiWidgets representation');
  assert.equal(createdLua?.content?.includes('uiWidgets'), false, 'creation must not use the uiWidgets representation');
  assert.equal(createdLua?.content?.includes('autoOpen'), false, 'ordinary menu creation must not auto-open');
  assert.equal(createdLua?.content?.includes('x4_forge_template'), false, 'ordinary menu creation must not use preview auto-open');
  assert.equal(createdLua?.content?.includes('function menu.ensureRegistered()'), true);
  assert.equal(createdLua?.content?.includes('function menu.open(context)'), true);
  assert.equal(createdLua?.content?.includes('function menu.onCloseElement(dueToClose)'), true);

  const repeated = createX4UiWorkspaceMenu(created.workspace, created.source, 'Captain First Menu');
  assert.equal(repeated.accepted, false, 'repeated creation must explain the path collision');
  assert.equal(repeated.changed, false);
  assert.equal(repeated.workspace, created.workspace);
  assert.equal(repeated.source, created.source);
  assert.equal(repeated.reason, 'path-collision');

  const existingCreated = createX4UiWorkspaceMenu(original, source, 'New Existing Menu');
  assert.equal(existingCreated.accepted, true);
  assert.equal(existingCreated.menu.path, 'ui/new_existing_menu.lua');
  assert.equal(existingCreated.source.status, 'source-owned');
  assert.deepEqual(
    existingCreated.workspace.passthroughFiles?.slice(0, originalFiles.length).filter(file => file.path.toLowerCase() !== 'ui.xml').map(file => ({
      path: file.path,
      content: file.content,
      reason: file.reason,
      omitted: file.omitted,
      bytes: file.bytes,
      contentEncoding: file.contentEncoding
    })),
    originalFiles.filter(file => file.path.toLowerCase() !== 'ui.xml').map(file => ({
      path: file.path,
      content: file.content,
      reason: file.reason,
      omitted: file.omitted,
      bytes: file.bytes,
      contentEncoding: file.contentEncoding
    })),
    'existing passthrough records must remain byte-identical and in order'
  );
  const originalUiXml = originalFiles.find(file => file.path.toLowerCase() === 'ui.xml')?.content;
  const createdUiXml = existingCreated.workspace.passthroughFiles?.find(file => file.path.toLowerCase() === 'ui.xml')?.content;
  assert.equal(typeof originalUiXml, 'string');
  assert.equal(typeof createdUiXml, 'string');
  assert.notEqual(createdUiXml, originalUiXml, 'registration must change ui.xml');
  let localPrefixLength = 0;
  while (localPrefixLength < (originalUiXml as string).length
    && localPrefixLength < (createdUiXml as string).length
    && (originalUiXml as string)[localPrefixLength] === (createdUiXml as string)[localPrefixLength]) {
    localPrefixLength += 1;
  }
  let localSuffixLength = 0;
  while (localSuffixLength < (originalUiXml as string).length - localPrefixLength
    && localSuffixLength < (createdUiXml as string).length - localPrefixLength
    && (originalUiXml as string)[(originalUiXml as string).length - 1 - localSuffixLength]
      === (createdUiXml as string)[(createdUiXml as string).length - 1 - localSuffixLength]) {
    localSuffixLength += 1;
  }
  assert.equal(
    (createdUiXml as string).slice(0, localPrefixLength),
    (originalUiXml as string).slice(0, localPrefixLength),
    'ui.xml registration must preserve the exact prefix outside the insertion'
  );
  assert.equal(
    (createdUiXml as string).slice((createdUiXml as string).length - localSuffixLength),
    (originalUiXml as string).slice((originalUiXml as string).length - localSuffixLength),
    'ui.xml registration must preserve the exact suffix outside the insertion'
  );
  assert.ok((createdUiXml as string).includes('<file name="ui/new_existing_menu.lua" />'));
  assert.deepEqual(
    existingCreated.source.bundle?.registrations.map(registration => registration.rawPath),
    ['ui/second.lua', 'ui/first.lua', 'ui/new_existing_menu.lua']
  );
  assert.equal(existingCreated.source.bundle?.sourceFiles.find(file => file.path === 'ui/first.lua')?.text, firstLua);
  assert.equal(existingCreated.source.bundle?.sourceFiles.find(file => file.path === 'ui/second.lua')?.text, secondLua);
  assert.equal(existingCreated.source.bundle?.sourceFiles.find(file => file.path === 'ui/orphan.lua')?.text, orphanLua);

  const invalidNames = ['', '   ', 'A\nB', 'A\u0000B', 'x'.repeat(81)];
  for (const invalidName of invalidNames) {
    const invalid = createX4UiWorkspaceMenu(original, source, invalidName);
    assert.equal(invalid.accepted, false, `invalid name should refuse: ${JSON.stringify(invalidName)}`);
    assert.equal(invalid.changed, false);
    assert.equal(invalid.workspace, original);
    assert.equal(invalid.source, source);
    assert.equal(invalid.reason, 'invalid-name');
    assert.ok(invalid.detail.length > 0);
  }

  const windowsDeviceNames = ['CON', 'aux', 'NUL', 'COM1', 'LPT9'];
  for (const deviceName of windowsDeviceNames) {
    const deviceWorkspace = workspace([]);
    const deviceSource = buildX4UiWorkspaceSource(deviceWorkspace);
    const deviceCreation = createX4UiWorkspaceMenu(deviceWorkspace, deviceSource, deviceName);
    assert.equal(deviceCreation.accepted, true, `Windows device basename should be safely prefixed: ${deviceName}`);
    assert.equal(deviceCreation.menu.path, `ui/menu_${deviceName.toLowerCase()}.lua`);
    assert.equal(deviceCreation.menu.menuName, `menu_${deviceName.toLowerCase()}_menu`);
  }
  const deviceCollisionWorkspace = workspace([
    passthrough('ui.xml', '<addon name="fixture"><environment type="menus"><file name="ui/menu_con.lua" /></environment></addon>'),
    passthrough('ui/menu_con.lua', firstLua)
  ]);
  const deviceCollisionSource = buildX4UiWorkspaceSource(deviceCollisionWorkspace);
  const deviceCollision = createX4UiWorkspaceMenu(deviceCollisionWorkspace, deviceCollisionSource, 'CON');
  assert.equal(deviceCollision.accepted, false, 'the prefixed Windows-device path must still use normal collision guards');
  assert.equal(deviceCollision.reason, 'path-collision');

  const scopedAlphaWorkspace = workspace([], { name: 'Shared Friendly Name', contentId: 'alpha_mod' });
  const scopedBetaWorkspace = workspace([], { name: 'Shared Friendly Name', contentId: 'beta_mod' });
  const scopedAlpha = createX4UiWorkspaceMenu(
    scopedAlphaWorkspace,
    buildX4UiWorkspaceSource(scopedAlphaWorkspace),
    'Scoped Menu'
  );
  const scopedBeta = createX4UiWorkspaceMenu(
    scopedBetaWorkspace,
    buildX4UiWorkspaceSource(scopedBetaWorkspace),
    'Scoped Menu'
  );
  assert.equal(scopedAlpha.accepted, true);
  assert.equal(scopedBeta.accepted, true);
  assert.equal(scopedAlpha.workspace.passthroughFiles?.[0].content?.includes('<addon name="alpha_mod"'), true);
  assert.equal(scopedBeta.workspace.passthroughFiles?.[0].content?.includes('<addon name="beta_mod"'), true);
  assert.notEqual(scopedAlpha.workspace.passthroughFiles?.[0].content, scopedBeta.workspace.passthroughFiles?.[0].content);

  const pathCollision = createX4UiWorkspaceMenu(original, source, 'First');
  assert.equal(pathCollision.accepted, false);
  assert.equal(pathCollision.reason, 'path-collision');
  const dotAliasWorkspace = workspace([
    passthrough('ui.xml', '<addon name="fixture"><environment type="menus"><file name="ui/./first.lua" /></environment></addon>'),
    passthrough('ui/./first.lua', firstLua)
  ]);
  const dotAliasSource = buildX4UiWorkspaceSource(dotAliasWorkspace);
  const dotAliasCollision = createX4UiWorkspaceMenu(dotAliasWorkspace, dotAliasSource, 'First');
  assert.equal(dotAliasCollision.accepted, false);
  assert.equal(dotAliasCollision.reason, 'path-collision');

  const staleWorkspace = workspace(originalFiles.map((file, index) => index === 2
    ? { ...file, content: `${file.content}-- stale\n` }
    : file));
  const staleCreation = createX4UiWorkspaceMenu(staleWorkspace, source, 'Stale Menu');
  assert.equal(staleCreation.accepted, false);
  assert.equal(staleCreation.reason, 'workspace-source-mismatch');
  assert.equal(staleCreation.workspace, staleWorkspace);
  assert.equal(staleCreation.source, source);

  const forgedSource = deepCloneAndFreeze(source);
  const forgedCreation = createX4UiWorkspaceMenu(original, forgedSource, 'Forged Menu');
  assert.equal(forgedCreation.accepted, false);
  assert.equal(forgedCreation.reason, 'workspace-source-mismatch');
  assert.equal(forgedCreation.workspace, original);
  assert.equal(forgedCreation.source, forgedSource);

  const shadowWorkspace = workspace(originalFiles, { uiWidgets: [buttonWidget()] });
  const shadowSource = buildX4UiWorkspaceSource(shadowWorkspace);
  const generatedCreation = createX4UiWorkspaceMenu(shadowWorkspace, shadowSource, 'Generated Shadow Menu');
  assert.equal(generatedCreation.accepted, false);
  assert.equal(generatedCreation.reason, 'generated-shadowing-source');

  const emptyRootWorkspace = workspace([
    passthrough('ui.xml', '<addon name="fixture"><environment type="menus"/></addon>')
  ]);
  const emptyRootSource = buildX4UiWorkspaceSource(emptyRootWorkspace);
  const emptyRootCreation = createX4UiWorkspaceMenu(emptyRootWorkspace, emptyRootSource, 'Self Closing');
  assert.equal(emptyRootCreation.accepted, true);
  assert.equal(emptyRootCreation.source.status, 'source-owned');

  const selfClosingAddonWorkspace = workspace([
    passthrough('ui.xml', '<addon name="fixture"/>')
  ]);
  const selfClosingAddonSource = buildX4UiWorkspaceSource(selfClosingAddonWorkspace);
  const selfClosingAddonCreation = createX4UiWorkspaceMenu(selfClosingAddonWorkspace, selfClosingAddonSource, 'Self Closing Addon');
  assert.equal(selfClosingAddonCreation.accepted, true);
  assert.equal(selfClosingAddonCreation.source.status, 'source-owned');

  const malformedWorkspace = workspace([
    passthrough('ui.xml', '<addon name="fixture"><environment type="menus"><file name="ui/bad.lua"></addon>'),
    passthrough('ui/bad.lua', firstLua)
  ]);
  const malformedSource = buildX4UiWorkspaceSource(malformedWorkspace);
  const malformedCreation = createX4UiWorkspaceMenu(malformedWorkspace, malformedSource, 'Malformed Menu');
  assert.equal(malformedCreation.accepted, false);
  assert.equal(malformedCreation.reason, 'source-locked');

  const reservedWorkspace = workspace([
    passthrough('ui.xml', '<addon name="ego_fixture"><environment type="menus"></environment></addon>')
  ]);
  const reservedSource = buildX4UiWorkspaceSource(reservedWorkspace);
  const reservedCreation = createX4UiWorkspaceMenu(reservedWorkspace, reservedSource, 'Reserved Menu');
  assert.equal(reservedCreation.accepted, false);
  assert.equal(reservedCreation.reason, 'reserved-addon-name');

  const noRootWithOtherFiles = workspace([
    passthrough('content.xml', '<content id="fixture"/>')
  ]);
  const noRootSource = buildX4UiWorkspaceSource(noRootWithOtherFiles);
  const noRootJson = JSON.stringify(noRootWithOtherFiles);
  const noRootCreation = createX4UiWorkspaceMenu(noRootWithOtherFiles, noRootSource, 'No Root');
  assert.equal(noRootCreation.accepted, true, 'content.xml-only workspaces are source-less but eligible');
  assert.equal(noRootCreation.source.status, 'source-owned');
  assert.deepEqual(
    noRootCreation.workspace.passthroughFiles?.[0],
    noRootWithOtherFiles.passthroughFiles?.[0],
    'source-less creation must preserve ordinary passthrough files'
  );
  assert.equal(JSON.stringify(noRootWithOtherFiles), noRootJson, 'source-less creation must not mutate the caller workspace');

  runLuaFileRoundtripMatrix();
  runReadOnlyMenuCreationRegression();
  console.log('x4UiWorkspaceSource selftest: PASS');
}

run();
