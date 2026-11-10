import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { flattenProjectValidation, loadProjectFromDisk, runProjectValidation } from '../src/server/projectValidation';
import { applyProjectCheckCoverage, buildValidationEvidence, parseValidationProject, readContentManifestIdentity, ValidationInputError } from '../src/lib/validationEvidence';
import { packageAgentProject } from '../src/lib/projectOrchestration';
import type { ExtensionProject } from '../src/lib/extensionProject';

const project = { id: 'folder_alias', name: 'Fixture', files: [
  { path: 'content.xml', kind: 'content' as const, content: '<content id="trust_fixture" name="Fixture" version="100"/>' },
  { path: 'ui/main.lua', kind: 'lua' as const, content: 'local valid = true' },
] };
const result = runProjectValidation(project);
assert.ok(result.evidence, 'shared validation must identify its subject and coverage');
assert.equal(result.evidence.modId, 'trust_fixture', 'manifest identity, not folder alias');
const results: string[] = ['shared engine emits manifest identity'];
function check(name: string, fn: () => void) { fn(); results.push(name); }
const base = buildValidationEvidence(project, []);
check('hash explicitly names validation-only scope', () => assert.equal(base.hashScope, 'project-validation-inputs-v1'));
check('manifest version retained', () => assert.equal(base.modVersion, '100'));
check('file order does not change identity', () => assert.equal(buildValidationEvidence({ ...project, files: [...project.files].reverse() }, []).sourceHash, base.sourceHash));
check('one source byte changes identity', () => assert.notEqual(buildValidationEvidence({ ...project, files: project.files.map(f => ({ ...f, content: f.content + '\n' })) }, []).sourceHash, base.sourceHash));
check('missing content differs from empty inspected source', () => {
  const missing = buildValidationEvidence({ ...project, files: [...project.files, { path: 'md/missing.xml', kind: 'md' }] }, []);
  const empty = buildValidationEvidence({ ...project, files: [...project.files, { path: 'md/missing.xml', kind: 'md', content: '' }] }, []);
  assert.notEqual(missing.sourceHash, empty.sourceHash); assert.equal(missing.outcome, 'incomplete');
});
check('missing manifest is unresolved, not guessed from folder', () => {
  const unknown = buildValidationEvidence({ ...project, files: [] }, []);
  assert.equal(unknown.modId, null); assert.equal(unknown.identitySource, 'unresolved'); assert.equal(unknown.coverage.complete, false);
});
check('commented manifest cannot spoof identity', () => {
  const e = buildValidationEvidence({ ...project, files: [{ ...project.files[0], content: '<!-- <content id="wrong"/> --><content id="right" version="101"/>' }] }, []);
  assert.equal(e.modId, 'right');
});
check('manifest identity accepts single quotes and decodes the root ID', () => {
  assert.deepEqual(readContentManifestIdentity(`<!-- <content id="decoy" date="1999-12-31"/> --><content id='Canonical_&#x61;lias' version='100' date='2026-11-08'/>`),
    { modId: 'Canonical_alias', modVersion: '100', modDate: '2026-11-08' });
  assert.equal(readContentManifestIdentity('<content id="mod"/>')?.modDate, null);
});
check('malformed manifest cannot assert identity', () => assert.equal(buildValidationEvidence({ ...project, files: [{ ...project.files[0], content: '<content id="wrong"><x></content>' }] }, []).modId, null));
const unavailable = { severity: 'error' as const, code: 'validation.lua_ast_unavailable', filePath: 'ui/main.lua', message: 'Analysis unavailable' };
const badLua = { severity: 'error' as const, code: 'lua.syntax_error', filePath: 'ui/main.lua', message: 'Unexpected symbol' };
check('unavailable parser is not a mod error', () => {
  const e = buildValidationEvidence(project, [unavailable]);
  assert.equal(e.modErrorCount, 0); assert.equal(e.outcome, 'incomplete'); assert.equal(e.findings[0].category, 'check-unavailable');
});
check('genuine syntax finding remains a mod finding', () => {
  const e = buildValidationEvidence(project, [unavailable, badLua]);
  assert.equal(e.modErrorCount, 1); assert.equal(e.outcome, 'mod-findings'); assert.equal(e.coverage.complete, false);
});
check('finding identity deterministic and order independent', () => {
  const a = buildValidationEvidence(project, [badLua, unavailable]);
  const b = buildValidationEvidence(project, [unavailable, badLua]);
  assert.equal(a.findings[0].findingId, b.findings[1].findingId);
});
check('finding identity expires with source change', () => {
  const a = buildValidationEvidence(project, [badLua]);
  const b = buildValidationEvidence({ ...project, files: project.files.map(f => ({ ...f, content: f.content + ' ' })) }, [badLua]);
  assert.notEqual(a.findings[0].findingId, b.findings[0].findingId);
});
check('schema gap cannot be called clean', () => assert.equal(buildValidationEvidence(project, [], [{ check: 'schema.md', reason: 'md.xsd missing' }]).outcome, 'incomplete'));
check('bounded UI gaps remain incomplete', () => assert.equal(buildValidationEvidence(project, [{ severity: 'info', code: 'x4-ui.verification-gap', message: 'Not statically verified' }]).coverage.complete, false));
check('Lua runtime scope gaps are unavailable checks rather than mod errors', () => {
  const e = buildValidationEvidence(project, [{ severity: 'error', code: 'lua.runtime_scope_unverified', filePath: 'ui/main.lua', message: 'Order was unavailable' }]);
  assert.equal(e.modErrorCount, 0); assert.equal(e.outcome, 'incomplete');
  assert.equal(e.findings[0].category, 'check-unavailable');
  assert.ok(e.coverage.gaps.some(gap => gap.check === 'lua.runtime_scope_unverified'));
});
check('project check credit preserves unrelated Lua scope gaps and real syntax errors', () => {
  const evidence = buildValidationEvidence(project, [badLua,
    { severity: 'info', code: 'lua.runtime_scope_unverified', filePath: 'ui/main.lua', message: 'Scope unknown' },
    { severity: 'info', code: 'x4-ui.verification-gap', filePath: 'ui/main.lua', message: 'UI not statically verified' },
  ]);
  const credited = applyProjectCheckCoverage(evidence, {
    suite: { id: 'scope_credit_control', hash: 'a'.repeat(64) }, artifactHash: 'b'.repeat(64),
    checks: [{ id: 'behavior_control', receiptId: 'receipt', receiptHash: 'c'.repeat(64), durationMs: 1,
      outputBytes: 0, outputTailSha256: 'd'.repeat(64),
      coveredFiles: [{ path: 'ui/main.lua', size: 18, sha256: 'e'.repeat(64) }] }],
  });
  assert.equal(credited.outcome, 'mod-findings'); assert.equal(credited.modErrorCount, 1);
  assert.equal(credited.coverage.complete, false);
  assert.ok(credited.coverage.gaps.some(gap => gap.check === 'lua.runtime_scope_unverified'));
  assert.ok(credited.findings.some(finding => finding.code === 'lua.syntax_error' && finding.category === 'mod-finding'));
  assert.deepEqual(credited.coverage.projectVerification?.resolvedGaps.map(gap => gap.check), ['x4-ui.verification-gap']);
});

const menuManifest = (paths: readonly string[]) => '<addon name="ConsumerProbe"><environment type="menus">'
  + paths.map(path => `<file name="${path}"/>`).join('') + '</environment></addon>';
const runtimeProject = (paths: readonly string[] | undefined, consumer = '  ConsumerProvider()'): ExtensionProject => ({
  id: 'consumer_probe', name: 'Consumer Probe', files: [
    { path: 'content.xml', kind: 'content', content: '<content id="consumer_probe" name="Consumer Probe" version="100"/>' },
    ...(paths ? [{ path: 'ui.xml', kind: 'ui' as const, content: menuManifest(paths) }] : []),
    { path: 'ui/consumer.lua', kind: 'lua', content: consumer },
    { path: 'ui/provider.lua', kind: 'lua', content: 'ConsumerProvider = function() return true end' },
  ],
});
const registeredVariants = [
  ['earlier provider', runtimeProject(['ui/provider.lua', 'ui/consumer.lua']), undefined],
  ['later eager provider', runtimeProject(['ui/consumer.lua', 'ui/provider.lua']), 'lua.global_before_definition'],
  ['unlisted provider', runtimeProject(['ui/consumer.lua']), 'lua.undefined_global'],
  ['later provider read by a deferred function', runtimeProject(['ui/consumer.lua', 'ui/provider.lua'], 'local function deferredConsumer() ConsumerProvider() end'), undefined],
] as const;
for (const [name, input, expectedCode] of registeredVariants) check(`shared validation and packaging agree on ${name}`, () => {
  const validation = runProjectValidation(input);
  const packaged = packageAgentProject(input);
  assert.deepEqual(packaged.validation.lua, validation.lua);
  const providerFindings = validation.lua.findings.filter(finding => finding.symbol === 'ConsumerProvider'
    && ['lua.undefined_global', 'lua.global_before_definition'].includes(finding.code));
  assert.deepEqual(providerFindings.map(finding => finding.code), expectedCode ? [expectedCode] : []);
  assert.deepEqual(validation.lua.runtimeScope.stages.map(stage => stage.check), ['lua.syntax', 'lua.registrations', 'lua.globals-order']);
  assert.equal(validation.lua.runtimeScope.stages.find(stage => stage.check === 'lua.syntax')?.status, 'pass');
  if (expectedCode) {
    const flat = flattenProjectValidation(validation).find(finding => finding.code === expectedCode && finding.sourceRef === 'ConsumerProvider');
    assert.equal(flat?.filePath, 'ui/consumer.lua'); assert.equal(flat?.line, 1); assert.equal(flat?.column, 2);
  }
});
check('registered engine global stays known while a genuine typo remains positioned', () => {
  const input = runtimeProject(['ui/consumer.lua'], 'GetTopRow()\n  ConsumerTypo()');
  const validation = runProjectValidation(input);
  const globals = validation.lua.findings.filter(finding => finding.code === 'lua.undefined_global');
  assert.deepEqual(globals.map(finding => finding.symbol), ['ConsumerTypo']);
  const flat = flattenProjectValidation(validation).find(finding => finding.sourceRef === 'ConsumerTypo');
  assert.equal(flat?.line, 2); assert.equal(flat?.column, 2);
});
check('missing manifest cannot grant sibling provider credit or complete scope coverage', () => {
  const validation = runProjectValidation(runtimeProject(undefined));
  assert.ok(validation.lua.findings.some(finding => finding.code === 'lua.undefined_global' && finding.symbol === 'ConsumerProvider'));
  assert.ok(validation.evidence?.findings.some(finding => finding.code === 'lua.runtime_scope_unverified' && finding.category === 'check-unavailable'));
  assert.equal(validation.evidence?.coverage.complete, false);
  assert.notEqual(validation.lua.runtimeScope.stages.find(stage => stage.check === 'lua.registrations')?.status, 'pass');
});
check('validation and orchestration do not count absent Lua text as an inspected empty file', () => {
  const input = runtimeProject(['ui/provider.lua', 'ui/consumer.lua']);
  input.files.find(file => file.path === 'ui/provider.lua')!.content = undefined;
  const validation = runProjectValidation(input);
  assert.deepEqual(packageAgentProject(input).validation.lua, validation.lua);
  assert.equal(validation.lua.filesScanned, 1);
  assert.ok(validation.evidence?.coverage.gaps.some(gap => gap.check === 'source.content' && gap.filePath === 'ui/provider.lua'));
  assert.ok(validation.evidence?.coverage.gaps.some(gap => gap.check === 'lua.runtime_scope_unverified'));
});
check('manifest-only validation retains missing registration evidence without scanning a Lua file', () => {
  const input = runtimeProject(['ui/missing.lua']);
  input.files = input.files.filter(file => file.kind !== 'lua');
  const validation = runProjectValidation(input);
  assert.deepEqual(packageAgentProject(input).validation.lua, validation.lua);
  assert.equal(validation.lua.filesScanned, 0);
  assert.deepEqual(validation.lua.runtimeScope.stages[0].files, []);
  assert.equal(validation.lua.runtimeScope.stages[0].status, 'not-applicable');
  assert.equal(validation.lua.runtimeScope.stages[2].status, 'unavailable');
  assert.ok(validation.lua.runtimeScope.gaps.some(gap => gap.check === 'lua.registrations'
    && gap.rel === 'ui.xml' && gap.sourcePath === 'ui.xml' && gap.reason.includes('ui/missing.lua')));
  assert.ok(validation.evidence?.findings.some(finding => finding.code === 'lua.runtime_scope_unverified'
    && finding.category === 'check-unavailable' && finding.filePath === 'ui.xml'));
});
check('empty manifest and data-only projects distinguish checked registrations from no Lua scope', () => {
  for (const paths of [[], undefined]) {
    const input = runtimeProject(paths);
    input.files = input.files.filter(file => file.kind !== 'lua');
    const validation = runProjectValidation(input);
    assert.deepEqual(packageAgentProject(input).validation.lua, validation.lua);
    assert.equal(validation.lua.filesScanned, 0);
    assert.deepEqual(validation.lua.runtimeScope.stages.map(stage => stage.status),
      ['not-applicable', paths ? 'pass' : 'not-applicable', 'not-applicable']);
    assert.ok(!validation.evidence?.findings.some(finding => finding.code === 'lua.runtime_scope_unverified'));
  }
});
check('text reference lint retains its relaxed menus-only registration gate', () => {
  const input = runtimeProject(undefined);
  input.files = [input.files[0],
    { path: 'ui.xml', kind: 'ui', content: '<addon name="TextProbe"><environment type="menus"><file name="tools/menu.LUA"/></environment><environment type="hud"><file name="tools/hud.lua"/></environment></addon>' },
    { path: 'tools/menu.LUA', kind: 'lua', content: 'return ReadText(20201, 99)' },
    { path: 'tools/hud.lua', kind: 'lua', content: 'return ReadText(20201, 99)' },
    { path: 't/0001-L044.xml', kind: 't', content: '<language id="44"><page id="20201"><t id="1">Present</t></page></language>' },
  ];
  const validation = runProjectValidation(input);
  assert.deepEqual(validation.tFileRefs.findings.map(finding => finding.filePath), ['tools/menu.LUA']);
  assert.equal(validation.lua.runtimeScope.stages.find(stage => stage.check === 'lua.registrations')?.status, 'unavailable');
});
check('warning suppression cannot erase unavailable Lua scope coverage', () => {
  const input = runtimeProject(undefined);
  input.files.push({ path: 'forge.rules.json', kind: 'other', content: JSON.stringify({ version: 1, suppressions: [{
    id: 'scope-boundary', code: 'lua.runtime_scope_unverified', file: 'ui/consumer.lua', owner: 'selftest', reason: 'Exercise unavailable scope preservation',
    reviewBy: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
  }] }) });
  const validation = runProjectValidation(input);
  assert.equal(validation.rules.valid, true);
  assert.ok(validation.evidence?.coverage.gaps.some(gap => gap.check === 'lua.runtime_scope_unverified'));
  assert.equal(validation.evidence?.coverage.complete, false);
});
check('passing source stages do not retire unresolved rendered UI evidence', () => {
  const input = runtimeProject(['ui/consumer.lua'], [
    'local columns = tonumber("2")', 'local frame = Helper.createFrameHandle({}, {})', 'frame:addTable(columns)',
  ].join('\n'));
  input.files = input.files.filter(file => file.path !== 'ui/provider.lua');
  const validation = runProjectValidation(input);
  assert.equal(validation.lua.runtimeScope.stages.find(stage => stage.check === 'lua.syntax')?.status, 'pass');
  assert.equal(validation.lua.runtimeScope.stages.find(stage => stage.check === 'lua.registrations')?.status, 'pass');
  assert.ok(validation.evidence?.coverage.gaps.some(gap => gap.check === 'x4-ui.verification-gap'));
  assert.equal(validation.evidence?.coverage.complete, false);
});
check('valid input classifies files when kind omitted', () => assert.equal(parseValidationProject({ ...project, files: [{ path: 'ui/main.lua', content: '' }] }).files[0].kind, 'lua'));
for (const [name, value] of [
  ['null project', null], ['array project', []], ['missing id', { name: '', files: [] }],
  ['null file', { ...project, files: [null] }], ['nonstring content', { ...project, files: [{ path: 'a.lua', content: {} }] }],
  ['unknown kind', { ...project, files: [{ path: 'a.lua', kind: 'xml' }] }],
  ['absolute path', { ...project, files: [{ path: 'C:/a.lua' }] }],
  ['traversal path', { ...project, files: [{ path: '../a.lua' }] }],
  ['case collision', { ...project, files: [{ path: 'a.lua' }, { path: 'A.LUA' }] }],
] as const) check(`rejects ${name}`, () => assert.throws(() => parseValidationProject(value), ValidationInputError));
check('real Lua syntax error survives shared engine', () => {
  const bad = runProjectValidation({ ...project, files: [project.files[0], { path: 'ui/bad.lua', kind: 'lua', content: 'local x = )' }] });
  assert.equal(bad.ok, false); assert.ok(bad.evidence?.findings.some(f => f.code === 'lua.syntax_error' && f.category === 'mod-finding'));
});
check('missing MD content returns incomplete evidence rather than throwing', () => {
  const missing = runProjectValidation({ ...project, files: [...project.files, { path: 'md/missing.xml', kind: 'md' }] });
  assert.equal(missing.evidence?.coverage.complete, false);
  assert.ok(missing.evidence?.coverage.gaps.some(gap => gap.filePath === 'md/missing.xml'));
});
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-validation-trust-'));
try {
  check('actual missing MD schema is explicitly unavailable in the shared engine', () => {
    const names = ['X4_REFERENCE_ROOT', 'X4_XSD_PATH', 'X4_GAME_PATH'];
    const saved = names.map(name => process.env[name]);
    try {
      for (const name of names) process.env[name] = path.join(scratch, 'missing-schemas');
      const result = runProjectValidation({ ...project, files: [...project.files, { path: 'md/main.xml', kind: 'md', content: '<mdscript name="Fixture"><cues/></mdscript>' }] });
      assert.equal(result.schema.mdAvailable, false);
      assert.ok(result.evidence?.coverage.gaps.some(gap => gap.check === 'schema.md'));
      assert.equal(result.evidence?.coverage.complete, false);
    } finally { names.forEach((name, index) => { if (saved[index] === undefined) delete process.env[name]; else process.env[name] = saved[index]; }); }
  });
  check('unreadable/missing directory is explicit incomplete inventory', () => {
    const result = loadProjectFromDisk(path.join(scratch, 'absent'));
    assert.equal(result.loaded.length, 0); assert.equal(result.skipped.length, 1);
  });
  check('disk inventory loads only tools Lua registered by the root menu manifest', () => {
    const root = path.join(scratch, 'registered-tools');
    fs.mkdirSync(path.join(root, 'tools', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(root, 'ui.xml'), '<addon name="Probe"><environment type="menus"><file name="tools/nested/entry.lua"/><file name="../outside.lua"/></environment></addon>');
    fs.writeFileSync(path.join(root, 'tools', 'nested', 'entry.lua'), 'RegisteredMissing()');
    fs.writeFileSync(path.join(root, 'tools', 'other.lua'), 'ToolMissing()');
    fs.writeFileSync(path.join(scratch, 'outside.lua'), 'OutsideMissing()');
    const { project, loaded } = loadProjectFromDisk(root);
    assert.deepEqual(loaded.sort(), ['tools/nested/entry.lua', 'ui.xml']);
    assert.deepEqual(runProjectValidation(project).lua.findings.filter(f => f.code === 'lua.undefined_global').map(f => f.symbol), ['RegisteredMissing']);
    fs.rmSync(path.join(scratch, 'outside.lua'));
  });
  check('disk and inline validation retain the same registered source order', () => {
    const root = path.join(scratch, 'registered-order');
    const inline = runtimeProject(['ui/consumer.lua', 'ui/provider.lua']);
    for (const file of inline.files) {
      const target = path.join(root, file.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file.content!);
    }
    const loaded = loadProjectFromDisk(root, inline.id);
    assert.equal(loaded.skipped.length, 0);
    assert.deepEqual(runProjectValidation(loaded.project).lua, runProjectValidation(inline).lua);
  });
  check('file limit does not silently drop remaining source', () => {
    for (let index = 0; index < 501; index++) fs.writeFileSync(path.join(scratch, `${index}.lua`), 'local n = 1');
    const result = loadProjectFromDisk(scratch);
    assert.equal(result.loaded.length, 500); assert.equal(result.skipped.length, 1);
    assert.match(result.skipped[0].reason, /file limit/);
  });
} finally { fs.rmSync(scratch, { recursive: true, force: true }); }
console.log(JSON.stringify({ pass: true, checks: results.length, results }, null, 2));
