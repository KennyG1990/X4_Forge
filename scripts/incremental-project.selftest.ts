import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runProjectValidation, clearProjectValidationCache, getProjectValidationCacheStats } from '../src/server/projectValidation';
import { getReferenceCorpus, clearReferenceCorpusCache } from '../src/lib/referenceCorpus';
import { clearReferenceLanguageCaches } from '../src/lib/referenceLanguage';
import { createBoundedAnalysisCache } from '../src/lib/x4UiAnalysisCache';
import type { ExtensionProject } from '../src/lib/extensionProject';

const root = process.env.X4_REFERENCE_ROOT!;
assert.ok(root, 'real X4_REFERENCE_ROOT required');
const corpus = getReferenceCorpus(root);
const base = JSON.parse(fs.readFileSync('tests/fixtures/forge-regression/project.json', 'utf8')) as ExtensionProject;
const checks: Array<{name: string; pass: boolean; detail?: string}> = [];
const check = (name: string, body: () => void) => {
  try { body(); checks.push({name, pass:true}); } catch(error) { checks.push({name,pass:false,detail:String(error)}); }
};
const mdPath='md/forge_regression_lab.xml';
const md=(actions:string)=>`<mdscript name="Lab"><cues><cue name="Init"><actions>${actions}</actions></cue></cues></mdscript>`;
function project(actions='<debug_text text="0"/>') {
  const p=structuredClone(base); p.files.find(f=>f.path===mdPath)!.content=md(actions); return p;
}
function parity(p:ExtensionProject, references=corpus.references) {
  const fast=runProjectValidation(p,{references});
  const full=runProjectValidation(p,{references,incremental:false});
  assert.deepEqual(fast,full);return fast;
}
clearProjectValidationCache();
check('cold exact full-result equality',()=>parity(project()));
check('unchanged actually reuses facts',()=>{const before=getProjectValidationCacheStats();parity(project());assert.ok(getProjectValidationCacheStats().hits>before.hits);});
check('full comparison bypasses new facts',()=>{const before=getProjectValidationCacheStats();runProjectValidation(project(),{references:corpus.references,incremental:false});assert.deepEqual(getProjectValidationCacheStats(),before);});
check('changed XML property and recovery',()=>{assert.ok(parity(project('<set_value name="$a" exact="$x.forge_invalid_property"/>')).summary.scriptPropertyWarnings);assert.equal(parity(project()).summary.scriptPropertyWarnings,0);});
check('same-file datatype inference changes',()=>{parity(project('<find_ship name="$x"/><set_value name="$a" exact="$x.cargo.free"/>'));parity(project('<set_value name="$x" exact="ware.energycells"/><set_value name="$a" exact="$x.cargo.free"/>'));});
check('malformed XML and repair',()=>{const p=project();p.files.find(f=>f.path===mdPath)!.content='<mdscript><cues></mdscript>';assert.ok(parity(p).summary.structuralErrors);assert.equal(parity(project()).summary.structuralErrors,0);});
check('schema violation and repair',()=>{assert.ok(parity(project('<debug_text forge_invalid="1" text="0"/>')).summary.schemaErrors);assert.equal(parity(project()).summary.schemaErrors,0);});
check('add remove rename file',()=>{const p=project();p.files.push({path:'md/new.xml',kind:'md',content:md('<debug_text text="0"/>')});parity(p);p.files.at(-1)!.path='md/renamed.xml';parity(p);p.files.pop();parity(p);});
check('changed project identity',()=>{const p=project();p.id='forge_other';parity(p);});
check('duplicate-path ordered symbols preserve old semantics',()=>{const p=project('<find_ship name="$x"/>');p.files.push({path:mdPath,kind:'md',content:md('<set_value name="$x" exact="ware.energycells"/>')});parity(p);});
check('sibling literal registration removal and recovery',()=>{const p=project('<raise_lua_event name="\'forge.reply\'"/>');p.files.find(f=>f.path==='ui/lab.lua')!.content='RegisterEvent("forge.reply", function() end)';assert.equal(parity(p).summary.mdLuaMissingRegisters,0);p.files.find(f=>f.path==='ui/lab.lua')!.content='return {}';assert.equal(parity(p).summary.mdLuaMissingRegisters,1);});
check('file-set coverage removal and recovery',()=>{const p=project();const before=parity(p);p.files=p.files.filter(f=>f.path!=='ui/lab.lua');assert.equal(parity(p).summary.luaFiles,before.summary.luaFiles-1);assert.equal(parity(project()).summary.luaFiles,before.summary.luaFiles);});
check('sibling local ware definition invalidates reference facts',()=>{const p=project('<set_value name="$x" exact="ware.forge_local"/>');assert.ok(parity(p).summary.referenceWarnings);p.files.push({path:'libraries/wares.xml',kind:'library',content:'<wares><ware id="forge_local"/></wares>'});assert.equal(parity(p).summary.referenceWarnings,0);p.files.pop();assert.ok(parity(p).summary.referenceWarnings);});
check('changed external reference sets',()=>{const p=project('<set_value name="$x" exact="ware.forge_extra"/>');const references=structuredClone(corpus.references);assert.ok(parity(p,references).summary.referenceWarnings);references.wares.add('forge_extra');assert.equal(parity(p,references).summary.referenceWarnings,0);references.wares.delete('forge_extra');assert.ok(parity(p,references).summary.referenceWarnings);});
check('missing reference vocabulary remains unavailable',()=>{const p=project();const fast=runProjectValidation(p);assert.deepEqual(fast,runProjectValidation(p,{incremental:false}));assert.equal(fast.references.available,false);});
check('rules are evaluated fresh',()=>{const p=project();p.files.push({path:'forge.rules.json',kind:'other',content:'{'});assert.equal(parity(p).rules.valid,false);p.files.pop();assert.equal(parity(p).rules.valid,true);});
check('result mutation cannot poison first or reused values',()=>{const p=project('<debug_text forge_invalid="1" text="0"/>');const r=parity(p);r.schema.findings.length=0;r.scriptProperties.findings.length=0;r.symbols.variables.length=0;assert.ok(parity(p).summary.schemaErrors);});
check('new property warning keeps exact locations',()=>{const p=project('<do_if value="$Station.products?"/>');const a=parity(p);p.files.find(f=>f.path===mdPath)!.content='\n\n'+p.files.find(f=>f.path===mdPath)!.content;const b=parity(p);assert.equal(b.pitfalls.findings[0].line,(a.pitfalls.findings[0].line||0)+2);});
check('bounded cache eviction and copies',()=>{const c=createBoundedAnalysisCache<{value:number[]}>({maxEntries:2,maxBytes:200});const first=c.get('a',()=>({value:[1]}));first.value[0]=9;assert.equal(c.get('a',()=>({value:[3]})).value[0],1);c.get('b',()=>({value:[2]}));c.get('c',()=>({value:[3]}));assert.equal(c.stats().entries,2);assert.equal(c.stats().evictions,1);assert.ok(c.stats().accountedBytes<=200);});
check('oversized inputs and outputs analyzed without retention',()=>{let calls=0;const c=createBoundedAnalysisCache<string>({maxEntries:2,maxBytes:20});assert.equal(c.get('input',()=>{calls++;return 'entire result';},21),'entire result');assert.equal(c.get('output',()=>{calls++;return 'x'.repeat(200);}).length,200);assert.equal(c.stats().entries,0);assert.equal(calls,2);});
check('exceptions retry and recover',()=>{const c=createBoundedAnalysisCache<string>();let calls=0;for(let i=0;i<2;i++)assert.throws(()=>c.get('x',()=>{calls++;throw Error('fixture');}));assert.equal(c.stats().entries,0);assert.equal(c.get('x',()=>'recovered'),'recovered');assert.equal(calls,2);});
check('cache limits reject invalid values',()=>{assert.throws(()=>createBoundedAnalysisCache({maxEntries:-1,maxBytes:50}));assert.throws(()=>createBoundedAnalysisCache({maxEntries:1,maxBytes:NaN}));});

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'forge-c05-reference-'));
const saved=process.env.X4_REFERENCE_ROOT;
try {
  for(const relative of ['libraries/md.xsd','libraries/aiscripts.xsd','libraries/common.xsd','libraries/scriptproperties.xml','ui/core/addon.xsd']){
    const target=path.join(tmp,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,relative),target);
  }
  process.env.X4_REFERENCE_ROOT=tmp;
  const refresh=()=>{clearReferenceCorpusCache();clearReferenceLanguageCaches();getReferenceCorpus(tmp,true);};
  refresh();
  check('reference-root change has fresh equality',()=>parity(project()));
  check('schema dependency edit invalidates facts',()=>{
    const p=project();const before=parity(p);const filename=path.join(tmp,'libraries/common.xsd');const original=fs.readFileSync(filename,'utf8');
    assert.ok(original.includes('name="debug_text"'));fs.writeFileSync(filename,original.replaceAll('name="debug_text"','name="forge_debug_text"'));
    try { const after=parity(p);assert.notDeepEqual(after.schema.findings,before.schema.findings); }
    finally { fs.writeFileSync(filename,original); }
    assert.deepEqual(parity(p).schema.findings,before.schema.findings);
  });
  check('routed schema removal and recovery',()=>{const filename=path.join(tmp,'ui/core/addon.xsd');const original=fs.readFileSync(filename);parity(project());fs.unlinkSync(filename);assert.ok(parity(project()).schema.findings.some(f=>f.code==='UI_SCHEMA_UNAVAILABLE'));fs.writeFileSync(filename,original);parity(project());});
  check('declared property-corpus refresh invalidates facts',()=>{const p=project('<set_value name="$a" exact="$x.transporttag"/>');const before=parity(p);const filename=path.join(tmp,'libraries/scriptproperties.xml');const original=fs.readFileSync(filename,'utf8');fs.writeFileSync(filename,original.replaceAll('name="transporttag"','name="forge_removed_transporttag"'));refresh();const after=parity(p);assert.notDeepEqual(after.scriptProperties.findings,before.scriptProperties.findings);fs.writeFileSync(filename,original);refresh();assert.deepEqual(parity(p).scriptProperties,before.scriptProperties);});
} finally {
  process.env.X4_REFERENCE_ROOT=saved;clearReferenceCorpusCache();clearReferenceLanguageCaches();
  assert.equal(path.dirname(path.resolve(tmp)),path.resolve(os.tmpdir()));fs.rmSync(tmp,{recursive:true,force:true});
}
console.log(JSON.stringify({pass:checks.every(c=>c.pass),passed:checks.filter(c=>c.pass).length,total:checks.length,stats:getProjectValidationCacheStats(),checks},null,2));
if(checks.some(c=>!c.pass))process.exitCode=1;
