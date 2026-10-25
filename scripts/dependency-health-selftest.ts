import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { probeDependencyPath, buildDependencyHealth, type DependencyPathIo, type DependencyPath } from '../src/server/dependencyHealth';
import { resolveXsdConfig } from '../src/lib/xsdParser';
const root=path.resolve('test-results/dependency-health/focused-'+Date.now());fs.mkdirSync(root,{recursive:true});
const checks:string[]=[];const check=(name:string,fn:()=>void)=>{fn();checks.push(name);};
const file=path.join(root,'input.xml');fs.writeFileSync(file,'not XML');
const input:DependencyPath={id:'test',path:file,kind:'file',setting:'testPath',affects:'Test'};
check('readable-invalid-content-not-validated',()=>assert.equal(probeDependencyPath(input).status,'readable'));
check('directory-readable',()=>assert.equal(probeDependencyPath({...input,path:root,kind:'directory'}).status,'readable'));
check('missing-file-named',()=>{const r=probeDependencyPath({...input,path:path.join(root,'missing')});assert.equal(r.reason,'missing');assert.match(r.detail,/testPath/);assert.equal(r.errorCode,'ENOENT');});
check('unconfigured',()=>assert.equal(probeDependencyPath({...input,path:null}).reason,'unconfigured'));
check('directory-as-file',()=>assert.equal(probeDependencyPath({...input,path:root}).reason,'wrong-type'));
check('file-as-directory',()=>assert.equal(probeDependencyPath({...input,kind:'directory'}).reason,'wrong-type'));
for(const code of ['EACCES','EPERM','EIO'])check('error-'+code,()=>{
 const io={...fs,openSync:()=>{throw Object.assign(new Error('secret exception text'),{code});}} as DependencyPathIo;
 const r=probeDependencyPath(input,io);assert.equal(r.reason,code==='EIO'?'probe-failed':'unreadable');assert.equal(r.errorCode,code);assert.ok(!JSON.stringify(r).includes('secret exception text'));
});
check('unknown-error-sanitized',()=>{const io={...fs,statSync:()=>{throw new Error('secret');}} as DependencyPathIo;assert.equal(probeDependencyPath(input,io).errorCode,'UNKNOWN');});
check('read-error-closes-handle',()=>{let closed=false;const io={...fs,readSync:()=>{throw Object.assign(new Error('failed'),{code:'EIO'});},closeSync:(fd:number)=>{closed=true;fs.closeSync(fd);}} as DependencyPathIo;assert.equal(probeDependencyPath(input,io).reason,'probe-failed');assert.ok(closed);});
check('same-path-rechecked',()=>{fs.unlinkSync(file);assert.equal(probeDependencyPath(input).reason,'missing');fs.writeFileSync(file,'recovered');assert.equal(probeDependencyPath(input).status,'readable');});
check('empty-file-readable-not-schema-valid',()=>{fs.writeFileSync(file,'');assert.equal(probeDependencyPath(input).status,'readable');});
check('independent-checks-and-explicit-scope',()=>{
 const saved=Object.fromEntries(['X4_REFERENCE_ROOT','X4_XSD_PATH'].map(key=>[key,process.env[key]]));
 try {
  delete process.env.X4_REFERENCE_ROOT;delete process.env.X4_XSD_PATH;
  const resolved=resolveXsdConfig({x4ReferenceRoot:root,xsdSchemaPath:root,x4GamePath:root,modWorkspacePath:root});
  const r=buildDependencyHealth(resolved);assert.equal(r.dependencies.length,7);assert.equal(r.validatesMod,false);assert.equal(r.failureKind,'forge-environment');assert.equal(r.changesDeployPolicy,false);assert.ok(r.unavailableCount>0);assert.equal(r.dependencies.find(r=>r.id==='game_directory')?.status,'readable');
 } finally {
  for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
 }
});
console.log(JSON.stringify({pass:true,total:checks.length,checks}));
