import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateProjectCrossFile, runProjectCrossFileSelftest } from '../src/lib/projectCrossFileValidation';
import { buildValidationEvidence } from '../src/lib/validationEvidence';
import { runProjectValidation, flattenProjectValidation } from '../src/server/projectValidation';
import { evaluateFindingAcceptances } from '../src/server/findingAcceptance';
import type { ExtensionProject } from '../src/lib/extensionProject';

const fixture = JSON.parse(fs.readFileSync('tests/fixtures/forge-regression/project.json','utf8')) as ExtensionProject;
function project(lua: string) {
  const p=structuredClone(fixture);
  p.files.find(f=>f.path==='ui/lab.lua')!.content=lua;
  const md=p.files.find(f=>f.path==='md/forge_regression_lab.xml')!;
  md.content=md.content!.replace('</cues>',`<cue name="Probe"><conditions><event_ui_triggered screen="'ForgeLab'" control="'probe'"/></conditions><actions><debug_text text="'probe'"/></actions></cue></cues>`);
  return p;
}
const checks:string[]=[];
function check(name:string,run:()=>void){run();checks.push(name);}
const exact='AddUITriggeredEvent("ForgeLab", "probe", {})';
const dynamic='function SendProbe(name) AddUITriggeredEvent("ForgeLab", name, {}) end';
const analyze=(lua:string)=>validateProjectCrossFile(project(lua));
check('literal-match-exact',()=>{const r=analyze(exact);assert.equal(r.ok,true);assert.equal(r.mdLua.emitCoverage.exact,1);assert.equal(r.summary.luaEmitUnverified,0);});
check('literal-missing-still-error',()=>{const r=analyze(exact.replace('probe','absent'));assert.equal(r.ok,false);assert.ok(r.findings.some(f=>f.code==='lua_md.missing_listener'&&f.severity==='error'));});
check('dynamic-control-explicit',()=>{const r=analyze(dynamic);assert.equal(r.ok,true);assert.equal(r.mdLua.emitCoverage.unresolved,1);assert.equal(r.mdLua.emitted.length,0);assert.equal(r.findings.filter(f=>f.code==='lua_md.emit_verification_gap').length,1);});
check('dynamic-namespace-explicit',()=>assert.equal(analyze('function f(screen) AddUITriggeredEvent(screen,"probe",{}) end').summary.luaEmitUnverified,1));
check('prefix-match-remains-unproven',()=>{const r=analyze('function f(suffix) AddUITriggeredEvent("ForgeLab","pro"..suffix,{}) end');assert.equal(r.mdLua.emitCoverage.prefix,1);assert.equal(r.summary.luaMdMissingListeners,0);assert.equal(r.summary.luaEmitUnverified,1);});
check('literal-underscore-not-prefix',()=>{const r=analyze(exact.replace('probe','probe_'));assert.equal(r.summary.luaEmitUnverified,0);assert.equal(r.ok,false);});
check('immutable-local-exact',()=>assert.equal(analyze('local screen="ForgeLab"\nlocal control="probe"\nAddUITriggeredEvent(screen,control,{})').mdLua.emitCoverage.exact,1));
check('reassignment-unresolved',()=>assert.equal(analyze('local control="probe"\ncontrol=GetPlayerName()\nAddUITriggeredEvent("ForgeLab",control,{})').mdLua.emitCoverage.unresolved,1));
check('shadow-is-not-engine-call',()=>assert.equal(analyze('local function AddUITriggeredEvent(a,b,c) return a end\nAddUITriggeredEvent("ForgeLab","missing",{})').summary.luaEmitUnverified,0));
check('ambiguous-global-explicit',()=>assert.ok(analyze('AddUITriggeredEvent=SomeOtherFunction\nAddUITriggeredEvent("ForgeLab","missing",{})').mdLua.emitCoverage.files.some(f=>f.reasons.includes('ambiguous-callee'))));
check('comments-strings-not-calls',()=>assert.equal(analyze('-- '+dynamic+'\nlocal s=[['+dynamic+']]\nreturn s').summary.luaEmitUnverified,0));
check('unsupported-encoding-explicit',()=>assert.ok(analyze('AddUITriggeredEvent("ForgeLab","日本",{})').mdLua.emitCoverage.files.some(f=>f.reasons.includes('source-encoding'))));
check('large-file-tail-included',()=>assert.equal(analyze('-- filler\n'.repeat(65000)+dynamic).summary.luaEmitUnverified,1));
check('one-gap-per-file',()=>{const r=analyze(Array.from({length:100},()=>dynamic).join('\n'));assert.equal(r.summary.luaEmitUnverified,100);assert.equal(r.findings.filter(f=>f.code==='lua_md.emit_verification_gap').length,1);});
check('parse-failure-preserved',()=>{const r=analyze('function broken(');assert.ok(r.findings.some(f=>f.code==='validation.lua_ast_unavailable'));assert.equal(r.mdLua.emitCoverage.files.find(f=>f.file==='ui/lab.lua')!.parsed,false);});
const p=project(dynamic), r=validateProjectCrossFile(p);
const diagnostics=r.findings.map(f=>({severity:f.severity,code:f.code,filePath:f.file,message:f.detail}));
const evidence=buildValidationEvidence(p,diagnostics);
check('coverage-not-mod-error',()=>{assert.equal(evidence.modErrorCount,0);assert.equal(evidence.outcome,'incomplete');assert.ok(evidence.findings.some(f=>f.code==='lua_md.emit_verification_gap'&&f.category==='check-unavailable'));});
check('incomplete-deploy-allowed-not-clean',()=>{const d=evaluateFindingAcceptances({evidence,artifactHash:'a'.repeat(64),validatorHash:'b'.repeat(64),corpusHash:'c'.repeat(64),targetHash:'d'.repeat(64)},[],{kind:'agent',id:'fixture',label:'Fixture',scope:'deploy',deployAuthorized:true});assert.equal(d.validationAllowsDeploy,true);assert.equal(d.validationClean,false);assert.equal(d.outcome,'incomplete-checks');});
check('repair-clears-only-gap',()=>assert.equal(analyze(exact).summary.luaEmitUnverified,0));
check('suppression-cannot-hide-coverage',()=>{
  const rules=structuredClone(p);rules.files.push({path:'forge.rules.json',kind:'other',content:JSON.stringify({version:1,suppressions:[{id:'attempt',owner:'lab',reason:'Test only',reviewBy:new Date(Date.now()+30*86400000).toISOString().slice(0,10),code:'lua_md.emit_verification_gap',file:'ui/lab.lua'}]})});
  const result=runProjectValidation(rules);assert.ok(result.evidence!.coverage.gaps.some(g=>g.check==='lua_md.emit_verification_gap'));assert.ok(flattenProjectValidation(result).some(f=>f.code==='lua_md.emit_verification_gap'));
});
check('existing-cross-file-regressions',()=>{const result=runProjectCrossFileSelftest();assert.equal(result.allPassed,true,JSON.stringify(result.checks.filter(c=>!c.pass)));});
console.log(JSON.stringify({pass:true,total:checks.length,checks}));
