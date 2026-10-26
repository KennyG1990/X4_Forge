import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { runProjectValidation, clearProjectValidationCache, getProjectValidationCacheStats } from '../src/server/projectValidation';
import { getReferenceCorpus } from '../src/lib/referenceCorpus';
import { clearX4UiAnalysisCache } from '../src/lib/x4UiAnalysisCache';
import type { ExtensionProject } from '../src/lib/extensionProject';

// Frozen corpus input and pre-change baseline are supplied, never copied from an active mod.
const evidence = path.resolve(process.argv[2]);
const baseline = JSON.parse(fs.readFileSync(path.join(evidence, 'baseline-unprofiled-profile.json'), 'utf8'));
const start = performance.now();
const corpus = getReferenceCorpus(process.env.X4_REFERENCE_ROOT!);
const referenceMs = performance.now() - start;
const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const median = (values: number[]) => [...values].sort((a,b) => a-b)[Math.floor(values.length/2)];
if (process.argv.includes('--largest-edit')) {
  const p:ExtensionProject=JSON.parse(fs.readFileSync(path.join(evidence,'representative.json'),'utf8'));
  const file=p.files.filter(f=>f.path.endsWith('.xml')).sort((a,b)=>(b.content?.length||0)-(a.content?.length||0))[0];
  runProjectValidation(p,{references:corpus.references});
  file.content+='\n<!-- largest representative XML edit -->';
  const then=performance.now();const fast=runProjectValidation(p,{references:corpus.references});const incrementalMs=performance.now()-then;
  const fullStart=performance.now();const full=runProjectValidation(p,{references:corpus.references,incremental:false});const fullMs=performance.now()-fullStart;
  assert.deepEqual(fast,full);
  const result={file:file.path,bytes:Buffer.byteLength(file.content),incrementalMs,fullMs,reductionPercent:100*(1-incrementalMs/fullMs),sha256:sha(full),pass:incrementalMs<=fullMs/2};
  fs.writeFileSync(path.join(evidence,'largest-edit-benchmark.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));assert.ok(result.pass,'largest-file edit acceptance');process.exit(0);
}
const outputs: unknown[] = [];
for (const [name, filename] of [['regression', 'tests/fixtures/forge-regression/project.json'], ['representative', path.join(evidence, 'representative.json')]]) {
  const project: ExtensionProject = JSON.parse(fs.readFileSync(filename, 'utf8'));
  const old = baseline.outputs.find((o: any) => o.name === name);
  clearProjectValidationCache(); clearX4UiAnalysisCache();
  const samples: Array<{mode:string; ms:number; sha256:string}> = [];
  const measure = (mode: string, p: ExtensionProject, incremental = true) => {
    const then = performance.now();
    const result = runProjectValidation(p, {references:corpus.references, incremental});
    samples.push({mode, ms:performance.now()-then, sha256:sha(result)});
    return result;
  };
  const cold = measure('cold', project);
  assert.equal(sha(cold), old.samples[0].sha256, 'pre-change result equality');
  for (let i=0;i<3;i++) assert.deepEqual(measure('unchanged', project), cold);
  const edited = structuredClone(project);
  edited.files.find(f=>f.path==='md/forge_regression_lab.xml')!.content += '\n<!-- single file edit -->';
  const changed = measure('single-edit', edited);
  assert.equal(sha(changed), old.samples.find((s:any)=>s.mode==='single-edit').sha256);
  const full = measure('fresh-full', edited, false);
  assert.deepEqual(changed, full);
  // Each later sample introduces fresh bytes, rather than timing the same cached edited file.
  for (let i=1;i<3;i++) {
    const p=structuredClone(project);
    p.files.find(f=>f.path==='md/forge_regression_lab.xml')!.content += `\n<!-- single file edit ${i} -->`;
    assert.deepEqual(measure('single-edit',p), measure('fresh-full',p,false));
  }
  const oldEdit=old.samples.find((s:any)=>s.mode==='single-edit').ms;
  const newEdit=median(samples.filter(s=>s.mode==='single-edit').map(s=>s.ms));
  const limit=oldEdit>2000 ? oldEdit*0.5 : oldEdit+Math.max(20,oldEdit*0.1);
  const result={name,files:project.files.length,sourceBytes:project.files.reduce((n,f)=>n+Buffer.byteLength(f.content||''),0),samples,baselineSingleEditMs:oldEdit,medianSingleEditMs:newEdit,limitMs:limit,reductionPercent:100*(1-newEdit/oldEdit),pass:newEdit<=limit,stats:getProjectValidationCacheStats()};
  outputs.push(result);
  fs.writeFileSync(path.join(evidence,'incremental-benchmark.json'),JSON.stringify({referenceMs,outputs},null,2));
  console.log(JSON.stringify(result));
  assert.ok(result.pass, `${name} latency acceptance`);
}
