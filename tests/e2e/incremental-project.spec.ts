import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { E2E_API_ORIGIN, E2E_STATE_DIR } from '../../playwright.config';
import { ephemeralWorkspaceHeaders, seedServerWorkspace } from './ephemeral';

test('C05 warm HTTP validation sees edits and scratch deploy refuses stale bytes', async ({request,page}) => {
  test.setTimeout(600_000);
  const out=path.resolve('test-results/claude-C05',`run-${randomUUID()}`);
  fs.mkdirSync(out,{recursive:true});
  const headers=await ephemeralWorkspaceHeaders(true);
  const project=JSON.parse(fs.readFileSync('tests/fixtures/forge-regression/project.json','utf8'));
  const md=project.files.find((f:any)=>f.path==='md/forge_regression_lab.xml');
  md.content='<mdscript name="Lab"><cues><cue name="Init"><actions><debug_text text="0"/></actions></cue></cues></mdscript>';
  let calls=0;
  const timings:Array<{route:string;ms:number;status:number}>=[];
  const post=async(route:string,body:unknown)=>{
    const start=performance.now();
    const response=await request.post(E2E_API_ORIGIN+route,{headers:{...headers,Connection:'close'},data:body});
    const data=await response.json();
    timings.push({route,ms:performance.now()-start,status:response.status()});
    fs.writeFileSync(path.join(out,`${++calls}-${route.split('/').pop()}.json`),JSON.stringify({status:response.status(),data},null,2));
    return {status:response.status(),data};
  };
  const validate=async()=>{
    const r=await post('/api/agent/project/validate',{project});expect(r.status).toBe(200);
    expect(r.data.modId).toBe(project.id);expect(r.data.sourceHash).toMatch(/^[a-f0-9]{64}$/);return r.data;
  };
  const cold=await validate();
  const warm=await validate();
  expect(warm).toEqual(cold);
  const original=md.content;
  md.content=md.content.replace('<debug_text ','<debug_text forge_invalid="yes" ');
  const edited=await validate();expect(edited.summary.schemaErrors).toBeGreaterThan(0);expect(edited.sourceHash).not.toBe(cold.sourceHash);
  md.content=original;expect(await validate()).toEqual(cold);
  md.content=original.replace('<debug_text text="0"/>','<raise_lua_event name="&apos;forge.reply&apos;"/>');
  const lua=project.files.find((f:any)=>f.path==='ui/lab.lua');const originalLua=lua.content;
  lua.content='RegisterEvent("forge.reply", function() end)';expect((await validate()).summary.mdLuaMissingRegisters).toBe(0);
  lua.content='return {}';expect((await validate()).summary.mdLuaMissingRegisters).toBe(1);
  md.content=original;lua.content=originalLua;expect(await validate()).toEqual(cold);
  const mods=path.join(out,'mods'),source=path.join(mods,project.id),game=path.join(out,'game');
  fs.mkdirSync(path.join(game,'extensions'),{recursive:true});fs.writeFileSync(path.join(game,'X4.exe'),'Inert marker, never executed.');
  for(const f of project.files){const filename=path.join(source,f.path);fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,f.content);}
  expect((await post('/api/schema/config',{modWorkspacePath:mods,filesystemPath:path.join(game,'extensions'),x4GamePath:game})).status).toBe(200);
  const imported=await post('/api/agent/mod-folder/import',{root:'workspace',path:project.id});expect(imported.data.success).toBe(true);await seedServerWorkspace(imported.data.workspace);
  const target={path:project.id,deployFormat:'loose'};
  const preview=(await post('/api/agent/deploy-verify',{...target,dryRun:true})).data;
  const identity=Object.fromEntries(['modId','sourceHash','artifactHash','bindingHash'].map(k=>[`expected${k[0].toUpperCase()}${k.slice(1)}`,preview[k]]));
  const deployed=(await post('/api/agent/deploy-verify',{...target,...identity})).data;
  expect(deployed.ok,JSON.stringify(deployed)).toBe(true);expect(deployed.deployRecord.status).toBe('committed');
  const digest=(filename:string)=>createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
  const installed=project.files.map((f:any)=>({path:f.path,sha256:digest(path.join(game,'extensions',project.id,f.path))}));
  for(const f of installed)expect(f.sha256).toBe(digest(path.join(source,f.path)));
  fs.appendFileSync(path.join(source,'md/forge_regression_lab.xml'),'\n<!-- changed after validation -->');
  const stale=await post('/api/agent/deploy-verify',{...target,...identity});expect(stale.status).toBe(409);
  for(const f of installed)expect(digest(path.join(game,'extensions',project.id,f.path))).toBe(f.sha256);
  const next=(await post('/api/agent/deploy-verify',{...target,dryRun:true})).data;expect(next.sourceHash).not.toBe(preview.sourceHash);
  // Existing visible verdict must keep its qualification after reuse; no new UI surface.
  await page.addInitScript(()=>{localStorage.setItem('x4_forge_experience_mode','expert');localStorage.removeItem('x4_mod_studio_workspace');localStorage.removeItem('x4_mod_studio_version');});
  await page.goto('/');await page.locator('[data-sidebar-tab="playtest"]').click();await page.getByTestId('verify-path-input').fill(project.id);await page.getByTestId('deploy-verify-btn').click();
  const result=page.getByTestId('verify-result');await expect(result.getByTestId('deploy-review-title')).toContainText('Deployed',{timeout:90_000});
  await expect(result.getByTestId('deploy-review-title')).not.toHaveText('Deployed — validated');await result.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'warm-deploy.png'),fullPage:true});
  fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify({pass:true,checks:['identical-warm-response','schema-error-and-repair','sibling-listener-change','exact-deployed-bytes','stale-refusal-no-write','fresh-preview-new-identity','rendered-qualified-result'],timings,modId:deployed.modId,sourceHash:deployed.sourceHash,deployReceiptId:deployed.deployRecord.id,installed},null,2));
  const index=await request.get(E2E_API_ORIGIN+'/api/agent/selftest-index');expect(index.ok()).toBe(true);
  const paths=(await index.json()).selftests as string[];expect(paths.length).toBeGreaterThan(0);
  const oracles=[];
  let cacheContainmentChecked=false;
  for(const route of paths){
    const response=await request.get(E2E_API_ORIGIN+'/api'+route,{timeout:60_000});
    const data=await response.json();
    if(route==='/agent/db-selftest'){
      expect(data.available).toBe(true);
      const expectedCache=path.join(E2E_STATE_DIR,'data','studio-cache','index.db');
      expect(path.resolve(data.liveCache)).toBe(expectedCache);
      expect(fs.existsSync(expectedCache)).toBe(true);
      cacheContainmentChecked=true;
      fs.writeFileSync(path.join(out,'studio-cache-containment.json'),JSON.stringify({pass:true,expectedCache,actualCache:data.liveCache},null,2));
    }
    fs.writeFileSync(path.join(out,`oracle-${route.split('/').pop()}.json`),JSON.stringify({status:response.status(),data},null,2));
    oracles.push({route,status:response.status(),pass:response.ok()&&!!(data.allPassed??data.pass),passed:data.passed,total:data.total});
    fs.writeFileSync(path.join(out,'oracles.json'),JSON.stringify(oracles,null,2));
  }
  expect(oracles.filter(o=>!o.pass)).toEqual([]);
  expect(cacheContainmentChecked).toBe(true);
});
