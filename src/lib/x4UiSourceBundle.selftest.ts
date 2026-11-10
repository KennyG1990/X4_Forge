import { strict as assert } from 'node:assert';
import {
  buildX4MenuLuaRuntimeInventory,
  buildX4UiSourceBundle,
  projectX4UiSourceBundle,
  readX4MenuLuaPaths,
  spliceX4UiSourceBundle,
  type X4UiSourceBundleInput,
  type X4UiSourceSplice
} from './x4UiSourceBundle';

const firstLua = '\uFEFF-- first\r\nlocal frame = Menus.createFrameHandle()\r\nframe:addTable(2)\r\nframe:addRow()\r\nframe[1][1]:setText("one")\r\n';
const secondLua = '-- second\r\nlocal frame = Menus.createFrameHandle()\r\nlocal count = getCount()\r\nframe:addTable(count)\r\n';
const orphanLua = '-- orphan\r\n';

const orderedInput: X4UiSourceBundleInput = {
  uiXml: '\uFEFF<ui>\r\n  <environment type="menus">\r\n    <file name="ui/second.lua"/>\r\n    <!-- preserve this comment -->\r\n    <file name="ui/first.lua"/>\r\n  </environment>\r\n</ui>\r\n',
  luaFiles: [
    { path: 'ui/first.lua', text: firstLua },
    { path: 'ui/second.lua', text: secondLua },
    { path: 'ui/orphan.lua', text: orphanLua }
  ]
};

function source(bundle: ReturnType<typeof buildX4UiSourceBundle>, path: string) {
  const found = bundle.sourceFiles.find(file => file.path === path);
  assert.ok(found, `source ${path} should be present`);
  return found;
}

function run(): void {
  const runtimeFiles = [
    { path: 'ui/first.lua', text: 'function Provider() end', sourcePath: 'first.cat' },
    { path: 'ui/second.lua', text: 'Provider()' },
    { path: 'ui/orphan.lua', text: 'function HiddenProvider() end' }
  ];
  const runtime = (uiXml?: string, luaFiles = runtimeFiles) => buildX4MenuLuaRuntimeInventory({ uiXml, luaFiles });
  assert.equal(runtime().manifestStatus, 'absent');
  assert.equal(runtime('').manifestStatus, 'invalid', 'blank supplied manifests are not missing manifests');
  assert.equal(runtime('<addon name="lab"/>').manifestStatus, 'known');
  assert.deepEqual(runtime('<addon name="lab"/>').registrations, []);
  const runtimeManifest = '\uFEFF<addon name="lab">\r\n<environment type="menus"><file name="ui/second.lua"/><file name="ui/first.lua"/></environment></addon>';
  const runtimeOrder = runtime(runtimeManifest);
  assert.equal(runtimeOrder.manifestStatus, 'known');
  assert.equal(runtimeOrder.addonName, 'lab');
  assert.deepEqual(runtimeOrder.registrations.map(row => [row.index, row.sourceIndex, row.environmentIndex, row.rawPath, row.resolution]), [
    [0, 1, 0, 'ui/second.lua', 'resolved'], [1, 0, 0, 'ui/first.lua', 'resolved']
  ]);
  assert.equal(runtimeOrder.registrations[1].sourcePath, 'first.cat', 'unique optional source provenance must remain exact');
  assert.equal(Object.hasOwn(runtimeOrder.registrations[0], 'sourcePath'), false, 'missing legacy provenance must stay absent');
  assert.deepEqual([...readX4MenuLuaPaths(runtimeManifest, true)!], ['ui/second.lua', 'ui/first.lua']);
  assert.ok(runtimeOrder.diagnostics.some(row => row.code === 'unregistered-lua-file' && row.path === 'ui/orphan.lua'));
  assert.deepEqual(runtime(runtimeManifest), runtimeOrder, 'runtime inventories must be deterministic');
  const runtimeDuplicates = runtime('<addon name="lab"><environment type="menus"><file name="ui/first.lua"/><file name="ui/first.lua"/></environment><environment type="menus"><file name="ui/second.lua"/></environment></addon>');
  assert.equal(runtimeDuplicates.manifestStatus, 'known', 'repeated menus environments are schema-valid');
  assert.deepEqual(runtimeDuplicates.registrations.map(row => [row.environmentIndex, row.resolution]), [
    [0, 'duplicate-registration'], [0, 'duplicate-registration'], [1, 'resolved']
  ]);
  const ambiguousRuntime = runtime('<addon name="lab"><environment type="menus"><file name="ui/first.lua"/></environment></addon>', [runtimeFiles[0], { ...runtimeFiles[0], sourcePath: 'second.cat' }]);
  assert.equal(ambiguousRuntime.registrations[0].resolution, 'ambiguous-source-file');
  assert.deepEqual(ambiguousRuntime.registrations[0].sourceIndexes, [0, 1]);
  assert.equal(ambiguousRuntime.registrations[0].sourceIndex, undefined);
  assert.equal(Object.hasOwn(ambiguousRuntime.registrations[0], 'sourcePath'), false, 'ambiguous source provenance cannot be selected');
  const runtimePaths = runtime('<addon name="lab"><environment type="menus"><file name="ui/First.lua"/><file name="ui/missing.lua"/><file name="../escape.lua"/><file name="/absolute.lua"/><file name="bare.lua"/><file name="ui/second.LUA"/></environment></addon>');
  assert.equal(runtimePaths.manifestStatus, 'invalid');
  assert.deepEqual(runtimePaths.registrations.map(row => row.pathSafety), ['safe', 'safe', 'unsafe-traversal', 'unsafe-absolute', 'invalid', 'invalid']);
  const mixedRuntime = runtime('<addon name="lab"><environment type="menus"><file name="ui/first.lua"/><file name="../escape.lua"/></environment></addon>');
  assert.equal(mixedRuntime.manifestStatus, 'invalid');
  assert.equal(mixedRuntime.registrations[0].resolution, 'resolved', 'safe registration facts survive an unrelated invalid registration');
  assert.equal(mixedRuntime.registrations[0].sourcePath, 'first.cat');
  const runtimeMissing = runtime('<addon name="lab"><environment type="menus"><file name="ui/First.lua"/><file name="ui/missing.lua"/></environment></addon>');
  assert.deepEqual(runtimeMissing.registrations.map(row => row.resolution), ['missing-file', 'missing-file'], 'source lookup must retain exact case');
  for (const manifest of [
    '<addon name="lab"><environment type="menus"><file name="ui/first.lua"></environment></addon>',
    '<ui><environment type="menus"><file name="ui/first.lua"/></environment></ui>',
    '<addon><environment type="menus"/></addon>',
    '<addon xmlns="urn:foreign" name="lab"><environment type="menus"/></addon>',
    '<addon name="lab"><environment type="hud"><file name="ui/first.lua"/></environment></addon>',
    '<addon name="lab"><environment type="menus"><wrapper><file name="ui/first.lua"/></wrapper></environment></addon>'
  ]) {
    assert.equal(runtime(manifest).manifestStatus, 'invalid');
    assert.equal(readX4MenuLuaPaths(manifest, true), null);
  }
  const dependencies = runtime('<addon name="lab"><environment type="menus"><dependency name="another_addon"/><savedvariable name="lab" storage="userdata"/><file name="ui/first.lua"/></environment></addon>');
  assert.equal(dependencies.manifestStatus, 'known');
  assert.equal(dependencies.registrations[0].resolution, 'resolved');
  assert.ok(dependencies.diagnostics.some(row => row.code === 'runtime-dependency-unverified' && row.message.includes('another_addon')));
  const inventoryOnly = runtime('<addon name="lab"><environment type="menus"><file name="ui/broken.lua"/></environment></addon>', [{ path: 'ui/broken.lua', text: 'function syntax(' }]);
  assert.equal(inventoryOnly.registrations[0].resolution, 'resolved', 'registration inventory must not parse Lua or construct UI call models');
  assert.equal(inventoryOnly.diagnostics.some(row => row.code === 'lua-parse-failure'), false);

  const ordered = buildX4UiSourceBundle(orderedInput);
  assert.equal(ordered.xml.status, 'parsed');
  assert.deepEqual(
    ordered.orderedFiles.map(file => file.path),
    ['ui/second.lua', 'ui/first.lua'],
    'registered sources must follow ui.xml order'
  );
  const bomSource = source(ordered, 'ui/first.lua');
  assert.equal(bomSource.parseStatus, 'parsed', 'a valid leading-BOM Lua source must parse');
  assert.equal(bomSource.callModel.file.text, firstLua, 'the public call-model source text must remain raw');
  const bomAddTable = bomSource.callModel.calls.find(call => call.name === 'addTable');
  assert.ok(bomAddTable, 'the BOM-prefixed addTable call must remain visible');
  assert.equal(
    bomAddTable.source.start.offset,
    firstLua.indexOf('frame:addTable'),
    'parser offsets must stay aligned after the one-code-unit BOM sentinel'
  );
  assert.equal(ordered.orderedFiles.includes(source(ordered, 'ui/orphan.lua')), false);
  assert.equal(source(ordered, 'ui/orphan.lua').unregistered, true);
  assert.equal(ordered.unregisteredFiles.map(file => file.path).join(','), 'ui/orphan.lua');

  const orderedProjection = projectX4UiSourceBundle(ordered);
  assert.equal(orderedProjection.uiXml, orderedInput.uiXml, 'ui.xml must round-trip exactly');
  assert.deepEqual(
    orderedProjection.luaFiles.map(file => ({ path: file.path, text: file.text })),
    [
      { path: 'ui/first.lua', text: firstLua },
      { path: 'ui/second.lua', text: secondLua },
      { path: 'ui/orphan.lua', text: orphanLua }
    ],
    'all caller Lua strings must round-trip exactly, including BOM and CRLF'
  );

  const bomValueOffset = firstLua.indexOf('2');
  const bomSplice = spliceX4UiSourceBundle(ordered, {
    path: 'ui/first.lua',
    startOffset: bomValueOffset,
    endOffset: bomValueOffset + 1,
    expectedText: '2',
    replacement: '3'
  });
  assert.equal(bomSplice.accepted, true, 'a CAS splice after the BOM must be accepted');
  const bomSpliceProjection = projectX4UiSourceBundle(bomSplice.bundle);
  assert.equal(
    bomSpliceProjection.luaFiles[0].text,
    firstLua.slice(0, bomValueOffset) + '3' + firstLua.slice(bomValueOffset + 1),
    'the BOM and every raw offset before and after the splice must be preserved'
  );
  assert.equal(bomSpliceProjection.luaFiles[1].text, secondLua);
  assert.equal(bomSpliceProjection.uiXml, orderedInput.uiXml);

  const dynamicSource = source(ordered, 'ui/second.lua');
  assert.equal(dynamicSource.verificationStatus, 'unverified');
  assert.ok(dynamicSource.callModel.verificationGaps.length > 0, 'dynamic call-model gaps must remain visible');
  assert.ok(
    ordered.diagnostics.some(diagnostic => diagnostic.code === 'dynamic-call-model-gap' && diagnostic.sourceIndex === dynamicSource.index),
    'dynamic gaps must be explicit diagnostics'
  );

  const edgeCases = buildX4UiSourceBundle({
    uiXml: '<ui><environment type="menus"><file name="ui/a.lua"/><file name="ui/a.lua"/><file name="missing.lua"/><file name="../escape.lua"/><file name="/absolute.lua"/><file name="C:\\absolute.lua"/></environment></ui>',
    luaFiles: [
      { path: 'ui/a.lua', text: 'local frame = Menus.createFrameHandle()\nframe:addTable(1)\n' },
      { path: 'ui/unregistered.lua', text: '-- unregistered\n' }
    ]
  });
  assert.deepEqual(
    edgeCases.registrations.map(registration => registration.resolution),
    ['duplicate-registration', 'duplicate-registration', 'missing-file', 'unsafe-traversal', 'unsafe-absolute', 'unsafe-absolute']
  );
  assert.equal(edgeCases.registrations[0].rawPath, 'ui/a.lua');
  assert.equal(edgeCases.registrations[0].lookupKey, 'ui/a.lua');
  assert.equal(edgeCases.registrations[0].duplicate, true);
  assert.ok(edgeCases.diagnostics.some(diagnostic => diagnostic.code === 'duplicate-registration'));
  assert.ok(edgeCases.diagnostics.some(diagnostic => diagnostic.code === 'missing-lua-file'));
  assert.ok(edgeCases.diagnostics.some(diagnostic => diagnostic.code === 'unsafe-traversal-registration'));
  assert.ok(edgeCases.diagnostics.some(diagnostic => diagnostic.code === 'unsafe-absolute-registration'));
  assert.equal(source(edgeCases, 'ui/unregistered.lua').unregistered, true);

  const parseLocked = buildX4UiSourceBundle({
    uiXml: '<ui><environment type="menus"><file name="ui/bad.lua"/></environment></ui>',
    luaFiles: [{ path: 'ui/bad.lua', text: 'local = syntax error\n' }]
  });
  assert.equal(source(parseLocked, 'ui/bad.lua').parseStatus, 'locked');
  assert.equal(source(parseLocked, 'ui/bad.lua').verificationStatus, 'locked');
  assert.ok(parseLocked.diagnostics.some(diagnostic => diagnostic.code === 'lua-parse-failure'));

  const malformed = buildX4UiSourceBundle({
    uiXml: '<ui><environment type="menus"><file name="ui/a.lua"></ui>',
    luaFiles: [{ path: 'ui/a.lua', text: 'local value = 1\n' }]
  });
  assert.equal(malformed.xml.status, 'malformed');
  assert.equal(malformed.xml.parsed, false);
  assert.equal(malformed.orderedFiles.length, 0);
  assert.ok(malformed.diagnostics.some(diagnostic => diagnostic.code === 'malformed-xml'));

  const editableInput: X4UiSourceBundleInput = {
    uiXml: '<ui>\r\n  <environment type="menus">\r\n    <file name="ui/edit.lua"/>\r\n    <file name="ui/other.lua"/>\r\n  </environment>\r\n</ui>\r\n',
    luaFiles: [
      { path: 'ui/edit.lua', text: 'local count = 2\r\nlocal frame = Menus.createFrameHandle()\r\nframe:addTable(count)\r\n' },
      { path: 'ui/other.lua', text: '-- unchanged\r\n' }
    ]
  };
  const editable = buildX4UiSourceBundle(editableInput);
  const editableSource = source(editable, 'ui/edit.lua');
  assert.equal(editableSource.editable, true);
  const valueOffset = editableSource.text.indexOf('2');
  assert.ok(valueOffset >= 0);
  const edit: X4UiSourceSplice = {
    path: 'ui/edit.lua',
    startOffset: valueOffset,
    endOffset: valueOffset + 1,
    expectedText: '2',
    replacement: '3'
  };
  const accepted = spliceX4UiSourceBundle(editable, edit);
  assert.equal(accepted.accepted, true);
  assert.notEqual(accepted.bundle, editable);
  const acceptedProjection = projectX4UiSourceBundle(accepted.bundle);
  const beforeProjection = projectX4UiSourceBundle(editable);
  assert.equal(acceptedProjection.uiXml, beforeProjection.uiXml);
  assert.equal(acceptedProjection.luaFiles[1].text, beforeProjection.luaFiles[1].text);
  assert.equal(
    acceptedProjection.luaFiles[0].text,
    beforeProjection.luaFiles[0].text.slice(0, valueOffset) + '3' + beforeProjection.luaFiles[0].text.slice(valueOffset + 1)
  );

  const stale = spliceX4UiSourceBundle(editable, { ...edit, expectedText: '9' });
  assert.equal(stale.accepted, false);
  assert.equal(stale.reason, 'expected-text-mismatch');
  assert.equal(stale.bundle, editable, 'CAS refusal must return the original bundle unchanged');

  const outOfRange = spliceX4UiSourceBundle(editable, {
    ...edit,
    startOffset: editableSource.text.length + 1,
    endOffset: editableSource.text.length + 1,
    expectedText: ''
  });
  assert.equal(outOfRange.accepted, false);
  assert.equal(outOfRange.reason, 'invalid-range');
  assert.equal(outOfRange.bundle, editable);

  const syntaxBreak = spliceX4UiSourceBundle(editable, { ...edit, replacement: '(' });
  assert.equal(syntaxBreak.accepted, false);
  assert.equal(syntaxBreak.reason, 'replacement-parse-failure');
  assert.equal(syntaxBreak.bundle, editable);

  assert.deepEqual(
    buildX4UiSourceBundle(orderedInput),
    buildX4UiSourceBundle(orderedInput),
    'identical inputs must produce deterministic output'
  );
  assert.equal(
    spliceX4UiSourceBundle(editable, { ...edit, expectedText: 'stale' }).reason,
    spliceX4UiSourceBundle(editable, { ...edit, expectedText: 'stale' }).reason,
    'identical refusal inputs must produce a deterministic reason'
  );

  console.log('x4UiSourceBundle selftest: PASS');
}

run();
