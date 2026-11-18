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
const declared = (count: number, prefix = 'v') =>
  'local ' + Array.from({ length: count }, (_, index) => prefix + index).join(',');
const formals = (count: number) => Array.from({ length: count }, (_, index) => 'arg' + index).join(',');
const cases = [
  ['signed64', 'return 1LL', true], ['unsigned64', 'return 18446744073709551615ULL', true],
  ['imaginary', 'return 2i', true], ['contextual_goto', 'local goto = 1; return goto', true],
  ['goto_label', 'goto done; ::done:: return 1', true], ['plain_number', 'return 1.25', true],
  ['bad_integer', 'return 1LLL', false], ['bad_function', 'function Broken(', false],
  ['empty_statement', 'f();;g()', false], ['empty_statement_only', ';;', false],
  ['local_200', declared(200), true],
  ['local_201', declared(201), false],
  ['sequential_201', declared(200) + '\nlocal overflow', false],
  ['shadow_uses_another_slot', declared(200) + '\nlocal v0', false],
  ['sibling_blocks_reuse_slots', 'do ' + declared(200) + ' end; do ' + declared(200) + ' end', true],
  ['sibling_arms_reuse_slots', 'if choice then ' + declared(200) + ' elseif other then '
    + declared(200) + ' else ' + declared(200) + ' end', true],
  ['over_limit_even_in_dead_arm', 'if false then ' + declared(201) + ' end', false],
  ['outer_plus_inner_live_slots', declared(200) + '; do local child end', false],
  ['local_function_uses_slot', declared(200) + '; local function child() end', false],
  ['nonlocal_definition_does_not_add_slot', declared(200) + '; function child() end', true],
  ['inner_function_has_independent_slots', declared(200) + '; function child() ' + declared(200) + ' end', true],
  ['inline_function_limit', 'local f = function() ' + declared(201) + ' end', false],
  ['numeric_for_196', declared(196) + '; for i=1,1 do end', true],
  ['numeric_for_197', declared(197) + '; for i=1,1 do end', false],
  ['numeric_for_releases_slots', 'for i=1,1 do ' + declared(196) + ' end; ' + declared(200), true],
  ['numeric_for_body_overflow', 'for i=1,1 do ' + declared(197) + ' end', false],
  ['generic_for_195', declared(195) + '; for k,v in pairs({}) do end', true],
  ['generic_for_196', declared(196) + '; for k,v in pairs({}) do end', false],
  ['generic_for_body_overflow', 'for k,v in pairs({}) do ' + declared(196) + ' end', false],
  ['repeat_releases_slots', 'repeat ' + declared(200) + ' until true; ' + declared(200), true],
  ['while_inner_overflow', declared(200) + '; while choice do local inside end', false],
  ['named_200_plus_varargs', 'function f(' + formals(200) + ', ...) end', true],
  ['named_201', 'function f(' + formals(201) + ') end', false],
  ['method_199_plus_self', 'function object:f(' + formals(199) + ') end', true],
  ['method_200_plus_self', 'function object:f(' + formals(200) + ') end', false],
  ['dot_method_has_no_implicit_self', 'function object.f(' + formals(200) + ') end', true],
] as const;
const unicodeEscapes = [
  ["below","return \"\\u{D7FF}\"",true],
  ["first","return \"\\u{D800}\"",false],
  ["high","return \"\\u{DBFF}\"",false],
  ["low","return '\\u{dc00}'",false],
  ["last","return \"\\u{dFfF}\"",false],
  ["above","return '\\u{e000}'",true],
  ["zero_padded","return '\\u{000000d800}'",false],
  ["max","return \"\\u{10FFFF}\"",true],
  ["over_max","return \"\\u{110000}\"",false],
  ["ordinary","return \"\\u{41}\\x80\\065\"",true],
  ["even","return \"\\\\u{D800}\"",true],
  ["odd","return \"\\\\\\u{D800}\"",false],
  ["two_escape_runs","return \"\\\\u{D800}\\u{DFFF}\"",false],
  ["raw_bracket","return [=[ \"\\u{D800}\" ]=]",true],
  ["comment","-- \"\\u{D800}\"\nreturn true",true],
  ["long_comment","--[=[ \"\\u{D800}\" ]=]\nreturn true",true],
  ["bare_string_argument","DebugError \"\\u{D800}\"",false],
  ["escaped_quote","return \"a\\\"\\u{D800}\"",false],
  ["after_continuation","return \"ok\\\r\n\\u{D800}\"",false],
  ["after_whitespace_escape","return \"\\z\n\r  \\u{D800}\"",false],
  ["unclosed","return \"\\u{D800}",false],
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
check('local_limit_has_position_and_preserves_parser_options', () => {
  const raw = declared(200) + '\r\nlocal overflow\r\nfunction later() ' + declared(201) + ' end';
  const options = { locations: true, ranges: true, comments: false };
  const before = JSON.stringify(options);
  assert.throws(() => parseX4Lua(raw, options), (error: unknown) => {
    const finding = error as SyntaxError & { line?: number; column?: number };
    return finding instanceof SyntaxError && finding.line === 2 && finding.column === 6
      && finding.message.includes('200 active local variables');
  });
  assert.equal(JSON.stringify(options), before);
  const result = analyzeLuaFiles([file('ui/local_limit.lua', raw)]);
  const finding = result.findings.find(row => row.code === 'lua.syntax_error');
  assert.equal(finding?.line, 2);
  assert.equal(finding?.column, 6);
});
check('deferred_local_check_snapshots_wait_option', () => {
  const options = { wait: true, locations: true };
  const parser = parseX4Lua('', options) as { end(input: string): unknown };
  options.wait = false;
  assert.throws(() => parser.end(declared(201)), /200 active local variables/);
});


for (const [id, text, accepted] of unicodeEscapes) check('unicode_escape_' + id, () => {
  const result = analyzeLuaFiles([file('ui/escape.lua', text)]);
  assert.equal(result.runtimeScope.stages[0].status, accepted ? 'pass' : 'fail');
  assert.equal(result.findings.some(f => f.code === 'lua.syntax_error'), !accepted);
});
check('surrogate_escape_has_exact_continued_utf16_coordinates', () => {
  const text = '-- prefix\r\nreturn "é\\\r\n  \\u{00D800}"';
  const options = { locations: true, ranges: true, comments: false, encodingMode: 'pseudo-latin1' };
  assert.throws(() => parseX4Lua(text, options), (error: unknown) => {
    const e = error as SyntaxError & { line?: number; column?: number; index?: number };
    return e instanceof SyntaxError && e.line === 3 && e.column === 2 && e.index === text.indexOf('\\u{');
  });
  const finding = analyzeLuaFiles([file('ui/escape.lua', text)]).findings.find(f => f.code === 'lua.syntax_error');
  assert.equal(finding?.line, 3);
  assert.equal(finding?.column, 2);
});
check('surrogate_and_local_limit_keep_earliest_profile_error', () => {
  const escape = 'local s = "\\u{D800}"';
  const overflow = declared(201);
  const options = { locations: true, ranges: true };
  assert.throws(() => parseX4Lua(escape + '\n' + overflow, options), /surrogate code points/);
  assert.throws(() => parseX4Lua(overflow + '\n' + escape, options), /200 active local variables/);
});
check('deferred_surrogate_escape_and_valid_ast_metadata', () => {
  const handle = parseX4Lua('', { wait: true }) as { write(input: string): unknown; end(input: string): unknown };
  handle.write('return "\\u{');
  assert.throws(() => handle.end('D800}"'), /surrogate code points/);
  const valid = 'return "\\u{E000}", [[\\u{D800}]]';
  const options = { comments: false, encodingMode: 'pseudo-latin1' };
  const observed: unknown[] = [];
  const upstream: unknown[] = [];
  assert.deepEqual(parseX4Lua(valid, { ...options, onCreateNode(node: unknown) { observed.push(node); } }),
    upstreamParse(valid, { ...options, luaVersion: 'LuaJIT', onCreateNode(node: unknown) { upstream.push(node); } }));
  assert.deepEqual(observed, upstream);
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
