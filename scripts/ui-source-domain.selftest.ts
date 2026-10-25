import assert from 'node:assert/strict';
import { sanitizeWorkspace, workspaceSourceFiles } from '../src/types';
import { buildTemplateWorkspace } from '../src/lib/modTemplates';
import { buildX4UiWorkspaceSource, spliceX4UiWorkspaceSource } from '../src/lib/x4UiWorkspaceSource';
import { canonicalWorkspaceContentString } from '../src/lib/workspaceIdentity';
import { hasEffectiveAuthoredOutput } from '../src/lib/modCompiler';

const xml = '<?xml version="1.0"?>\r\n<addon name="fixture"><environment type="menus"><dependency name="ego_detailmonitor"/><!-- retain --><file name="ui/main.lua"/></environment></addon>\r\n';
const lua = 'local value = 1\r\n';
const ws = sanitizeWorkspace({ ...buildTemplateWorkspace('blank'),
  uiSourceFiles: [{path:'ui.xml',kind:'ui',content:xml},{path:'ui/main.lua',kind:'lua',content:lua}],
  passthroughFiles: [{path:'other.txt',content:'untouched',reason:'unknown_domain'}] });
assert.equal(ws.uiSourceFiles?.length,2);
assert.equal(ws.uiSourceFiles?.[0].content,xml);
assert.equal(hasEffectiveAuthoredOutput(ws),true);
const source=buildX4UiWorkspaceSource(ws);
assert.equal(source.status,'source-owned');
const edit={path:'ui/main.lua',startOffset:lua.indexOf('1'),endOffset:lua.indexOf('1')+1,expectedText:'1',replacement:'2'};
const changed=spliceX4UiWorkspaceSource(ws,source,edit);
assert.equal(changed.accepted,true);
assert.equal(changed.workspace.uiSourceFiles?.[1].content,lua.replace('1','2'));
assert.equal(changed.workspace.uiSourceFiles?.[0].content,xml);
assert.deepEqual(changed.workspace.passthroughFiles,ws.passthroughFiles);
assert.notEqual(canonicalWorkspaceContentString(ws),canonicalWorkspaceContentString(changed.workspace));
assert.equal(spliceX4UiWorkspaceSource(changed.workspace,source,edit).accepted,false);
assert.equal(ws.uiSourceFiles?.[1].content,lua);
const reopened=sanitizeWorkspace(JSON.parse(JSON.stringify(changed.workspace)));
assert.equal(buildX4UiWorkspaceSource(reopened).status,'source-owned');
assert.deepEqual(workspaceSourceFiles(reopened),workspaceSourceFiles(changed.workspace));
const legacy=sanitizeWorkspace({...ws,uiSourceFiles:undefined,passthroughFiles:workspaceSourceFiles(ws)});
assert.equal(buildX4UiWorkspaceSource(legacy).status,'source-owned');
const legacyResult=spliceX4UiWorkspaceSource(legacy,buildX4UiWorkspaceSource(legacy),edit);
assert.equal(legacyResult.accepted,true);
assert.equal(legacyResult.workspace.uiSourceFiles,undefined);
assert.equal(legacyResult.workspace.passthroughFiles?.[1].content,lua.replace('1','2'));
const duplicate=sanitizeWorkspace({...ws,passthroughFiles:[...(ws.passthroughFiles||[]),{path:'ui.xml',content:xml}]});
assert.notEqual(buildX4UiWorkspaceSource(duplicate).status,'source-owned');
console.log('UI source domain: 18 assertions PASS (new source, legacy, persistence, source edits, stale refusal, duplicate ownership)');
