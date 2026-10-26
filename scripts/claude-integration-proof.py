"""C01: actual HTTP validation/deployment against an owned disposable production server.
Requires X4_REFERENCE_ROOT pointing to a read-only unpacked game corpus. Never connects
with existing credentials or installs into an existing game. All writes: test-results/.
"""
import copy, hashlib, json, os, pathlib, queue, shutil, socket, subprocess, threading, time, urllib.request, urllib.error, uuid
ROOT = pathlib.Path(__file__).resolve().parents[1]
script_hash = hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()
MOD_ID = 'forge_regression_lab'
out = ROOT / 'test-results/claude-integration'
out.mkdir(parents=True, exist_ok=True)
run = out / ('run-' + uuid.uuid4().hex[:8])
for name in ['mods', 'game/extensions', 'state', 'data', 'config', 'discovery']:
    (run / name).mkdir(parents=True, exist_ok=True)
corpus = pathlib.Path(os.environ['X4_REFERENCE_ROOT']).resolve(strict=True)
config = dict(x4GamePath=str(run/'game'), modWorkspacePath=str(run/'mods'),
              filesystemPath=str(run/'game/extensions'), x4LogPath=str(run/'simulated.log'),
              x4ReferenceRoot=str(corpus), xsdSchemaPath=str(corpus/'libraries'))
(run/'simulated.log').write_text('', encoding='utf-8')
(run/'config/config.json').write_text(json.dumps(config), encoding='utf-8')
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
token = uuid.uuid4().hex * 2
workspace = None
checks = {'completed': False}
mcp_children = []
responses = {}
env = {k:v for k,v in os.environ.items() if not k.startswith('X4')}
env.update(PORT=str(port), NODE_ENV='production', STUDIO_API_TOKEN=token,
           X4_STATE_DIR=str(run/'state'), X4_DATA_DIR=str(run/'data'),
           X4_SOURCE_COORDINATION_DIR=str(run/'source-coordination'),
           X4_CONFIG_DIR=str(run/'config'), X4FORGE_DISCOVERY_DIR=str(run/'discovery'),
           X4_FORGE_MODE='claude-integration-test', NODE_PATH=str(ROOT/'node_modules'))
entry = ROOT/'dist/server.cjs'
log = open(run/'server.log', 'w', encoding='utf-8')
child = subprocess.Popen([shutil.which('node'), str(entry)], cwd=ROOT, env=env,
                         stdout=log, stderr=subprocess.STDOUT,
                         creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)

def request(route,body=None):
 headers={'Authorization':'Bearer '+token,'x-client-id':'client_claude_integration'}
 if workspace:headers['x-workspace-id']=workspace
 if body is not None:headers.update({'Content-Type':'application/json','x-forge-operation-id':'forge_op_'+uuid.uuid4().hex})
 req=urllib.request.Request(f'http://127.0.0.1:{port}'+route,data=json.dumps(body).encode() if body is not None else None,headers=headers)
 try:
  with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req,timeout=120) as res:return res.status,json.load(res)
 except urllib.error.HTTPError as ex:return ex.code,json.load(ex)

def tree(folder):
 return {p.relative_to(folder).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in folder.rglob('*') if p.is_file()}

def save(name, route, body=None):
 code,result=request(route,body)
 (run/(name+'.json')).write_text(json.dumps({'http':code,'response':result},indent=2),encoding='utf-8')
 return code,result

def identity(preview):
 return {'expected'+k[0].upper()+k[1:]:preview[k] for k in ['modId','sourceHash','artifactHash','bindingHash']}
try:
 for _ in range(150):
  if child.poll() is not None:raise RuntimeError('Server exited')
  try:
   if request('/api/agent/schema')[0]==200:break
  except (OSError,urllib.error.URLError):pass
  time.sleep(.2)
 else:raise RuntimeError('Startup timeout')
 code,b=request('/api/agent/workspaces/bootstrap',{'clientId':'client_claude_integration'});assert code==200;workspace=b['workspaceId']
 base=json.loads((ROOT/'tests/fixtures/forge-regression/project.json').read_text(encoding='utf-8'))
 next(f for f in base['files'] if f['path']=='ui/lab.lua')['content']='-- FORGE_LAB BUILD=100 SCHEMA=1\nreturn {build=100,schema=1}\n'
 source=run/'mods'/MOD_ID;source.mkdir()
 fixtures={}
 for name in ['clean','warnings','accepted','mixed','incomplete']:
  p=copy.deepcopy(base)
  md=next(f for f in p['files'] if f['path']=='md/forge_regression_lab.xml')
  if name in ['warnings','accepted','mixed']:
   nodes='<set_value name="$probe" exact="$x.forge_review_warning_a"/>'
   if name=='mixed':nodes+='<set_value name="$probe2" exact="$x.forge_review_warning_b"/>'
   md['content']=md['content'].replace('</actions>',nodes+'</actions>')
  if name=='incomplete':next(f for f in p['files'] if f['path']=='ui/lab.lua')['content']='function SendProbe(name) AddUITriggeredEvent("ForgeLab", name, {}) end'
  for f in p['files']:
   dest=source/f['path'];dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(f['content'],encoding='utf-8',newline='')
  before=tree(run/'game/extensions')
  code,preview=request('/api/agent/deploy-verify',{'path':MOD_ID,'dryRun':True,'deployFormat':'loose'});assert code==200 and preview.get('ok'),preview
  checks[name+'-preview-no-write']=tree(run/'game/extensions')==before
  approvals=[]
  if name in ['accepted','mixed']:
   warning=next(f for f in preview['validation']['evidence']['findings'] if f.get('code')=='scriptproperty.unknown' and 'warning_a' in f['message'])
   approvals=[{'findingId':warning['findingId'],'bindingHash':preview['bindingHash'],'reason':'Reviewed scratch fixture warning; not approval for a real mod.'}]
   code,proposed=request('/api/agent/deploy-verify',{'path':MOD_ID,'dryRun':True,'deployFormat':'loose','acceptances':approvals});assert code==200 and proposed.get('ok')
   fixtures['proposed']=proposed
  if name=='clean':
   lua=source/'ui/lab.lua';original=lua.read_bytes();lua.write_bytes(original+b'\n-- edit after preview\n')
   code,stale=save('stale-refusal','/api/agent/deploy-verify',{'path':MOD_ID,'deployFormat':'loose',**identity(preview)})
   checks['stale-refused-before-write']=code==409 and stale.get('code')=='DEPLOY_IDENTITY_MISMATCH' and tree(run/'game/extensions')==before
   lua.write_bytes(original)
   for field in ['ModId','SourceHash','ArtifactHash','BindingHash']:
    expected=identity(preview);expected['expected'+field]='wrong_mod' if field=='ModId' else '0'*64
    code,wrong=save('wrong-'+field,'/api/agent/deploy-verify',{'path':MOD_ID,'deployFormat':'loose',**expected})
    checks['wrong-'+field+'-refused']=code==409 and wrong.get('ok') is False and tree(run/'game/extensions')==before
  code,result=save('deploy-'+name,'/api/agent/deploy-verify',{'path':MOD_ID,'deployFormat':'loose',**identity(preview),'acceptances':approvals});assert code==200 and result.get('ok'),result
  fixtures[name]=result
  receipt=result['deployRecord'];assert json.loads((run/'data/action-receipts'/(receipt['id']+'.json')).read_text(encoding='utf-8'))==receipt
  checks[name+'-bytes-record']=result['bytesConfirmed'] is True and receipt['status']=='committed'
  checks[name+'-exact-snapshot']=tree(run/'game/extensions'/MOD_ID)=={f['path']:f['sha256'] for f in result['validatedArtifact']['files']}
  checks[name+'-snapshot-record']=receipt['metadata']['validatedArtifactHash']==result['validatedArtifact']['hash']
  print(json.dumps({'case':name,'outcome':result['validation']['outcome'],'counts':result['validation']['review']['counts']}),flush=True)
 checks['clean']=fixtures['clean']['validation']['clean'] is True
 checks['accepted']=fixtures['accepted']['validation']['review']['counts']['acceptedWarnings']==1 and fixtures['accepted']['validation']['review']['status']=='recorded'
 checks['mixed']=fixtures['mixed']['validation']['review']['counts']['acceptedWarnings']==1 and fixtures['mixed']['validation']['review']['counts']['unacceptedWarnings']==1
 checks['incomplete']=fixtures['incomplete']['validation']['clean'] is False and fixtures['incomplete']['validation']['outcome']=='incomplete-checks'
 checks['proposed-not-recorded']=fixtures['proposed']['validation']['review']['status']=='proposed'
 # Import and compilation exercise the actual generated manifest, not HTTP replay fixtures.
 for f in base['files']:(source/f['path']).write_text(f['content'],encoding='utf-8',newline='')
 code,imp=save('import','/api/agent/mod-folder/import',{'root':'workspace','path':MOD_ID})
 assert code==200 and imp.get('success'),imp
 ws=imp['workspace'];checks['manifest-source-owned']=any(f['path']=='ui.xml' for f in ws.get('uiSourceFiles',[])) and not any(f['path']=='ui.xml' for f in ws.get('passthroughFiles',[]))
 original_source=tree(source);original_target=tree(run/'game/extensions')
 for name,valid in [('good',True),('invalid',False)]:
  candidate=copy.deepcopy(ws)
  if not valid:next(f for f in candidate['uiSourceFiles'] if f['path']=='ui/lab.lua')['content']='local broken = )'
  for route in ['compile','package','artifact/build']:
   body={'workspace':candidate}
   if route=='artifact/build':body['format']='loose'
   code,r=save(name+'-'+route.replace('/','-'),'/api/agent/'+route,body)
   checks[name+'-'+route+'-truth']=code==200 and r.get('success') is valid and r.get('validation',{}).get('ok') is valid and r.get('generation',{}).get('success') is True
   checks[name+'-'+route+'-identity']=r.get('modId')==MOD_ID
   if not valid:checks[route+'-failure-envelope']=r.get('code')=='PROJECT_VALIDATION_FAILED' and bool(r.get('diagnostics'))
   if route=='artifact/build':
    target=pathlib.Path(r['artifactPath']).resolve();assert target.is_relative_to((run/'mods/.forge-builds').resolve())
    checks[name+'-artifact-byte-scope']=r['artifact'].get('verified') is True and r['artifact'].get('verificationScope')=='artifact-bytes'
   else:checks[name+'-'+route+'-manifest-preserved']=r.get('files',{}).get('ui.xml')==next(f['content'] for f in base['files'] if f['path']=='ui.xml')
  code,w=request('/api/agent/workspaces',{'workspace':candidate,'name':'C01 '+name,'clientId':'client_claude_integration'});assert code==201,w
  workspace=w['workspaceId']
  code,key=request('/api/agent/keys',{'label':'Disposable C01 proof','scope':'write','ttl':'7d','workspaceId':workspace,'clientId':'client_claude_integration'});assert code==200,key
  m_env={**env,'X4FORGE_URL':f'http://127.0.0.1:{port}','X4FORGE_KEY':key['token'],'X4FORGE_WORKSPACE_ID':workspace}
  m=subprocess.Popen([shutil.which('node'),str(ROOT/'vscode-extension/mcp/x4forge-mcp.cjs')],cwd=ROOT,env=m_env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8',creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
  mcp_children.append(m);q=queue.Queue()
  def read_replies(process=m, replies=q):
   for line in process.stdout:replies.put(line)
  threading.Thread(target=read_replies,daemon=True).start()
  def rpc(identifier,method,params):
   m.stdin.write(json.dumps({'jsonrpc':'2.0','id':identifier,'method':method,'params':params})+'\n');m.stdin.flush()
   deadline=time.monotonic()+60
   while time.monotonic()<deadline:
    response=json.loads(q.get(timeout=max(.1,deadline-time.monotonic())))
    if response.get('id')==identifier:return response
   raise TimeoutError('Owned MCP response timed out')
  rpc(1,'initialize',{'protocolVersion':'2024-11-05','capabilities':{},'clientInfo':{'name':'C01-proof','version':'1'}})
  reply=rpc(2,'tools/call',{'name':'compile_workspace','arguments':{}})
  (run/('mcp-'+name+'.json')).write_text(json.dumps(reply,indent=2),encoding='utf-8')
  result=reply['result'];payload=json.loads(result['content'][0]['text'])
  checks['mcp-'+name+'-truth']=payload.get('success') is valid and bool(result.get('isError')) is (not valid) and payload.get('validation',{}).get('ok') is valid
  checks['mcp-'+name+'-evidence']=payload.get('modId')==MOD_ID and bool(payload.get('files'))
  m.stdin.close();m.wait(timeout=15)
 code,r=save('invalid-import','/api/agent/mod-folder/import',{'path':MOD_ID,'unsupported':True});checks['strict-import']=code==400 and r.get('success') is not True
 code,r=save('runtime-status','/api/agent/runtime-control');checks['no-game-no-ready']=code==200 and r.get('helperAvailable') is False and r.get('gameVerified') is False and r.get('enabled') is False and r.get('request') is None
 checks['compile-no-source-or-deploy-write']=tree(source)==original_source and tree(run/'game/extensions')==original_target
 # Dependency failure/recovery is independent of mod correctness. Only child config changes.
 code,r=save('health-good','/api/agent/status');checks['health-readable']=r['dependencyHealth']['status']=='paths-readable'
 missing=run/'missing-corpus';config.update(x4ReferenceRoot=str(missing),xsdSchemaPath=str(missing/'libraries'));(run/'config/config.json').write_text(json.dumps(config),encoding='utf-8')
 code,r=save('health-missing','/api/agent/status');checks['health-missing-named']=code==200 and r['dependencyHealth']['failureKind']=='forge-environment' and any(d.get('path')==str(missing) and d.get('reason')=='missing' for d in r['dependencyHealth']['dependencies'])
 config.update(x4ReferenceRoot=str(corpus),xsdSchemaPath=str(corpus/'libraries'));(run/'config/config.json').write_text(json.dumps(config),encoding='utf-8')
 code,r=save('health-recovered','/api/agent/status');checks['health-recovered']=r['dependencyHealth']['status']=='paths-readable' and r['dependencyHealth']['validatesMod'] is False
 (out/'responses.json').write_text(json.dumps(fixtures,indent=2),encoding='utf-8')
 checks['completed']=True
finally:
 for m in mcp_children:
  if m.poll() is None:m.terminate()
  m.wait(timeout=15)
 if child.poll() is None:child.terminate()
 child.wait(timeout=15);log.close();checks['owned-server-stopped']=child.poll() is not None and all(m.poll() is not None for m in mcp_children)
 checks['harness-unchanged']=script_hash==hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()
 result={'pass':bool(checks) and all(checks.values()),'checks':checks,'pid':child.pid,'run':str(run),'scriptHash':script_hash,'serverHash':hashlib.sha256(entry.read_bytes()).hexdigest()}
 (out/'verdict.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps({'pass':result['pass'],'checks':len(checks)}),flush=True)
assert result['pass']
