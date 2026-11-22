import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runProjectValidation, clearProjectValidationCache, getProjectValidationCacheStats } from '../src/server/projectValidation';
import { getReferenceCorpus, clearReferenceCorpusCache } from '../src/lib/referenceCorpus';
import { clearReferenceLanguageCaches } from '../src/lib/referenceLanguage';
import { createBoundedAnalysisCache } from '../src/lib/x4UiAnalysisCache';
import { resolveEffectiveReferenceDocument } from '../src/lib/referenceOverlay';
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
check('ordinary facts stay warm across a 500-file validation and one edit', () => {
  const p = project();
  p.files = p.files.filter(file => file.path === mdPath || file.path === 'content.xml');
  p.files.push(...Array.from({ length: 498 }, (_, index) => ({
    path: `fixtures/file_${index}.xml`, kind: 'other' as const, content: '<root/>',
  })));
  assert.equal(p.files.length, 500);
  clearProjectValidationCache();
  const cold = parity(p);
  const before = getProjectValidationCacheStats();
  assert.ok(before.misses > 508);
  assert.deepEqual(parity(structuredClone(p)), cold);
  const warm = getProjectValidationCacheStats();
  assert.equal(warm.misses, before.misses);
  assert.equal(warm.hits - before.hits, before.misses);
  assert.equal(warm.evictions, 0);

  p.files.find(file => file.path === mdPath)!.content = md('<debug_text text="1" forge_invalid="1"/>');
  const edited = parity(p);
  const after = getProjectValidationCacheStats();
  assert.ok(edited.summary.schemaErrors > cold.summary.schemaErrors);
  assert.ok(after.misses > warm.misses && after.misses <= warm.misses + 9);
  assert.ok(after.entries <= 4_500 && after.accountedBytes <= 24 * 1024 * 1024);
});
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
    const coldDiff = getProjectValidationCacheStats().effectiveDiff;
    assert.equal(coldDiff.misses, 1);
    assert.deepEqual(parity(structuredClone(p)), initial);
    assert.equal(getProjectValidationCacheStats().effectiveDiff.hits, coldDiff.hits + 1);
    assert.equal(stats().hits, 0, 'An exact diff hit skips both effective-schema lookups');
    patch.content = patch.content.replace('<diff>', '<diff><!-- same composed output -->');
    assert.deepEqual(parity(p).diffSimulation, initial.diffSimulation);
    assert.equal(getProjectValidationCacheStats().effectiveDiff.misses, coldDiff.misses + 1);
    assert.equal(stats().hits, 2, 'Changed authored input with identical output reuses both schema results');

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
    const coldDiff = getProjectValidationCacheStats().effectiveDiff;
    assert.deepEqual(parity(p), cold);
    assert.equal(getProjectValidationCacheStats().effectiveDiff.hits, coldDiff.hits + 1);
    assert.equal(getProjectValidationCacheStats().effectiveSchema.hits, before.hits);
    p.files.find(file => file.path === relative)!.content = p.files.find(file => file.path === relative)!.content!
      .replace('<diff>', '<diff><!-- identical AI output -->');
    assert.deepEqual(parity(p).diffSimulation, cold.diffSimulation);
    assert.equal(getProjectValidationCacheStats().effectiveDiff.misses, coldDiff.misses + 1);
    const after = getProjectValidationCacheStats().effectiveSchema;
    assert.equal(after.hits, before.hits + 2);
    assert.equal(after.misses, before.misses + 2);
  });

  const returnPath = 'md/diff_cache_return.xml';
  const scopePath = 'md/diff_cache_scope.xml';
  const aiPath = 'aiscripts/diff_cache_ai.xml';
  const fixedReferenceTime = new Date('2020-01-01T00:00:00Z');
  const referenceDocuments = [
    [returnPath, '<mdscript name="CacheReturn"><cues><cue name="Init"><actions/></cue></cues></mdscript>'],
    [scopePath, '<mdscript name="CacheScope"><cues><library name="Run" purpose="run_actions"><actions/></library><cue name="Caller"><actions/></cue></cues></mdscript>'],
    [aiPath, '<aiscript name="CacheAi"><actions><debug_text text="0"/></actions></aiscript>'],
  ] as const;
  for (const [relative, content] of referenceDocuments) {
    const filename = path.join(tmp, relative);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, content);
    fs.utimesSync(filename, fixedReferenceTime, fixedReferenceTime);
  }
  function diffProject(): ExtensionProject {
    const p = project();
    p.files = [...p.files.filter(file => file.path === 'content.xml'),
      { path: returnPath, kind: 'md', content: '<diff>\n  <add sel="/mdscript/cues/cue/actions">\n    <return/>\n  </add>\n</diff>' },
      { path: scopePath, kind: 'md', content: '<diff>\n  <add sel="/mdscript/cues/cue/actions">\n    <include_actions ref="Run"/>\n  </add>\n</diff>' },
      { path: aiPath, kind: 'aiscript', content: '<diff>\n  <add sel="/aiscript/actions">\n    <set_value name="$probe" exact="1 else 2"/>\n    <debug_text text="0" forge_diff_unknown="1"/>\n  </add>\n</diff>' },
    ];
    return p;
  }
  const diffStats = () => getProjectValidationCacheStats().effectiveDiff;
  const returnFinding = (result: ReturnType<typeof runProjectValidation>) =>
    result.pitfalls.findings.find(finding => finding.code === 'md_pitfall.return_context' && finding.filePath === returnPath);
  check('three exact authored diffs retain provenance and skip inner schema work on warm hits', () => {
    clearProjectValidationCache();
    const p = diffProject();
    const cold = parity(p);
    assert.equal(cold.diffSimulation.files.length, 3);
    assert.deepEqual({ line: returnFinding(cold)?.line, column: returnFinding(cold)?.column }, { line: 3, column: 5 });
    assert.ok(cold.crossFile.findings.some(finding => finding.code === 'md.include_actions_run_library'
      && finding.file === scopePath && finding.line === 3 && finding.column === 5));
    assert.ok(cold.pitfalls.findings.some(finding => finding.code === 'md.unmatched_else'
      && finding.filePath === aiPath && finding.line === 3 && (finding.column ?? 0) > 5));
    assert.ok(cold.diffSimulation.files.find(file => file.path === aiPath)!.postApplyFindings.some(finding =>
      finding.domain === 'ai_scripts' && finding.message.includes('forge_diff_unknown')));
    assert.equal(diffStats().misses, 3);
    assert.equal(diffStats().entries, 3);
    const before = getProjectValidationCacheStats();
    assert.deepEqual(parity(structuredClone(p)), cold);
    const after = getProjectValidationCacheStats();
    assert.equal(after.effectiveDiff.hits, before.effectiveDiff.hits + 3);
    assert.equal(after.effectiveDiff.misses, before.effectiveDiff.misses);
    assert.deepEqual(after.effectiveSchema, before.effectiveSchema);
    assert.ok(after.effectiveDiff.accountedBytes <= 4 * 1024 * 1024);
    assert.ok(after.accountedBytes + after.lua.accountedBytes + after.effectiveSchema.accountedBytes
      + after.effectiveDiff.accountedBytes <= 32 * 1024 * 1024);
  });
  check('changed authored diff misses exactly one local result and keeps raw positions', () => {
    const p = diffProject();
    parity(p);
    const before = diffStats();
    p.files.find(file => file.path === returnPath)!.content = '\n\n' + p.files.find(file => file.path === returnPath)!.content;
    const changed = parity(p);
    assert.deepEqual({ line: returnFinding(changed)?.line, column: returnFinding(changed)?.column }, { line: 5, column: 5 });
    assert.equal(diffStats().misses, before.misses + 1);
    assert.equal(diffStats().hits, before.hits + 2);
  });
  check('equal-size canonical text with restored mtime invalidates the authored diff result', () => {
    const p = diffProject();
    const beforeResult = parity(p);
    const before = diffStats();
    const filename = path.join(tmp, returnPath);
    const original = fs.readFileSync(filename, 'utf8');
    const originalStat = fs.statSync(filename, { bigint: true });
    const changed = original.replace('name="Init"', 'name="Next"');
    assert.notEqual(changed, original);
    assert.equal(Buffer.byteLength(changed), Buffer.byteLength(original));
    try {
      fs.writeFileSync(filename, changed);
      fs.utimesSync(filename, fixedReferenceTime, fixedReferenceTime);
      const currentStat = fs.statSync(filename, { bigint: true });
      assert.equal(currentStat.size, originalStat.size);
      assert.equal(currentStat.mtimeNs, originalStat.mtimeNs);
      // Qualify the current resolver input explicitly; this tests the outer cache's
      // exact-content dependency independently of filesystem metadata cache policy.
      assert.equal(resolveEffectiveReferenceDocument(tmp, returnPath, true).content, changed);
      const after = parity(p);
      assert.equal(returnFinding(beforeResult)?.cue, 'Init');
      assert.equal(returnFinding(after)?.cue, 'Next');
      assert.equal(diffStats().misses, before.misses + 1);
      assert.equal(diffStats().hits, before.hits + 2);
    } finally {
      fs.writeFileSync(filename, original);
      fs.utimesSync(filename, fixedReferenceTime, fixedReferenceTime);
      resolveEffectiveReferenceDocument(tmp, returnPath, true);
    }
    assert.deepEqual(parity(p), beforeResult);
  });
  check('reference vocabulary and governing schema invalidate all three local diff facts', () => {
    clearProjectValidationCache();
    const p = diffProject();
    parity(p);
    const beforeReferences = diffStats();
    const references = structuredClone(corpus.references);
    references.wares.add('forge_diff_cache_reference');
    const withReferences = parity(p, references);
    assert.equal(diffStats().misses, beforeReferences.misses + 3);
    assert.equal(diffStats().hits, beforeReferences.hits);
    const filename = path.join(tmp, 'libraries/common.xsd');
    const original = fs.readFileSync(filename, 'utf8');
    const originalStat = fs.statSync(filename);
    assert.ok(original.includes('name="debug_text"'));
    try {
      fs.writeFileSync(filename, original.replaceAll('name="debug_text"', 'name="forge_diff_debug_text"'));
      const changedTime = new Date(originalStat.mtimeMs + 2000);
      fs.utimesSync(filename, changedTime, changedTime);
      const beforeSchema = diffStats();
      const changed = parity(p, references);
      assert.equal(diffStats().misses, beforeSchema.misses + 3);
      assert.equal(diffStats().hits, beforeSchema.hits);
      assert.notDeepEqual(changed.diffSimulation.files.find(file => file.path === aiPath)!.postApplyFindings,
        withReferences.diffSimulation.files.find(file => file.path === aiPath)!.postApplyFindings);
    } finally {
      fs.writeFileSync(filename, original);
      const restoredTime = new Date(originalStat.mtimeMs + 4000);
      fs.utimesSync(filename, restoredTime, restoredTime);
    }
    assert.deepEqual(parity(p, references), withReferences);
  });
  check('warm incomplete reference cannot reuse prior authored findings and recovers', () => {
    clearProjectValidationCache();
    const p = diffProject();
    const healthy = parity(p);
    assert.ok(returnFinding(healthy));
    const before = diffStats();
    const overlay = path.join(tmp, 'extensions/ego_dlc_effective_probe', returnPath);
    fs.mkdirSync(path.dirname(overlay), { recursive: true });
    fs.writeFileSync(overlay, '<diff><add sel="/mdscript/cues"><cue name="Broken"></add></diff>');
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const unavailable = parity(p);
        assert.ok(unavailable.evidence!.coverage.gaps.some(gap => gap.check === 'diff.reference' && gap.filePath === returnPath));
        assert.equal(returnFinding(unavailable), undefined);
        assert.equal(diffStats().misses, before.misses);
        assert.equal(diffStats().hits, before.hits + (attempt + 1) * 2);
        assert.equal(diffStats().entries, before.entries);
      }
    } finally {
      fs.unlinkSync(overlay);
      resolveEffectiveReferenceDocument(tmp, returnPath, true);
    }
    assert.deepEqual(parity(p), healthy);
  });
  check('cold and warm returned diff findings cannot contaminate retained local facts', () => {
    clearProjectValidationCache();
    const p = diffProject();
    const expected = runProjectValidation(p, { references: corpus.references, incremental: false });
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = parity(p);
      result.pitfalls.findings.length = 0;
      result.crossFile.findings.length = 0;
      for (const entry of result.diffSimulation.files) { entry.findings.length = 0; entry.postApplyFindings.length = 0; }
      result.evidence!.findings.length = 0;
      assert.deepEqual(parity(p), expected);
    }
    assert.ok(diffStats().hits >= 9);
    assert.equal(diffStats().misses, 3);
  });
  check('successful simulation with a local namespace gap is retried without retaining facts', () => {
    clearProjectValidationCache();
    const p = diffProject();
    p.files = p.files.filter(file => file.path === 'content.xml' || file.path === returnPath);
    p.files.find(file => file.path === returnPath)!.content =
      '<diff><add sel="/mdscript/cues/cue/actions"><return xmlns="urn:forge-cache-unsupported"/></add></diff>';
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = parity(p);
      assert.ok(result.diffSimulation.files[0].findings.every(finding => finding.severity !== 'error'));
      assert.ok(result.evidence!.coverage.gaps.some(gap => gap.check === 'md.return_context'
        && gap.filePath === returnPath && /namespace/i.test(gap.reason)));
      assert.equal(diffStats().hits, 0);
      assert.equal(diffStats().misses, attempt + 1);
      assert.equal(diffStats().bypasses, attempt + 1);
      assert.equal(diffStats().entries, 0);
    }
  });
  check('ordinary routed library diffs remain fresh and never enter the dedicated script cache', () => {
    for (const relative of ['libraries/factions.xsd', 'libraries/diff.xsd']) {
      fs.copyFileSync(path.join(root, relative), path.join(tmp, relative));
    }
    const relative = 'libraries/factions.xml';
    fs.writeFileSync(path.join(tmp, relative), '<factions><faction id="forge_cache_faction"/></factions>');
    const p = project();
    p.files = [...p.files.filter(file => file.path === 'content.xml'), {
      path: relative, kind: 'library',
      content: '<diff><add sel="/factions/faction" type="@forge_routed_unknown">1</add></diff>',
    }];
    clearProjectValidationCache();
    const cold = parity(p);
    assert.ok(cold.schema.routed.some(route => route.path === relative && route.domainAvailable));
    assert.ok(cold.diffSimulation.files[0].postApplyFindings.some(finding => finding.message.includes('forge_routed_unknown')));
    const before = diffStats();
    assert.equal(before.misses, 0);
    assert.equal(before.entries, 0);
    assert.deepEqual(parity(structuredClone(p)), cold);
    assert.deepEqual(diffStats(), before);
  });
} finally {
  process.env.X4_REFERENCE_ROOT=saved;clearReferenceCorpusCache();clearReferenceLanguageCaches();
  assert.equal(path.dirname(path.resolve(tmp)),path.resolve(os.tmpdir()));fs.rmSync(tmp,{recursive:true,force:true});
}
console.log(JSON.stringify({pass:checks.every(c=>c.pass),passed:checks.filter(c=>c.pass).length,total:checks.length,stats:getProjectValidationCacheStats(),checks},null,2));
if(checks.some(c=>!c.pass))process.exitCode=1;
