import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { analyzeLuaFiles } from '../src/lib/luaStaticAnalysis';
import { buildX4UiCallModel } from '../src/lib/x4UiCallModel';
import { lintX4UiCallModel } from '../src/lib/x4UiLint';
const project = JSON.parse(fs.readFileSync('tests/fixtures/forge-regression/project.json','utf8'));
const files=project.files.filter((f:any)=>f.path.endsWith('.lua')).map((f:any)=>({rel:f.path,text:f.content,source:'loose' as const,sourcePath:f.path,extension:{id:project.id,folder:project.id}}));
if(process.argv.includes('--ui-heavy')) {
 files.find((f:any)=>f.rel==='ui/large.lua').text="local menu = {name = 'Perf', layer = 1}\nfunction menu.open() OpenMenu('Perf') end\n"+Array.from({length:500},(_,i)=>`function menu.view${i}()\nlocal frame = Helper.createFrameHandle(menu, {width=100,height=100})\nlocal tab = frame:addTable(2, {width=100})\nlocal row = tab:addRow(nil, {height=20})\nrow[1]:createButton():setText('Example ${i}')\nend\n`).join('');
}
const samples=[];
for(let i=0;i<5;i++) {
 const start=performance.now();const result=analyzeLuaFiles(files);const elapsedMs=performance.now()-start;
 samples.push({elapsedMs,files:result.filesScanned,errors:result.findings.filter(f=>f.severity==='error').length});
}
const start=performance.now();for(const f of files)lintX4UiCallModel(buildX4UiCallModel(f));
console.log(JSON.stringify({luaFiles:files.length,sourceBytes:files.reduce((n:number,f:any)=>n+Buffer.byteLength(f.text),0),samples,uncachedUiPassMs:performance.now()-start}));
