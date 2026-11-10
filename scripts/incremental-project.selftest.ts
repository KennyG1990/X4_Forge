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
const consumer = 'ui/scope-consumer.lua';
const provider = 'ui/scope-provider.lua';
const manifest = (order: string[]) =>
  `<addon name="ScopeProbe"><environment type="menus">${order.map(rel => `<file name="${rel}"/>`).join('')}</environment></addon>`;
function luaProject() {
  const p = project();
  p.files = p.files.filter(file => file.path === mdPath || file.path === 'content.xml');
  p.files.push(
    { path: consumer, kind: 'lua', content: 'OrderedGlobal()' },
    { path: provider, kind: 'lua', content: 'function OrderedGlobal() end' },
    { path: 'ui.xml', kind: 'ui', content: manifest([consumer, provider]) },
  );
  return p;
}
check('identical Lua scope is reused through a separate project validation', () => {
  clearProjectValidationCache();
  const p = luaProject();
  const first = parity(p);
  assert.ok(first.lua.findings.some(finding => finding.code === 'lua.global_before_definition'));
  assert.equal(getProjectValidationCacheStats().lua.misses, 1);
  first.lua.findings.length = 0;
  assert.ok(parity(structuredClone(p)).lua.findings.some(finding => finding.code === 'lua.global_before_definition'));
  p.files.find(file => file.path === mdPath)!.content = md('<debug_text text="1"/>');
  assert.ok(parity(p).lua.findings.some(finding => finding.code === 'lua.global_before_definition'));
  assert.equal(getProjectValidationCacheStats().lua.hits, 2);
  assert.equal(getProjectValidationCacheStats().lua.misses, 1);
});
check('changed Lua, manifest, order and identity cannot hit stale scope', () => {
  const p = luaProject();
  const checkMiss = () => {
    const before = getProjectValidationCacheStats().lua;
    const result = parity(p).lua;
    assert.equal(getProjectValidationCacheStats().lua.misses, before.misses + 1);
    assert.equal(getProjectValidationCacheStats().lua.hits, before.hits);
    return result;
  };
  const ui = p.files.find(file => file.path === 'ui.xml')!;
  ui.content = manifest([provider, consumer]);
  assert.ok(!checkMiss().findings.some(finding => finding.code === 'lua.global_before_definition'));
  p.files.reverse();
  checkMiss();
  p.id += '_other';
  checkMiss();
  p.files.find(file => file.path === provider)!.content = 'function OrderedGlobal(';
  assert.ok(checkMiss().findings.some(finding => finding.code === 'lua.syntax_error'));
  p.files.push({ ...ui, path: 'UI.XML' });
  assert.ok(checkMiss().runtimeScope.stages.some(stage => stage.check === 'lua.registrations' && stage.status === 'unavailable'));
  assert.ok(getProjectValidationCacheStats().lua.entries <= 4);
});
check('truncated Lua scope remains unretained and available for retry', () => {
  const p = luaProject();
  p.files.find(file => file.path === consumer)!.content = `local x = Helper${'.a'.repeat(80)}`;
  const before = getProjectValidationCacheStats().lua;
  assert.equal(parity(p).lua.runtimeScope.truncated, true);
  assert.equal(parity(p).lua.runtimeScope.truncated, true);
  const after = getProjectValidationCacheStats().lua;
  assert.equal(after.bypasses, before.bypasses + 2);
  assert.equal(after.entries, before.entries);
});
check('a 243-file registered Lua project retains one exact scope result', () => {
  const p = luaProject();
  const extra = Array.from({ length: 241 }, (_, index) => `ui/scope-${index}.lua`);
  p.files.push(...extra.map(filePath => ({
    path: filePath, kind: 'lua' as const, content: 'local initialized = true',
  })));
  p.files.find(file => file.path === 'ui.xml')!.content = manifest([provider, consumer, ...extra]);
  const cold = parity(p);
  assert.equal(cold.lua.filesScanned, 243);
  const before = getProjectValidationCacheStats().lua;
  assert.deepEqual(parity(structuredClone(p)).lua, cold.lua);
  const after = getProjectValidationCacheStats().lua;
  assert.equal(after.hits, before.hits + 1);
  assert.equal(after.accountedBytes, before.accountedBytes);
});
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
  check('effective script schema reuse binds current source, corpus and vocabulary', () => {
    const p = project();
    const relative = 'md/reuse_probe.xml';
    const patch = { path: relative, kind: 'md' as const,
      content: '<diff><add sel="/mdscript/cues/cue/actions"><debug_text text="1" forge_unknown="1"/></add></diff>' };
    p.files = [...p.files.filter(file => file.path === 'content.xml'), patch];
    const absolute = path.join(tmp, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, md('<debug_text text="0"/>'));
    clearProjectValidationCache();
    const stats = () => getProjectValidationCacheStats().effectiveSchema;
    const initial = parity(p);
    assert.ok(initial.diffSimulation.files[0].postApplyFindings.some(finding => finding.message.includes('forge_unknown')));
    assert.equal(stats().misses, 2);
    assert.deepEqual(parity(structuredClone(p)), initial);
    assert.equal(stats().hits, 2);

    patch.content = patch.content.replace('forge_unknown', 'forge_other');
    const edited = parity(p);
    assert.ok(edited.diffSimulation.files[0].postApplyFindings.some(finding => finding.message.includes('forge_other')));
    assert.equal(stats().hits, 3);
    assert.equal(stats().misses, 3);

    const dlc = path.join(tmp, 'extensions', 'ego_dlc_effective_probe');
    fs.mkdirSync(path.join(dlc, 'md'), { recursive: true });
    fs.writeFileSync(path.join(dlc, 'content.xml'), '<content id="ego_dlc_effective_probe"/>');
    fs.writeFileSync(path.join(dlc, relative), '<diff><replace sel="/mdscript/cues/cue/actions/debug_text/@text">100</replace></diff>');
    assert.equal(parity(p).diffSimulation.files[0].sources.at(-1)?.source, 'ego_dlc_effective_probe');
    assert.equal(stats().misses, 5);

    const changedReferences = structuredClone(corpus.references);
    changedReferences.wares.add('forge_effective_probe');
    parity(p, changedReferences);
    assert.equal(stats().misses, 7);
    const schema = path.join(tmp, 'libraries', 'common.xsd');
    const original = fs.readFileSync(schema, 'utf8');
    fs.writeFileSync(schema, original.replaceAll('name="debug_text"', 'name="forge_effective_debug_text"'));
    try {
      parity(p, changedReferences);
      assert.equal(stats().misses, 9);
      assert.equal(stats().hits, 3);
    } finally {
      fs.writeFileSync(schema, original);
    }
  });
  check('effective AI script diagnostics retain their domain through cache hits', () => {
    const p = project();
    const relative = 'aiscripts/reuse_probe.xml';
    p.files = [...p.files.filter(file => file.path === 'content.xml'), {
      path: relative, kind: 'aiscript',
      content: '<diff><add sel="/aiscript/actions"><debug_text text="1" forge_unknown_ai="1"/></add></diff>',
    }];
    const absolute = path.join(tmp, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, '<aiscript name="ReuseProbe"><actions><debug_text text="0"/></actions></aiscript>');
    const before = getProjectValidationCacheStats().effectiveSchema;
    const cold = parity(p);
    assert.ok(cold.diffSimulation.files[0].postApplyFindings.some(finding =>
      finding.domain === 'ai_scripts' && finding.message.includes('forge_unknown_ai')));
    assert.deepEqual(parity(p), cold);
    const after = getProjectValidationCacheStats().effectiveSchema;
    assert.equal(after.hits, before.hits + 2);
    assert.equal(after.misses, before.misses + 2);
  });
} finally {
  process.env.X4_REFERENCE_ROOT=saved;clearReferenceCorpusCache();clearReferenceLanguageCaches();
  assert.equal(path.dirname(path.resolve(tmp)),path.resolve(os.tmpdir()));fs.rmSync(tmp,{recursive:true,force:true});
}
console.log(JSON.stringify({pass:checks.every(c=>c.pass),passed:checks.filter(c=>c.pass).length,total:checks.length,stats:getProjectValidationCacheStats(),checks},null,2));
if(checks.some(c=>!c.pass))process.exitCode=1;
