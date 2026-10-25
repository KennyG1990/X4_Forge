import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lintReferenceLiterals, runReferenceLiteralLintSelftest } from '../src/lib/referenceLint';
import { buildScriptPropertyIndex, lintScriptPropertyChains, runScriptPropertiesSelftest } from '../src/lib/scriptProperties';
import { runProjectCrossFileSelftest, validateProjectCrossFile } from '../src/lib/projectCrossFileValidation';
import type { ExtensionProject } from '../src/lib/extensionProject';

let assertions = 0;
function check(name: string, value: unknown) { assert.ok(value, name); assertions++; }
for (const [name, run] of Object.entries({ reference: runReferenceLiteralLintSelftest, properties: runScriptPropertiesSelftest, crossFile: runProjectCrossFileSelftest })) {
  const result = run();
  check(name, result.allPassed);
  console.log(JSON.stringify({ suite: name, ...result }));
}
const refs = { wares: new Set(['energycells']), factions: new Set(['argon']), macros: new Set(['known_macro']) };
const reads = '$x.ware.id $x.ware.name $ware.id $x.faction.name $faction.name $x.macro.name $macro.name';
check('property suffixes and variables are not root literals', lintReferenceLiterals(reads, refs).length === 0);
check('root name is not blanket-allowlisted', lintReferenceLiterals('ware.name + ware.id', refs).length === 2);
check('root literals remain checked in expressions', lintReferenceLiterals('(ware.bogus) + faction.bogus + macro.bogus', refs).length === 3);
const corpus = process.env.X4_REFERENCE_ROOT;
assert.ok(corpus, 'X4_REFERENCE_ROOT is required; do not substitute a handmade property list');
const index = buildScriptPropertyIndex(readFileSync(`${corpus}/libraries/scriptproperties.xml`, 'utf8'));
for (const expression of ['$x.transporttag', '$x.waretransport', '$pship2.cargo.free.{event.param.transporttag}', '$x.ware.id', '$x.ware.name']) {
  check(expression, lintScriptPropertyChains(`<set_value name="$a" exact="${expression}"/>`, index).length === 0);
}
check('unknown cargo property still detected', lintScriptPropertyChains('<set_value name="$a" exact="$x.cargo.forge_nonexistent_property"/>', index).length > 0);

function cross(lua: string, conditions = '<event_game_started/>', actions = '') {
  const project = { id: 'forge_regression_lab', name: 'Lab', files: [
    { path: 'content.xml', kind: 'content', content: '<content id="forge_regression_lab" name="Lab" author="Codex" version="100"/>' },
    { path: 'md/lab.xml', kind: 'md', content: `<mdscript name="Lab"><cues><cue name="Probe"><conditions>${conditions}</conditions><actions>${actions}</actions></cue></cues></mdscript>` },
    { path: 'ui/lab.lua', kind: 'lua', content: lua },
  ] } as ExtensionProject;
  return validateProjectCrossFile(project);
}
const emit = 'AddUITriggeredEvent("forge_lab", "reply", {})';
const listener = '<event_ui_triggered screen="&apos;forge_lab&apos;" control="&apos;reply&apos;"/>';
check('entity-decoded listener resolves', cross(emit, listener).summary.luaMdMissingListeners === 0);
check('single quote attrs resolve', cross(emit, "<event_ui_triggered screen='&quot;forge_lab&quot;' control='&quot;reply&quot;'/>").summary.luaMdMissingListeners === 0);
check('XML comment cannot provide listener', cross(emit, `<!--${listener}--><event_game_started/>`).summary.luaMdMissingListeners === 1);
check('CDATA cannot provide listener', cross(emit, `<![CDATA[${listener}]]><event_game_started/>`).summary.luaMdMissingListeners === 1);
for (const code of ['-- '+emit, `--[==[${emit}]==]`, `local example = [==[${emit}]==]`]) {
  check('Lua non-code cannot emit', cross(code).mdLua.emitted.length === 0);
}
check('immutable namespace constant resolves', cross('local NS="forge_lab"\nAddUITriggeredEvent(NS,"reply",{})', listener).mdLua.emitted.length === 1);
check('function-local namespace constant retains coverage', cross('function handler() local NS="forge_lab"\nAddUITriggeredEvent(NS,"reply",{}) end', listener).mdLua.emitted.length === 1);
for (const code of [
  'local NS="other"\nNS=dynamic\nAddUITriggeredEvent(NS,"reply",{})',
  'local NS="other"\nfunction handler(NS) AddUITriggeredEvent(NS,"reply",{}) end',
  'function example() local NS="other" end\nAddUITriggeredEvent(NS,"reply",{})',
  'function example() AddUITriggeredEvent(NS,"reply",{}) end\nlocal NS="other"',
  'local function AddUITriggeredEvent(a,b,c) end\n'+emit,
  'local NS="other"\nfor NS in pairs(values) do AddUITriggeredEvent(NS,"reply",{}) end',
  'local NS="other"\nfor NS=1,10 do AddUITriggeredEvent(NS,"reply",{}) end',
  'local NS="other"\nfunction NS() end\nAddUITriggeredEvent(NS,"reply",{})',
]) check('ambiguous or shadowed value not invented', cross(code).mdLua.emitted.length === 0);
check('literal trailing underscore remains exact', cross('AddUITriggeredEvent("forge_lab","reply_",{})', listener.replace('reply','reply_extra')).summary.luaMdMissingListeners === 1);
check('unknown concatenation stays prefix', cross('AddUITriggeredEvent("forge_lab","re"..dynamic.."suffix",{})', listener).summary.luaMdMissingListeners === 0);
check('commented raise ignored', cross('return {}', '<event_game_started/>', '<!-- <raise_lua_event name="\'missing\'"/> -->').summary.mdLuaMissingRegisters === 0);
check('entity-decoded raise resolves', cross('RegisterEvent("forge_lab.reply",function() end)', '<event_game_started/>', '<raise_lua_event name="&apos;forge_lab.reply&apos;"/>').summary.mdLuaMissingRegisters === 0);
check('malformed Lua still reported', cross('local broken = )').summary.luaRegistrationUnavailable === 1);
console.log(JSON.stringify({ assertions, pass: true, corpus }));
