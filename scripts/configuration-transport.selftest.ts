import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const MCP_SCRIPT = path.join(REPO_ROOT, 'vscode-extension', 'mcp', 'x4forge-mcp.cjs');

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(err => (err ? reject(err) : resolve(port)));
    });
  });
}

async function httpJson(
  baseUrl: string,
  method: 'GET' | 'POST',
  apiPath: string,
  token: string | null,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: any }> {
  const reqHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...headers };
  if (token) reqHeaders.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${apiPath}`, {
    method,
    headers: reqHeaders,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* non-json */ }
  return { status: res.status, json };
}

interface RunningBackend {
  child: ChildProcess;
  baseUrl: string;
  stop(): Promise<void>;
}

async function startBackend(envOverrides: Record<string, string>): Promise<RunningBackend> {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(port), API_ONLY: 'true', ...envOverrides };
  delete env.X4_XSD_PATH;
  delete env.X4_REFERENCE_ROOT;
  if (envOverrides.X4_REFERENCE_ROOT) env.X4_REFERENCE_ROOT = envOverrides.X4_REFERENCE_ROOT;
  if (envOverrides.X4_XSD_PATH) env.X4_XSD_PATH = envOverrides.X4_XSD_PATH;

  const tsxCli = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const child = spawn(process.execPath, [tsxCli, 'server.ts'], {
    cwd: REPO_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stderr = '';
  child.stderr?.on('data', chunk => { stderr += String(chunk); });

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Backend exited early (${child.exitCode}): ${stderr}`);
    }
    try {
      const probe = await fetch(`${baseUrl}/api/agent/schema`);
      if (probe.ok) break;
    } catch { /* wait */ }
    await new Promise(r => setTimeout(r, 150));
  }
  const verify = await fetch(`${baseUrl}/api/agent/schema`);
  assert.equal(verify.status, 200, `Backend failed to come up: ${stderr}`);

  return {
    child,
    baseUrl,
    async stop() {
      if (child.exitCode !== null) return;
      child.kill();
      await new Promise<void>(resolve => {
        const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* ignore */ } resolve(); }, 5000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
      });
    },
  };
}

interface McpSession {
  request(method: string, params?: unknown): Promise<any>;
  callTool(name: string, args?: Record<string, unknown>): Promise<{ isError: boolean; payload: any; raw: any }>;
  close(): Promise<void>;
}

async function startMcpSession(baseUrl: string, key: string, workspaceId: string): Promise<McpSession> {
  const child = spawn(process.execPath, [MCP_SCRIPT], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      X4FORGE_URL: baseUrl,
      X4FORGE_KEY: key,
      X4FORGE_WORKSPACE_ID: workspaceId,
      X4FORGE_CAPABILITY_RETRY_MS: '100',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let buffer = '';
  let nextId = 1;
  const pending = new Map<number, { resolve: (msg: any) => void; reject: (err: Error) => void }>();
  child.stdout.on('data', chunk => {
    buffer += chunk;
    while (buffer.includes('\n')) {
      const idx = buffer.indexOf('\n');
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (typeof msg.id === 'number' && pending.has(msg.id)) {
        const waiter = pending.get(msg.id)!;
        pending.delete(msg.id);
        waiter.resolve(msg);
      }
    }
  });
  const request = (method: string, params?: unknown) => new Promise<any>((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, ...(params !== undefined ? { params } : {}) })}\n`);
  });
  const init = await request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'config-transport-test', version: '1.0.0' },
  });
  assert(init.result?.protocolVersion);
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  return {
    request,
    async callTool(name: string, args: Record<string, unknown> = {}) {
      const msg = await request('tools/call', { name, arguments: args });
      if (msg.error) return { isError: true, payload: msg.error, raw: msg };
      const text = msg.result?.content?.[0]?.text ?? '';
      let payload: any = text;
      try { payload = JSON.parse(text); } catch { /* plain text */ }
      return { isError: !!msg.result?.isError, payload, raw: msg };
    },
    async close() {
      child.stdin.end();
      await new Promise<void>(resolve => {
        if (child.exitCode !== null) return resolve();
        const t = setTimeout(() => { try { child.kill(); } catch { /* ignore */ } resolve(); }, 3000);
        child.once('exit', () => { clearTimeout(t); resolve(); });
      });
    },
  };
}

async function main() {
  const parent = fs.realpathSync.native(process.env.TEMP || os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, 'forge-96-transport-'));
  const checks: Array<{ name: string; pass: boolean; error?: string }> = [];
  const check = async (name: string, fn: () => Promise<void> | void) => {
    try { await fn(); checks.push({ name, pass: true }); }
    catch (err) { checks.push({ name, pass: false, error: err instanceof Error ? err.stack : String(err) }); }
  };

  const configDir = path.join(root, 'config');
  const dataDir = path.join(root, 'data');
  const stateDir = path.join(root, 'state');
  const coordDir = path.join(root, 'coord');
  const discoveryDir = path.join(root, 'discovery');
  const allowedRoot = path.join(root, 'allowed');
  const deniedRoot = path.join(root, 'denied');
  const game1 = path.join(allowedRoot, 'game1');
  const game2 = path.join(allowedRoot, 'game2');
  const corpus1 = path.join(allowedRoot, 'corpus1');
  const corpus2 = path.join(allowedRoot, 'corpus2');
  const schema1 = path.join(allowedRoot, 'schema1');
  const schemaIncomplete = path.join(allowedRoot, 'schema-incomplete');
  const mods1 = path.join(allowedRoot, 'mods1');
  const mods2 = path.join(allowedRoot, 'mods2');
  const browse1 = path.join(allowedRoot, 'browse1');
  const browse2 = path.join(allowedRoot, 'browse2');

  for (const d of [configDir, dataDir, stateDir, coordDir, discoveryDir, allowedRoot, deniedRoot,
    path.join(game1, 'extensions'), path.join(game2, 'extensions'), corpus1, corpus2, schema1, schemaIncomplete, mods1, mods2, browse1, browse2]) {
    fs.mkdirSync(d, { recursive: true });
  }
  fs.writeFileSync(path.join(game1, 'X4.exe'), 'fixture');
  fs.writeFileSync(path.join(game2, 'X4.exe'), 'fixture');
  const repoHarvested = path.join(REPO_ROOT, 'data', 'harvested-schemas');
  if (fs.existsSync(path.join(repoHarvested, 'md.xsd')) && fs.existsSync(path.join(repoHarvested, 'common.xsd'))) {
    fs.copyFileSync(path.join(repoHarvested, 'md.xsd'), path.join(schema1, 'md.xsd'));
    fs.copyFileSync(path.join(repoHarvested, 'common.xsd'), path.join(schema1, 'common.xsd'));
  } else {
    fs.writeFileSync(path.join(schema1, 'md.xsd'), '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"/>');
    fs.writeFileSync(path.join(schema1, 'common.xsd'), '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"/>');
  }
  const modDir = path.join(mods1, 'cfg_test_mod');
  fs.mkdirSync(path.join(modDir, 'md'), { recursive: true });
  fs.writeFileSync(path.join(modDir, 'content.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<content id="cfg_test_mod" name="Cfg Test Mod" version="100" author="QA" date="2026-11-23" save="0">\n  <text language="44" name="Cfg Test Mod" description="Fixture" author="QA" />\n</content>\n');
  fs.writeFileSync(path.join(modDir, 'md', 'cfg_probe.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<mdscript name="Cfg_Probe" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="md.xsd">\n  <cues>\n    <cue name="Init">\n      <conditions><event_cue_signalled /></conditions>\n      <actions><write_to_logbook category="general" title="\'Cfg\'" text="\'ok\'" /></actions>\n    </cue>\n  </cues>\n</mdscript>\n');

  fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({
    x4GamePath: game1,
    x4ReferenceRoot: corpus1,
    xsdSchemaPath: schema1,
    modWorkspacePath: mods1,
    filesystemPath: browse1,
    x4LogPath: 'PRIVATE_LOG_SENTINEL_DO_NOT_EXPOSE',
  }, null, 2) + '\n');

  const studioToken = 'studio_96_secret_token_do_not_expose';
  const clientHeaders = { 'x-client-id': 'client_96_owner_tab' };
  const baseEnv = {
    STUDIO_API_TOKEN: studioToken,
    X4_CONFIG_DIR: configDir,
    X4_DATA_DIR: dataDir,
    X4_STATE_DIR: stateDir,
    X4_SOURCE_COORDINATION_DIR: coordDir,
    X4FORGE_DISCOVERY_DIR: discoveryDir,
    X4_FORGE_MODE: 'dev-build',
  };

  let backend1: RunningBackend | undefined;
  let backend2: RunningBackend | undefined;
  let scratchBackend: RunningBackend | undefined;
  let mcpPreset: McpSession | undefined;
  let mcpStudio: McpSession | undefined;
  let mcpConfig: McpSession | undefined;
  let mcpConfig2: McpSession | undefined;

  try {
    backend1 = await startBackend(baseEnv);
    const bootstrap = await httpJson(backend1.baseUrl, 'POST', '/api/agent/workspaces/bootstrap', studioToken, {
      clientId: 'client_96_owner_tab',
    }, clientHeaders);
    assert.equal(bootstrap.status, 200);
    const workspaceId: string = bootstrap.json.workspaceId;
    const wsHeaders = { ...clientHeaders, 'x-workspace-id': workspaceId };

    const presetMint = await httpJson(backend1.baseUrl, 'POST', '/api/agent/keys', studioToken, {
      label: 'preset-deploy', scope: 'deploy', ttl: '1h',
    }, wsHeaders);
    assert.equal(presetMint.status, 200);
    const presetDeployToken: string = presetMint.json.token;

    const configCapabilities = [
      'configuration.access.request@1',
      'configuration.access.status@1',
      'configuration.apply@1',
      'configuration.preview@1',
      'configuration.read@1',
      'configuration.status@1',
    ];
    const configMint = await httpJson(backend1.baseUrl, 'POST', '/api/agent/keys', studioToken, {
      label: 'scoped-config-agent',
      scope: 'deploy',
      ttl: '1h',
      authorityMode: 'exact',
      capabilityIdentities: configCapabilities,
      allowedEffects: ['read', 'analyze', 'audit-write', 'audit-retention-delete', 'filesystem-write'],
    }, wsHeaders);
    assert.equal(configMint.status, 200, JSON.stringify(configMint.json));
    const configAgentToken: string = configMint.json.token;
    const configAgentKeyId: string = configMint.json.record.id;

    const ephemeralMint = await httpJson(backend1.baseUrl, 'POST', '/api/agent/keys', studioToken, {
      label: 'process-bound-config-agent',
      scope: 'deploy',
      ttl: '1h',
      authorityMode: 'exact',
      capabilityIdentities: configCapabilities,
      allowedEffects: ['read', 'analyze', 'audit-write', 'audit-retention-delete', 'filesystem-write'],
    }, wsHeaders);
    assert.equal(ephemeralMint.status, 200, JSON.stringify(ephemeralMint.json));
    const ephemeralToken: string = ephemeralMint.json.token;

    await check('preset deploy key and Studio-token-in-MCP gain zero configuration access', async () => {
      const denied = await httpJson(backend1!.baseUrl, 'GET', '/api/agent/configuration', presetDeployToken, undefined, { 'x-workspace-id': workspaceId });
      assert.equal(denied.status, 403);
      assert.equal(denied.json.authorityCode, 'CAPABILITY_NOT_GRANTED');

      mcpPreset = await startMcpSession(backend1!.baseUrl, presetDeployToken, workspaceId);
      const presetTools = (await mcpPreset.request('tools/list')).result.tools.map((t: any) => t.name);
      assert(!presetTools.some((name: string) => name.includes('configuration')), `Preset MCP leaked config tools: ${presetTools.join(',')}`);

      mcpStudio = await startMcpSession(backend1!.baseUrl, studioToken, workspaceId);
      const studioTools = (await mcpStudio.request('tools/list')).result.tools.map((t: any) => t.name);
      assert.deepEqual(studioTools, [], 'Studio token must never activate MCP tools');
    });

    mcpConfig = await startMcpSession(backend1.baseUrl, configAgentToken, workspaceId);
    let instance1: any;

    await check('explicit key discovers MCP tools and ungranted calls return exact approval workflow + instance', async () => {
      const tools = (await mcpConfig!.request('tools/list')).result.tools.map((t: any) => t.name).sort();
      assert.deepEqual(tools, [
        'apply_configuration_change',
        'explain_element',
        'get_configuration',
        'get_configuration_access_status',
        'get_configuration_operation_status',
        'list_schema_domains',
        'preview_configuration_change',
        'request_configuration_access',
      ]);

      const statusRes = await httpJson(backend1!.baseUrl, 'GET', '/api/agent/status', presetDeployToken, undefined, { 'x-workspace-id': workspaceId });
      assert.equal(statusRes.status, 200);
      assert(statusRes.json.configurationInstance?.profileId?.startsWith('profile_'));
      instance1 = statusRes.json.configurationInstance;

      const apiDenied = await httpJson(backend1!.baseUrl, 'GET', '/api/agent/configuration', configAgentToken, undefined, { 'x-workspace-id': workspaceId });
      const mcpDenied = await mcpConfig!.callTool('get_configuration');
      assert.equal(apiDenied.status, 403);
      assert.equal(mcpDenied.isError, true);
      assert.equal(apiDenied.json.code, 'CONFIGURATION_GRANT_REQUIRED');
      assert.deepEqual(mcpDenied.payload, apiDenied.json, 'MCP and API refusal diagnostics must match');
      assert.deepEqual(apiDenied.json.instance, instance1);
      assert.equal(apiDenied.json.approvalWorkflow.requestMcpTool, 'request_configuration_access');
    });

    let approvedReceiptId = '';
    await check('MCP access request + Studio owner approval + status polling commits bounded session grant', async () => {
      const reqArgs = {
        instance: instance1,
        operationId: 'mcp-access-req-0001',
        fields: ['schemaDir', 'x4ReferenceRoot', 'x4GamePath', 'modWorkspacePath', 'filesystemPath', 'deployFormat'],
        roots: {
          schemaDir: [allowedRoot],
          x4ReferenceRoot: [allowedRoot],
          x4GamePath: [allowedRoot],
          modWorkspacePath: [allowedRoot],
          filesystemPath: [allowedRoot],
        },
        durationMs: 600_000,
        restartPolicy: 'same-profile',
      };
      const req1 = await mcpConfig!.callTool('request_configuration_access', reqArgs);
      assert.equal(req1.isError, false, JSON.stringify(req1.payload));
      assert.equal(req1.payload.state, 'pending');
      const replay = await httpJson(backend1!.baseUrl, 'POST', '/api/agent/configuration/access/request', configAgentToken, reqArgs, { 'x-workspace-id': workspaceId });
      assert.equal(replay.status, 200);
      assert.deepEqual(replay.json, req1.payload);

      // Conflicting operationId on access request fails closed
      const conflictReq = await httpJson(backend1!.baseUrl, 'POST', '/api/agent/configuration/access/request', configAgentToken, {
        ...reqArgs,
        durationMs: 300_000,
      }, { 'x-workspace-id': workspaceId });
      assert.equal(conflictReq.status, 409);
      assert.equal(conflictReq.json.code, 'CONFIGURATION_OPERATION_CONFLICT');

      // Agent cannot self-approve
      const selfApprove = await httpJson(backend1!.baseUrl, 'POST', '/api/agent/keys/configuration-access/decision', configAgentToken, {
        requestId: req1.payload.requestId, approve: true, instance: instance1,
      }, { 'x-workspace-id': workspaceId });
      assert.equal(selfApprove.status, 403);

      // Owner lists and approves
      const listRes = await httpJson(backend1!.baseUrl, 'GET', '/api/agent/keys/configuration-access', studioToken, undefined, clientHeaders);
      assert.equal(listRes.status, 200);
      const pendingRow = listRes.json.requests.find((r: any) => r.requestId === req1.payload.requestId);
      assert(pendingRow && pendingRow.keyId === configAgentKeyId);

      const decision = await httpJson(backend1!.baseUrl, 'POST', '/api/agent/keys/configuration-access/decision', studioToken, {
        requestId: req1.payload.requestId, approve: true, instance: instance1,
      }, clientHeaders);
      assert.equal(decision.status, 200, JSON.stringify(decision.json));
      assert.equal(decision.json.state, 'approved');
      assert(decision.json.receiptId?.startsWith('ar_'));
      approvedReceiptId = decision.json.receiptId;

      const mcpStatus = await mcpConfig!.callTool('get_configuration_access_status', { operationId: 'mcp-access-req-0001' });
      const apiStatus = await httpJson(backend1!.baseUrl, 'GET', '/api/agent/configuration/access?operationId=mcp-access-req-0001', configAgentToken, undefined, { 'x-workspace-id': workspaceId });
      assert.equal(mcpStatus.isError, false);
      assert.deepEqual(mcpStatus.payload, apiStatus.json);
      assert.equal(mcpStatus.payload.receiptId, approvedReceiptId);

      // Also grant a default process-bound grant (restartPolicy omitted) to ephemeralToken to verify invalidation on restart
      const procReq = await httpJson(backend1!.baseUrl, 'POST', '/api/agent/configuration/access/request', ephemeralToken, {
        instance: instance1,
        operationId: 'proc-access-req-0002',
        fields: ['deployFormat'],
        roots: {},
        durationMs: 600_000,
      }, { 'x-workspace-id': workspaceId });
      assert.equal(procReq.status, 200);
      const procDecision = await httpJson(backend1!.baseUrl, 'POST', '/api/agent/keys/configuration-access/decision', studioToken, {
        requestId: procReq.json.requestId, approve: true, instance: instance1,
      }, clientHeaders);
      assert.equal(procDecision.status, 200);
      const procRead = await httpJson(backend1!.baseUrl, 'GET', '/api/agent/configuration', ephemeralToken, undefined, { 'x-workspace-id': workspaceId });
      assert.equal(procRead.status, 200);
    });

    await check('read, preview, apply, omission, incomplete schema, and CAS negatives work identically across API and MCP', async () => {
      const mcpRead1 = await mcpConfig!.callTool('get_configuration');
      const apiRead1 = await httpJson(backend1!.baseUrl, 'GET', '/api/agent/configuration', configAgentToken, undefined, { 'x-workspace-id': workspaceId });
      assert.equal(mcpRead1.isError, false);
      assert.deepEqual(mcpRead1.payload, apiRead1.json);
      assert(!JSON.stringify(mcpRead1.payload).includes('PRIVATE_LOG_SENTINEL_DO_NOT_EXPOSE'));
      assert(!JSON.stringify(mcpRead1.payload).includes(studioToken));
      assert.equal(mcpRead1.payload.provenance.deployFormat, 'default');
      assert.equal(mcpRead1.payload.provenance.x4GamePath, 'saved');
      assert.equal(mcpRead1.payload.schemaComplete, true);

      // Wrong instance fails closed
      const wrongInstRes = await mcpConfig!.callTool('preview_configuration_change', {
        instance: { ...instance1, pid: instance1.pid + 99999 },
        revision: mcpRead1.payload.revision,
        operationId: 'neg-wrong-instance-01',
        patch: { deployFormat: 'catalog' },
      });
      assert.equal(wrongInstRes.isError, true);
      assert.equal(wrongInstRes.payload.code, 'CONFIGURATION_INSTANCE_MISMATCH');

      // Denied root and protected overlap fail closed
      const deniedRootRes = await mcpConfig!.callTool('preview_configuration_change', {
        instance: instance1, revision: mcpRead1.payload.revision, operationId: 'neg-denied-root-01',
        patch: { modWorkspacePath: deniedRoot },
      });
      assert.equal(deniedRootRes.isError, true);
      assert.equal(deniedRootRes.payload.code, 'CONFIGURATION_ROOT_DENIED');

      const overlapRes = await mcpConfig!.callTool('preview_configuration_change', {
        instance: instance1, revision: mcpRead1.payload.revision, operationId: 'neg-overlap-01',
        patch: { modWorkspacePath: path.join(game1, 'extensions') },
      });
      assert.equal(overlapRes.isError, true);
      assert.equal(overlapRes.payload.code, 'PROTECTED_ROOT_OVERLAP');

      // Apply directory + format changes via MCP (including incomplete schema warning without save failure)
      const prev1 = await mcpConfig!.callTool('preview_configuration_change', {
        instance: instance1,
        revision: mcpRead1.payload.revision,
        operationId: 'mcp-change-all-0001',
        patch: {
          schemaDir: schemaIncomplete,
          x4ReferenceRoot: corpus2,
          x4GamePath: game2,
          modWorkspacePath: mods2,
          filesystemPath: browse2,
          deployFormat: 'catalog',
        },
      });
      assert.equal(prev1.isError, false, JSON.stringify(prev1.payload));
      assert.equal(prev1.payload.schemaComplete, false);
      assert(typeof prev1.payload.schemaWarning === 'string' && prev1.payload.schemaWarning.length > 0);

      const app1 = await mcpConfig!.callTool('apply_configuration_change', {
        instance: instance1,
        proposalId: prev1.payload.proposalId,
        operationId: 'mcp-change-all-0001',
      });
      assert.equal(app1.isError, false, JSON.stringify(app1.payload));
      assert.equal(app1.payload.saved, true);
      assert.equal(app1.payload.receiptStatus, 'committed');
      assert.equal(app1.payload.receipt.client.channel, 'mcp');

      // Replay apply is idempotent; conflicting preview operationId and mismatched apply proposalId are rejected
      const app1Replay = await mcpConfig!.callTool('apply_configuration_change', {
        instance: instance1,
        proposalId: prev1.payload.proposalId,
        operationId: 'mcp-change-all-0001',
      });
      assert.equal(app1Replay.payload.replayed, true);
      assert.equal(app1Replay.payload.receipt.id, app1.payload.receipt.id);

      const proposalMismatch = await mcpConfig!.callTool('apply_configuration_change', {
        instance: instance1,
        proposalId: 'cfgprop_different_id',
        operationId: 'mcp-change-all-0001',
      });
      assert.equal(proposalMismatch.isError, true);
      assert.equal(proposalMismatch.payload.code, 'CONFIGURATION_PROPOSAL_MISMATCH');

      // Omitted fields preserve values when restoring schema1 + game1 + mods1 via HTTP API
      const readAfterMcp = await mcpConfig!.callTool('get_configuration');
      assert.equal(readAfterMcp.payload.effective.deployFormat, 'catalog');
      assert.equal(readAfterMcp.payload.provenance.deployFormat, 'saved');
      assert.equal(readAfterMcp.payload.schemaComplete, false);

      const opConflict = await mcpConfig!.callTool('preview_configuration_change', {
        instance: instance1,
        revision: readAfterMcp.payload.revision,
        operationId: 'mcp-change-all-0001',
        patch: { deployFormat: 'loose' },
      });
      assert.equal(opConflict.isError, true);
      assert.equal(opConflict.payload.code, 'CONFIGURATION_OPERATION_CONFLICT');

      const apiPrev = await httpJson(backend1!.baseUrl, 'POST', '/api/agent/configuration/preview', configAgentToken, {
        instance: instance1,
        revision: readAfterMcp.payload.revision,
        operationId: 'api-restore-paths-0002',
        patch: { schemaDir: schema1, x4GamePath: game1, modWorkspacePath: mods1 },
      }, { 'x-workspace-id': workspaceId });
      assert.equal(apiPrev.status, 200);

      const stalePrev = await mcpConfig!.callTool('preview_configuration_change', {
        instance: instance1,
        revision: readAfterMcp.payload.revision,
        operationId: 'mcp-stale-by-apply-0003',
        patch: { deployFormat: 'loose' },
      });
      assert.equal(stalePrev.isError, false);

      const apiApp = await httpJson(backend1!.baseUrl, 'POST', '/api/agent/configuration/apply', configAgentToken, {
        instance: instance1,
        proposalId: apiPrev.json.proposalId,
        operationId: 'api-restore-paths-0002',
      }, { 'x-workspace-id': workspaceId });
      assert.equal(apiApp.status, 200);
      assert.equal(apiApp.json.saved, true);
      assert.equal(apiApp.json.receipt.client.channel, 'api');

      const staleApply = await mcpConfig!.callTool('apply_configuration_change', {
        instance: instance1,
        proposalId: stalePrev.payload.proposalId,
        operationId: 'mcp-stale-by-apply-0003',
      });
      assert.equal(staleApply.isError, true);
      assert.equal(staleApply.payload.code, 'CONFIGURATION_REVISION_STALE');

      const diskCfg = JSON.parse(fs.readFileSync(path.join(configDir, 'config.json'), 'utf8'));
      assert.equal(diskCfg.x4LogPath, 'PRIVATE_LOG_SENTINEL_DO_NOT_EXPOSE');
      assert.equal(diskCfg.deployFormat, 'catalog');
      assert.equal(diskCfg.x4ReferenceRoot, corpus2);
      assert.equal(diskCfg.filesystemPath, browse2);

      const opStatus = await mcpConfig!.callTool('get_configuration_operation_status', { operationId: 'api-restore-paths-0002' });
      assert.equal(opStatus.isError, false);
      assert.equal(opStatus.payload.saved, true);
      assert.equal(opStatus.payload.recoveryPatch.modWorkspacePath, mods2);
    });

    await check('one-shot deploy format override preserves saved preference and default change invalidates reviewed deploy preview', async () => {
      const imported = await httpJson(backend1!.baseUrl, 'POST', '/api/agent/mod-folder/import', presetDeployToken, {
        path: 'cfg_test_mod', root: 'workspace',
      }, { 'x-workspace-id': workspaceId });
      assert.equal(imported.status, 200, JSON.stringify(imported.json));
      const savedWs = await httpJson(backend1!.baseUrl, 'POST', '/api/agent/workspace', presetDeployToken, {
        workspace: imported.json.workspace,
      }, { 'x-workspace-id': workspaceId, 'x-forge-operation-id': 'save-ws-cfg-test-mod-01' });
      assert.equal(savedWs.status, 200, JSON.stringify(savedWs.json));

      const loosePreview = await httpJson(backend1!.baseUrl, 'POST', '/api/agent/deploy-verify', presetDeployToken, {
        path: 'cfg_test_mod', root: 'workspace', dryRun: true, deployFormat: 'loose',
      }, { 'x-workspace-id': workspaceId });
      assert.equal(loosePreview.status, 200, JSON.stringify(loosePreview.json));
      assert.equal(loosePreview.json.deployFormat?.mode, 'loose');
      const afterOverrideRead = await mcpConfig!.callTool('get_configuration');
      assert.equal(afterOverrideRead.payload.saved.deployFormat, 'catalog', 'One-shot deploy override must not persist default');

      const defaultPreview = await httpJson(backend1!.baseUrl, 'POST', '/api/agent/deploy-verify', presetDeployToken, {
        path: 'cfg_test_mod', root: 'workspace', dryRun: true,
      }, { 'x-workspace-id': workspaceId });
      assert.equal(defaultPreview.status, 200);
      assert.equal(defaultPreview.json.deployFormat?.mode, 'catalog');

      const flipPrev = await mcpConfig!.callTool('preview_configuration_change', {
        instance: instance1, revision: afterOverrideRead.payload.revision,
        operationId: 'flip-format-loose-0004', patch: { deployFormat: 'loose' },
      });
      const flipApp = await mcpConfig!.callTool('apply_configuration_change', {
        instance: instance1, proposalId: flipPrev.payload.proposalId, operationId: 'flip-format-loose-0004',
      });
      assert.equal(flipApp.isError, false);

      const staleDeployApply = await httpJson(backend1!.baseUrl, 'POST', '/api/agent/deploy-verify', presetDeployToken, {
        path: 'cfg_test_mod',
        root: 'workspace',
        dryRun: false,
        expectedModId: defaultPreview.json.modId,
        expectedSourceHash: defaultPreview.json.sourceHash,
        expectedArtifactHash: defaultPreview.json.artifactHash,
        expectedBindingHash: defaultPreview.json.bindingHash,
        expectedTargetFingerprint: defaultPreview.json.targetFingerprint,
      }, { 'x-workspace-id': workspaceId, 'x-forge-operation-id': 'deploy-stale-after-cfg-01' });
      assert.equal(staleDeployApply.status, 409, JSON.stringify(staleDeployApply.json));
      assert(!fs.existsSync(path.join(game1, 'extensions', 'cfg_test_mod')), 'Refused stale deploy must not write target');
    });

    await check('persisted settings and same-profile grant survive isolated backend restart while this-process grant and pre-restart proposal expire', async () => {
      const preRestartRead = await mcpConfig!.callTool('get_configuration');
      const preRestartProposal = await mcpConfig!.callTool('preview_configuration_change', {
        instance: instance1,
        revision: preRestartRead.payload.revision,
        operationId: 'pre-restart-proposal-0005',
        patch: { deployFormat: 'catalog' },
      });
      assert.equal(preRestartProposal.isError, false);

      await mcpConfig!.close(); mcpConfig = undefined;
      await mcpPreset?.close(); mcpPreset = undefined;
      await mcpStudio?.close(); mcpStudio = undefined;
      await backend1!.stop(); backend1 = undefined;

      backend2 = await startBackend(baseEnv);
      mcpConfig2 = await startMcpSession(backend2.baseUrl, configAgentToken, workspaceId);

      const postRestartRead = await mcpConfig2.callTool('get_configuration');
      assert.equal(postRestartRead.isError, false, JSON.stringify(postRestartRead.payload));
      assert.equal(postRestartRead.payload.instance.profileId, instance1.profileId, 'Physical profileId must survive restart');
      assert.notEqual(postRestartRead.payload.instance.startedAt, instance1.startedAt);
      assert.equal(postRestartRead.payload.saved.deployFormat, 'loose');
      assert.equal(postRestartRead.payload.effective.x4ReferenceRoot, corpus2);
      assert.equal(postRestartRead.payload.effective.filesystemPath, browse2);

      // Process-bound grant fails closed after restart with exact instance mismatch
      const procExpired = await httpJson(backend2.baseUrl, 'GET', '/api/agent/configuration', ephemeralToken, undefined, { 'x-workspace-id': workspaceId });
      assert.equal(procExpired.status, 403);
      assert.equal(procExpired.json.code, 'CONFIGURATION_INSTANCE_MISMATCH');

      // Pre-restart proposal fails closed on the new process instance
      const crossProcessApply = await mcpConfig2.callTool('apply_configuration_change', {
        instance: postRestartRead.payload.instance,
        proposalId: preRestartProposal.payload.proposalId,
        operationId: 'pre-restart-proposal-0005',
      });
      assert.equal(crossProcessApply.isError, true);
      assert.equal(crossProcessApply.payload.code, 'CONFIGURATION_PROPOSAL_MISMATCH');

      // Revoking key immediately blocks further configuration reads
      const revoked = await httpJson(backend2.baseUrl, 'POST', '/api/agent/keys/revoke', studioToken, { id: configAgentKeyId }, clientHeaders);
      assert.equal(revoked.status, 200);
      const afterRevoke = await httpJson(backend2.baseUrl, 'GET', '/api/agent/configuration', configAgentToken, undefined, { 'x-workspace-id': workspaceId });
      assert.equal(afterRevoke.status, 401);
    });

    await check('pinned Dev scratch profile reports DEV_SCRATCH_PATH_LOCKED and refuses retargeting pinned paths', async () => {
      const devRoot = path.join(root, 'dev-scratch-profile');
      const devCfg = path.join(devRoot, 'cfg');
      const devData = path.join(devRoot, 'data');
      const devState = path.join(devRoot, 'state');
      const devCoord = path.join(devRoot, 'coord');
      const devDisc = path.join(devRoot, 'disc');
      const devScratchGame = path.join(devRoot, 'scratch-game');
      const devScratchExt = path.join(devScratchGame, 'extensions');
      const devScratchMods = path.join(devRoot, 'mods');
      for (const d of [devRoot, devCfg, devData, devState, devCoord, devDisc, devScratchGame, devScratchExt, devScratchMods]) {
        fs.mkdirSync(d, { recursive: true });
      }

      scratchBackend = await startBackend({
        STUDIO_API_TOKEN: studioToken,
        X4_FORGE_DEV_SCRATCH_SETTINGS: '1',
        X4_FORGE_MODE: 'dev-build',
        X4_FORGE_DEV_ROOT: devRoot,
        X4_CONFIG_DIR: devCfg,
        X4_DATA_DIR: devData,
        X4_STATE_DIR: devState,
        X4_SOURCE_COORDINATION_DIR: devCoord,
        X4FORGE_DISCOVERY_DIR: devDisc,
      });
      const scratchView = await httpJson(scratchBackend.baseUrl, 'GET', '/api/agent/configuration', studioToken, undefined, clientHeaders);
      assert.equal(scratchView.status, 200, JSON.stringify(scratchView.json));
      assert.equal(scratchView.json.locks.x4GamePath, 'DEV_SCRATCH_PATH_LOCKED');
      assert.equal(scratchView.json.locks.modWorkspacePath, 'DEV_SCRATCH_PATH_LOCKED');
      assert.equal(scratchView.json.locks.filesystemPath, 'DEV_SCRATCH_PATH_LOCKED');
      assert.equal(scratchView.json.mutability.x4GamePath, 'locked');
      assert.equal(scratchView.json.mutability.deployFormat, 'mutable');

      const pinRefusal = await httpJson(scratchBackend.baseUrl, 'POST', '/api/agent/configuration/preview', studioToken, {
        instance: scratchView.json.instance,
        revision: scratchView.json.revision,
        operationId: 'scratch-pin-refusal-01',
        patch: { modWorkspacePath: mods2 },
      }, clientHeaders);
      assert.equal(pinRefusal.status, 409);
      assert.equal(pinRefusal.json.code, 'DEV_SCRATCH_PATH_LOCKED');
    });
  } finally {
    await mcpPreset?.close();
    await mcpStudio?.close();
    await mcpConfig?.close();
    await mcpConfig2?.close();
    await backend1?.stop();
    await backend2?.stop();
    await scratchBackend?.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }

  console.log(JSON.stringify({
    status: checks.every(c => c.pass) ? 'PASS' : 'FAIL',
    passed: checks.filter(c => c.pass).length,
    total: checks.length,
    fixtureRetired: !fs.existsSync(root),
    checks,
  }, null, 2));
  if (checks.some(c => !c.pass)) process.exitCode = 1;
}

void main();
