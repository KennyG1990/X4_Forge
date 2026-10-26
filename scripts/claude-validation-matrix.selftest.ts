import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildScriptPropertyIndex, lintScriptPropertyChains } from '../src/lib/scriptProperties';
import { lintReferenceLiterals } from '../src/lib/referenceLint';
import { lintMdPitfalls, runMdPitfallSelftest } from '../src/lib/mdPitfallLints';
import { validateProjectCrossFile } from '../src/lib/projectCrossFileValidation';
import { runProjectValidation } from '../src/server/projectValidation';
import type { ExtensionProject } from '../src/lib/extensionProject';

const corpus = process.env.X4_REFERENCE_ROOT;
assert.ok(corpus, 'Real X4_REFERENCE_ROOT required');
const propertyXml = fs.readFileSync(path.join(corpus, 'libraries/scriptproperties.xml'), 'utf8');
const propertyIndex = buildScriptPropertyIndex(propertyXml);
const fixture = JSON.parse(fs.readFileSync('tests/fixtures/forge-regression/project.json', 'utf8')) as ExtensionProject;
const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];
const check = (name: string, fn: () => void) => { try { fn(); checks.push({ name, pass: true }); } catch (e) { checks.push({ name, pass: false, detail: String(e) }); } };
const md = (actions: string) => `<mdscript name="Lab"><cues><cue name="Init"><actions>${actions}</actions></cue></cues></mdscript>`;
const products = (xml: string, index = propertyIndex) => lintMdPitfalls(xml, { propertyUnion: index.union, propertyIndex: index } as Parameters<typeof lintMdPitfalls>[1]).filter(f => String(f.code) === 'md_pitfall.products_existence');
function project(lua = 'return {}', actions = '') {
  const p = structuredClone(fixture);
  p.files.find(f => f.path === 'ui/lab.lua')!.content = lua;
  p.files.find(f => f.path === 'md/forge_regression_lab.xml')!.content = md(actions);
  return p;
}
const cross = (lua: string, event = 'lab.reply') => validateProjectCrossFile(project(lua, `<raise_lua_event name="'${event}'"/>`));

check('real corpus loaded, products type and pseudo metadata', () => {
  assert.ok(propertyIndex.loaded && propertyIndex.model.datatypes.get('warelist'));
  assert.equal((propertyIndex.model.datatypes.get('warelist') as any).pseudo, true);
});
check('omitted pseudo metadata does not erase an inherited declaration', () => assert.equal(buildScriptPropertyIndex('<scriptproperties><datatype name="warelist"><property name="count" type="integer"/></datatype></scriptproperties>').model.datatypes.get('warelist')?.pseudo, undefined));
for (const expression of ['$x.transporttag', '$x.waretransport', '$x.cargo.free.{event.param.transporttag}', '$x.ware.id', '$x.ware.name'])
  check(`property ${expression}`, () => assert.equal(lintScriptPropertyChains(`<set_value name="$a" exact="${expression}"/>`, propertyIndex).length, 0));
check('unknown property still warned', () => assert.ok(lintScriptPropertyChains('<set_value name="$a" exact="$x.cargo.forge_invalid"/>', propertyIndex).length));
const refs = { wares: new Set(['energycells']) };
check('ware id/name property reads are not root literals', () => assert.equal(lintReferenceLiterals('$x.ware.id + $x.ware.name', refs).length, 0));
check('actual unknown ware literals still warned', () => assert.equal(lintReferenceLiterals('ware.id + ware.name', refs).length, 2));
check('station products existence advisory', () => { const f = products(md('<do_if value="$Station.products?"/>')); assert.equal(f.length, 1); assert.equal(f[0].severity, 'warning'); assert.ok(f[0].line); });
check('single XML quotes and decoded entities', () => assert.equal(products(md("<do_if value='$Station.products? and &quot;x&quot;'/> ")).length, 1));
for (const value of ['$Station.products.count gt 0', '$Station.$products?', "$Station.products.{1}.name", "'$Station.products?'", '&apos;$Station.products?&apos;'])
  check(`products negative ${value}`, () => assert.equal(products(md(`<do_if value="${value}"/>`)).length, 0));
check('products comment, CDATA and prose excluded', () => assert.equal(products(md('<!-- <do_if value="$Station.products?"/> --><![CDATA[<do_if value="$Station.products?"/>]]><debug_text text="\'safe\'" comment="$Station.products?"/>')).length, 0));
check('products never inferred without authoritative pseudo metadata', () => assert.equal(products(md('<do_if value="$Station.products?"/>'), buildScriptPropertyIndex(propertyXml.replace('name="warelist" pseudo="true"', 'name="warelist" pseudo="false"'))).length, 0));
check('existing four pitfall rules and falsified exclusions', () => { const r = runMdPitfallSelftest(); assert.equal(r.allPassed, true, JSON.stringify(r.checks.filter(c => !c.pass))); });
check('literal registration resolves', () => assert.equal(cross('RegisterEvent("lab.reply",function() end)').summary.mdLuaMissingRegisters, 0));
check('immutable registrar alias resolves', () => assert.equal(cross('local reg=RegisterEvent\nreg("lab.reply",function() end)').summary.mdLuaMissingRegisters, 0));
check('simple direct wrapper resolves', () => assert.equal(cross('local function reg(event, fn) RegisterEvent(event,fn) end\nreg("lab.reply",function() end)').summary.mdLuaMissingRegisters, 0));
check('literal registration absence still error', () => assert.equal(cross('RegisterEvent("lab.other",function() end)').summary.mdLuaMissingRegisters, 1));
for (const lua of [
  'RegisterEvent(GetEventName(),function() end)',
  'local event="lab.reply"\nevent=GetEventName()\nRegisterEvent(event,function() end)',
  'local reg=RegisterEvent\nreg=GetRegistrar()\nreg("lab.reply",function() end)',
  'function setup(suffix) RegisterEvent("lab."..suffix,function() end) end',
]) check(`registration uncertainty ${lua.split('\n')[0]}`, () => {
  const r = cross(lua); assert.equal(r.summary.mdLuaMissingRegisters, 0);
  assert.ok(r.findings.some(f => String(f.code) === 'md_lua.registration_verification_gap'));
  const v = runProjectValidation(project(lua, '<raise_lua_event name="\'lab.reply\'"/>'));
  assert.ok(v.evidence?.coverage.gaps.some(g => g.check === 'md_lua.registration_verification_gap'));
});
check('shadowed local registrar cannot invent engine registration', () => assert.equal(cross('local function RegisterEvent(a,b) end\nRegisterEvent("lab.reply",function() end)').summary.mdLuaMissingRegisters, 1));
check('duplicate wrapper parameters stay unverified', () => assert.ok(cross('local function reg(event,event) RegisterEvent(event,function() end) end\nreg("lab.reply",GetEventName())').findings.some(f=>f.code==='md_lua.registration_verification_gap')));
check('large-file tail registration included', () => assert.equal(cross('-- filler\n'.repeat(65000)+'RegisterEvent("lab.reply",function() end)').summary.mdLuaMissingRegisters, 0));
check('large-file tail syntax error still refused', () => { const r = runProjectValidation(project('-- filler\n'.repeat(65000)+'local broken = )')); assert.ok(r.summary.luaErrors > 0); });
check('ui.xml stays XML, not a Lua parse attempt', () => assert.equal(validateProjectCrossFile(project()).findings.some(f => f.file === 'ui.xml' && f.code === 'validation.lua_ast_unavailable'), false));
check('products wired through full project validation', () => assert.ok(runProjectValidation(project('return {}', '<do_if value="$Station.products?"/>')).pitfalls.findings.some(f => String(f.code) === 'md_pitfall.products_existence')));
const pass = checks.every(c => c.pass);
console.log(JSON.stringify({ pass, total: checks.length, passed: checks.filter(c => c.pass).length, checks }, null, 2));
if (!pass) process.exitCode = 1;
