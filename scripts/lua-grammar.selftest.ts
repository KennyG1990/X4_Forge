import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parse as upstreamParse } from 'luaparse';
import { parseX4Lua } from '../src/lib/x4LuaParser';
import { analyzeLuaFiles, type LuaFileInput } from '../src/lib/luaStaticAnalysis';
import { buildX4MenuLuaRuntimeInventory } from '../src/lib/x4UiSourceBundle';
import { buildX4UiCallModel } from '../src/lib/x4UiCallModel';
import { createX4UiLayoutTargetCatalog, projectX4UiLayoutProgram } from '../src/lib/x4UiLayoutProgram';
import { HELPER_SOURCE_SHA256, WIDGET_SOURCE_SHA256, X4_LAYOUT_PROVENANCE } from '../src/lib/x4UiLayoutKernel';
import { createProject, addFile, buildContentXml } from '../src/lib/extensionProject';
import { validateProjectCrossFile } from '../src/lib/projectCrossFileValidation';
import { lintReferenceLiterals } from '../src/lib/referenceLint';
import { buildModTextIndex, lintTextReferences } from '../src/lib/tFileLint';

const checks: { name: string; pass: boolean; detail?: string }[] = [];
const check = (name: string, fn: () => void) => {
  try { fn(); checks.push({ name, pass: true }); }
  catch (error) { checks.push({ name, pass: false, detail: String(error) }); }
};
const cases = [
  ['signed64', 'return 1LL', true], ['unsigned64', 'return 18446744073709551615ULL', true],
  ['imaginary', 'return 2i', true], ['contextual_goto', 'local goto = 1; return goto', true],
  ['goto_label', 'goto done; ::done:: return 1', true], ['plain_number', 'return 1.25', true],
  ['bad_integer', 'return 1LLL', false], ['bad_function', 'function Broken(', false],
  ['empty_statement', 'f();;g()', false], ['empty_statement_only', ';;', false],
] as const;
const file = (rel: string, text: string): LuaFileInput => ({ rel, text, source: 'loose', sourcePath: `grammar:${rel}`,
  extension: { folder: 'grammar', id: 'grammar' } });

// Reuse one explicitly selected existing runtime; never stage a copy or execute mod bodies.
const hubInput = process.env.FORGE_QA_LUA_HUB;
assert(hubInput && path.isAbsolute(hubInput), 'An explicit previously qualified private Lua hub is required.');
const hub = fs.realpathSync.native(hubInput);
assert.equal(hub.toLowerCase(), path.resolve(hubInput).toLowerCase());
const python = path.join(hub, 'runtime', 'python.exe');
const pyd = path.join(hub, 'source', 'lupa', 'luajit20.cp312-win_amd64.pyd');
const runtimeHash = () => Object.fromEntries([python, pyd].map(p => {
  const stat = fs.lstatSync(p); assert(stat.isFile() && stat.nlink === 1);
  return [path.relative(hub, p), createHash('sha256').update(fs.readFileSync(p)).digest('hex')];
}));
const beforeRuntime = runtimeHash();
const config = JSON.parse(fs.readFileSync(path.join(hub, 'runtime.json'), 'utf8')) as { covers: string[] };
assert.equal(config.covers.length, 9);
const corpus = config.covers.map(rel => {
  const target = fs.realpathSync.native(path.join(hub, 'source', rel));
  assert(target.startsWith(path.join(hub, 'source') + path.sep));
  const text = fs.readFileSync(target, 'utf8'); assert(Buffer.byteLength(text) < 512 * 1024);
  return { id: rel, text };
});
const oracleCode = String.raw`
import json, sys
sys.path.insert(0,sys.argv[1]+'/source')
from lupa.luajit20 import LuaRuntime
lua=LuaRuntime(unpack_returned_tuples=True)
compile=lua.eval('function(s) local f,e=loadstring(s); return f ~= nil,e end')
items=json.loads(sys.stdin.read())
print(json.dumps(dict(version=lua.eval('jit.version'),results=[dict(id=x['id'],accepted=compile(x['text'])[0]) for x in items])))
`;
const child = spawnSync(python, ['-I', '-S', '-B', '-c', oracleCode, hub], {
  input: JSON.stringify([...cases.map(([id, text]) => ({ id, text })), ...corpus]), encoding: 'utf8',
  env: { SystemRoot: process.env.SystemRoot }, cwd: hub, windowsHide: true, timeout: 10_000, maxBuffer: 64 * 1024,
});
assert(!child.error, `${child.error?.message || ''}: ${child.stderr?.slice(0, 1024)}`);
assert.equal(child.status, 0, child.stderr);
const oracle = JSON.parse(child.stdout) as { version: string; results: { id: string; accepted: boolean }[] };
assert(oracle.version.startsWith('LuaJIT 2.0.'));
for (const [id, text, accepted] of cases) check(`compiler_and_forge_${id}`, () => {
  assert.equal(oracle.results.find(row => row.id === id)?.accepted, accepted);
  const result = analyzeLuaFiles([file('ui/probe.lua', text)]);
  assert.equal(result.runtimeScope.stages[0].status, accepted ? 'pass' : 'fail');
  assert.equal(result.findings.some(f => f.code === 'lua.syntax_error'), !accepted);
});
check('nine_retained_real_sources_compile_without_execution', () => {
  for (const source of corpus) {
    assert.equal(oracle.results.find(row => row.id === source.id)?.accepted, true, source.id);
    assert.equal(analyzeLuaFiles([file(source.id, source.text)]).runtimeScope.stages[0].status, 'pass', source.id);
  }
});
check('cdata_file_keeps_registered_source_order_findings', () => {
  const files = [file('ui/consumer.lua', 'local handle = 1ULL\nOrderedGlobal()'), file('ui/provider.lua', 'function OrderedGlobal() end')];
  const runtimeInventory = buildX4MenuLuaRuntimeInventory({ uiXml: '<addon name="Grammar"><environment type="menus"><file name="ui/consumer.lua"/><file name="ui/provider.lua"/></environment></addon>',
    luaFiles: files.map(f => ({ path: f.rel, text: f.text, sourcePath: f.sourcePath })) });
  const result = analyzeLuaFiles(files.map(f => ({ ...f, extension: { ...f.extension, runtimeInventory } })));
  assert.equal(result.runtimeScope.stages[0].status, 'pass');
  assert(result.findings.some(f => f.code === 'lua.global_before_definition' && f.line === 2 && f.symbol === 'OrderedGlobal'));
});
check('event_registration_and_emission_survive_cdata_syntax', () => {
  let project = createProject('grammar', 'Grammar');
  project = addFile(project, { path: 'content.xml', kind: 'content', content: buildContentXml({ id: 'grammar', name: 'Grammar' }) });
  project = addFile(project, { path: 'md/test.xml', kind: 'md', content: '<mdscript name="Grammar"><cues><cue name="Test"><conditions><event_ui_triggered screen="\'grammar\'" control="\'reply\'"/></conditions><actions><raise_lua_event name="\'grammar.in\'"/></actions></cue></cues></mdscript>' });
  project = addFile(project, { path: 'ui/test.lua', kind: 'lua', content: 'local n = 1LL\nRegisterEvent("grammar.in", function() end)\nAddUITriggeredEvent("grammar", "reply", {})' });
  const result = validateProjectCrossFile(project);
  assert.equal(result.mdLua.parseUnavailable.length, 0);
  assert(result.mdLua.registered.some(e => e.event === 'grammar.in'));
  assert(result.mdLua.emitted.some(e => e.event === 'grammar.reply'));
});
check('faction_literals_survive_an_earlier_cdata_literal', () => {
  const result = lintReferenceLiterals('local n = 1LL\nGetFactionData("not_a_faction", "name")', { factions: new Set(['argon']) }, { filePath: 'ui/test.lua', kind: 'lua' });
  assert(result.some(f => f.id === 'not_a_faction' && f.line === 2));
});
const index = buildModTextIndex([{ path: 't/0001-L044.xml', content: '<language id="44"><page id="9521"><t id="1">Known</t></page></language>' }]);
check('text_literals_survive_cdata_but_cdata_is_not_a_text_id', () => {
  const content = 'local n = 1LL\nReadText(9521, 2)\nReadText(9521, 2i)\nReadText(9521LL, 3)';
  const result = lintTextReferences({ files: [{ path: 'ui/test.lua', content }], index, registeredLuaPaths: new Set(['ui/test.lua']) });
  assert.equal(result.summary.refsChecked, 1); assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].id, '2'); assert.equal(result.findings[0].line, 2);
});
check('cdata_ui_width_is_parsed_but_never_a_numeric_fact', () => {
  const model = buildX4UiCallModel({ rel: 'ui/test.lua', sourcePath: 'grammar:ui/test.lua',
    text: 'local frame = Helper.createFrameHandle({}, {width = 2i, height = 12})' });
  assert(model.parsed); assert(model.calls.some(call => call.name === 'createFrameHandle'));
  const properties = model.calls.find(call => call.name === 'createFrameHandle')!.semantics.properties!;
  const width = properties.find(property => property.name === 'width')!.value;
  assert.equal(width.status, 'dynamic'); assert.equal(width.expression, '2i'); assert(!Object.hasOwn(width, 'value'));
  assert.equal(properties.find(property => property.name === 'height')!.value.value, 12);
  assert(model.verificationGaps.some(gap => gap.category === 'width' && gap.status === 'dynamic'));
});
check('plain_ast_and_original_options_remain_unchanged', () => {
  const text = 'local function f(a) return a + 2 end; local n = 7; f(n)';
  const options = { scope: true, ranges: true, locations: true, comments: false };
  const before = JSON.stringify(options);
  assert.deepEqual(parseX4Lua(text, options), upstreamParse(text, { ...options, luaVersion: '5.2' }));
  assert.equal(JSON.stringify(options), before);
  assert.throws(() => upstreamParse('return 1LL', { luaVersion: '5.2' }));
  assert.throws(() => parseX4Lua('return 1//2', { luaVersion: '5.3' }));
});
check('cdata_value_is_unknown_before_callbacks_and_keeps_raw_locations', () => {
  for (const raw of ['1LL', '18446744073709551615ULL', '2i', '0x7fffULL']) {
    let observed: unknown;
    const ast = parseX4Lua(`return ${raw}`, { locations: true, ranges: true,
      onCreateNode(node: { type: string; value?: unknown }) { if (node.type === 'NumericLiteral') { assert.equal(node.value, null); observed = node; } } }) as {
      body: { arguments: { raw: string; value: unknown; range: number[]; loc: { start: { column: number } } }[] }[];
    };
    const literal = ast.body[0].arguments[0];
    assert.equal(literal.raw, raw); assert.equal(literal.value, null);
    assert.deepEqual(literal.range, [7, 7 + raw.length]); assert.equal(literal.loc.start.column, 7);
    assert.equal(literal, observed);
  }
});
check('callback_failure_is_not_swallowed', () => {
  const error = new Error('grammar-callback-fault');
  assert.throws(() => parseX4Lua('return 1', { onCreateNode() { throw error; } }), error);
});
check('layout_source_reparse_keeps_plain_numeric_facts_in_a_cdata_file', () => {
  const model = buildX4UiCallModel({ rel: 'ui/layout.lua', sourcePath: 'grammar:ui/layout.lua', text:
    'local n = 1LL\nlocal menu = {name = "Grammar"}\nlocal frame = Helper.createFrameHandle(menu, {x = 1 + 2, y = 0, width = 80, height = 60})\nframe:display()' });
  const catalog = createX4UiLayoutTargetCatalog(model);
  const target = catalog.targets.find(target => target.kind === 'top-level'); assert(target);
  const pin = (value: number, line: number) => ({ value, source: { sourcePath: X4_LAYOUT_PROVENANCE.helperSourcePath, lineStart: line, lineEnd: line } });
  const result = projectX4UiLayoutProgram(model, target, {
    id: 'grammar-profile', provenance: 'Synthetic supplied dimensions; pinned Helper source contract', truthGrade: 'supplied',
    source: catalog.sourceIdentity, frame: { width: 100, height: 80 },
    metrics: { uiScale: 1, borderSize: 1, scrollbarWidth: 12, standardContainerOffset: 2 },
    helper: { sourcePath: X4_LAYOUT_PROVENANCE.helperSourcePath, sha256: HELPER_SOURCE_SHA256, constants: {
      standardTextHeight: pin(16, 533), standardButtonHeight: pin(25, 522), viewWidth: pin(100, 707), viewHeight: pin(80, 708), borderSize: pin(1, 709),
    } }, widget: { sourcePath: X4_LAYOUT_PROVENANCE.widgetSourcePath, sha256: WIDGET_SOURCE_SHA256 }, defaults: {},
  });
  assert(result.program, JSON.stringify(result));
  const x = result.program.frames[0]!.descriptorFacts.x;
  assert(x.status === 'known'); assert.equal(x.value, 3);
});
assert.deepEqual(runtimeHash(), beforeRuntime);
console.log(JSON.stringify({ status: checks.every(c => c.pass) ? 'passed' : 'failed', passed: checks.filter(c => c.pass).length,
  total: checks.length, checks, oracleVersion: oracle.version, compilerOnly: true, runtimeCopied: false, runtimeHashes: beforeRuntime,
  corpusHashes: Object.fromEntries(corpus.map(source => [source.id, createHash('sha256').update(source.text).digest('hex')])) }));
if (checks.some(c => !c.pass)) process.exitCode = 1;
