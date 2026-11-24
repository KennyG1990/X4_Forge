import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
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
    srv.listen(0, () => {
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
  const env: NodeJS.ProcessEnv = { ...process.env, PORT: '0', API_ONLY: 'true', ...envOverrides };
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
  let stdout = '';
  let stderr = '';
  let baseUrl = '';
  child.stdout?.on('data', chunk => {
    stdout += String(chunk);
    const match = stdout.match(/X4 Forge Dev Server running on (http:\/\/127\.0\.0\.1:\d+)/);
    if (match) baseUrl = match[1];
  });
  child.stderr?.on('data', chunk => { stderr += String(chunk); });

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Backend exited early (${child.exitCode}): ${stderr}\n${stdout}`);
    }
    if (baseUrl) {
      try {
        const probe = await fetch(`${baseUrl}/api/agent/schema`);
        if (probe.ok) break;
      } catch { /* wait */ }
    }
    await new Promise(r => setTimeout(r, 100));
  }
  assert(baseUrl, `Backend did not print listener URL: ${stderr}\n${stdout}`);
  const verify = await fetch(`${baseUrl}/api/agent/schema`);
  assert.equal(verify.status, 200, `Backend failed to come up: ${stderr}`);

  return {
    child,
    baseUrl,
    async stop() {
      if (child.exitCode !== null) return;
      const exitPromise = new Promise<void>(resolve => {
        const timer = setTimeout(() => resolve(), 5000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
      });
      if (process.platform === 'win32' && child.pid) {
        spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        child.kill();
      }
      await exitPromise;
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
    clientInfo: { name: 'native-deploy-mcp-selftest', version: '1.0.0' },
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
  const root = fs.mkdtempSync(path.join(parent, 'forge-19p3-deploy-mcp-'));
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
  const gameDir = path.join(root, 'game');
  const extensionsDir = path.join(gameDir, 'extensions');
  const corpusDir = path.join(root, 'corpus');
  const schemaDir = path.join(root, 'schema');
  const modsDir = path.join(root, 'mods');
  const browseDir = path.join(root, 'browse');

  for (const d of [configDir, dataDir, stateDir, coordDir, discoveryDir, extensionsDir, corpusDir, schemaDir, modsDir, browseDir]) {
    fs.mkdirSync(d, { recursive: true });
  }
  fs.writeFileSync(path.join(gameDir, 'X4.exe'), 'fixture');
  const repoHarvested = path.join(REPO_ROOT, 'data', 'harvested-schemas');
  if (fs.existsSync(path.join(repoHarvested, 'md.xsd')) && fs.existsSync(path.join(repoHarvested, 'common.xsd'))) {
    fs.copyFileSync(path.join(repoHarvested, 'md.xsd'), path.join(schemaDir, 'md.xsd'));
    fs.copyFileSync(path.join(repoHarvested, 'common.xsd'), path.join(schemaDir, 'common.xsd'));
  } else {
    fs.writeFileSync(path.join(schemaDir, 'md.xsd'), '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"/>');
    fs.writeFileSync(path.join(schemaDir, 'common.xsd'), '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"/>');
  }

  const modId = 'mcp_deploy_fixture';
  const modDir = path.join(modsDir, modId);
  const writeCleanMod = (version = '100') => {
    fs.mkdirSync(path.join(modDir, 'md'), { recursive: true });
    fs.writeFileSync(
      path.join(modDir, 'content.xml'),
      `<?xml version="1.0" encoding="utf-8"?>\n<content id="${modId}" name="MCP Deploy Fixture" version="${version}" author="ForgeQA" date="2026-11-23" save="0">\n  <text language="44" name="MCP Deploy Fixture" description="Fixture" author="ForgeQA" />\n</content>\n`,
    );
    fs.writeFileSync(
      path.join(modDir, 'md', 'probe.xml'),
      `<?xml version="1.0" encoding="utf-8"?>\n<mdscript name="Mcp_Deploy_Probe" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="md.xsd">\n  <cues>\n    <cue name="Init">\n      <conditions><event_cue_signalled /></conditions>\n      <actions><debug_text text="'ready-${version}'" /></actions>\n    </cue>\n  </cues>\n</mdscript>\n`,
    );
  };
  writeCleanMod('100');

  const foreignModId = 'mcp_deploy_foreign';
  const foreignModDir = path.join(modsDir, foreignModId);
  fs.mkdirSync(path.join(foreignModDir, 'md'), { recursive: true });
  fs.writeFileSync(
    path.join(foreignModDir, 'content.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<content id="${foreignModId}" name="Foreign Mod" version="100" author="ForgeQA" date="2026-11-23" save="0"/>\n`,
  );
  fs.writeFileSync(
    path.join(foreignModDir, 'md', 'foreign.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<mdscript name="Mcp_Foreign"><cues><cue name="Boot"><conditions><event_cue_signalled/></conditions><actions><debug_text text="'foreign'"/></actions></cue></cues></mdscript>\n`,
  );

  const configPath = path.join(configDir, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({
    x4GamePath: gameDir,
    x4ReferenceRoot: corpusDir,
    xsdSchemaPath: schemaDir,
    modWorkspacePath: modsDir,
    filesystemPath: browseDir,
    deployFormat: 'loose',
  }, null, 2));

  const STUDIO_TOKEN = 'studio_deploy_mcp_token_1234567890';
  const baseEnv: Record<string, string> = {
    X4_CONFIG_DIR: configDir,
    X4_DATA_DIR: dataDir,
    X4_STATE_DIR: stateDir,
    X4_SOURCE_COORDINATION_DIR: coordDir,
    X4FORGE_DISCOVERY_DIR: discoveryDir,
    STUDIO_API_TOKEN: STUDIO_TOKEN,
    X4_FORGE_MODE: 'dev-build',
    X4_STUDIO_PROFILE_ID: 'profile_deploy_mcp_alpha',
  };

  let backend: RunningBackend | null = null;
  const mcpSessions: McpSession[] = [];
  const openMcp = async (key: string, workspaceId: string) => {
    const session = await startMcpSession(backend!.baseUrl, key, workspaceId);
    mcpSessions.push(session);
    return session;
  };

  try {
    backend = await startBackend(baseEnv);

    const bindModWorkspace = async (clientId: string, folder: string): Promise<string> => {
      const created = await httpJson(backend!.baseUrl, 'POST', '/api/agent/workspaces', STUDIO_TOKEN, {
        clientId,
        name: folder,
      }, { 'x-client-id': clientId, 'x-forge-operation-id': `create-${folder}` });
      assert.equal(created.status, 201, `baseUrl=${backend!.baseUrl} created=${JSON.stringify(created.json)}`);
      const wsId = String(created.json.workspaceId);
      const imported = await httpJson(backend!.baseUrl, 'POST', '/api/agent/mod-folder/import', STUDIO_TOKEN, {
        path: folder,
        root: 'workspace',
      }, { 'x-workspace-id': wsId, 'x-client-id': clientId });
      assert.equal(imported.status, 200, JSON.stringify(imported.json));
      const saved = await httpJson(backend!.baseUrl, 'POST', '/api/agent/workspace', STUDIO_TOKEN, {
        workspace: imported.json.workspace,
        expectedVersion: created.json.version,
        expectedHead: created.json.workspaceHash,
        expectedSnapshotHash: created.json.snapshotHash,
      }, { 'x-workspace-id': wsId, 'x-client-id': clientId, 'x-forge-operation-id': `bind-${folder}` });
      assert.equal(saved.status, 200, JSON.stringify(saved.json));
      return wsId;
    };

    const client1 = 'client_deploy_mcp_ws1';
    const client2 = 'client_deploy_mcp_ws2';
    const ws1 = await bindModWorkspace(client1, modId);
    const ws2 = await bindModWorkspace(client2, foreignModId);
    const ws1Headers = { 'x-client-id': client1, 'x-workspace-id': ws1 };
    const ws2Headers = { 'x-client-id': client2, 'x-workspace-id': ws2 };

    const deployToolNames = ['preview_native_deploy', 'apply_native_deploy', 'get_deploy_operation_status', 'undo_native_deploy'];
    const allDeployIdentities = ['deploy.apply@1', 'deploy.preview@1', 'deploy.status@1', 'deploy.undo@1'];
    const allDeployEffects = ['read', 'analyze', 'audit-write', 'audit-retention-delete', 'filesystem-write', 'deploy', 'delete'];

    let deployKeyToken = '';
    let deployKeyId = '';
    let deployMcp!: McpSession;

    await check('1_preset_keys_advertise_zero_deploy_mcp_tools_while_legacy_http_remains_intact', async () => {
      for (const scope of ['read', 'write', 'deploy'] as const) {
        const minted = await httpJson(backend!.baseUrl, 'POST', '/api/agent/keys', STUDIO_TOKEN, {
          label: `preset-${scope}`,
          scope,
          ttl: '1h',
        }, ws1Headers);
        assert.equal(minted.status, 200);
        const token = minted.json.token || minted.json.key;
        const session = await openMcp(token, ws1);
        const listed = await session.request('tools/list');
        const names: string[] = (listed.result?.tools || []).map((t: any) => t.name);
        for (const deployTool of deployToolNames) {
          assert(!names.includes(deployTool), `preset ${scope} key unexpectedly advertised ${deployTool}`);
        }
        const deniedCall = await session.callTool('preview_native_deploy', { path: modId });
        assert.equal(deniedCall.isError, true);
        assert.equal(deniedCall.raw.error?.code, -32602);
        if (scope === 'deploy') {
          const directCurated = await httpJson(backend!.baseUrl, 'POST', '/api/agent/deploy-verify/preview', token, {
            path: modId,
          }, { 'x-workspace-id': ws1 });
          assert.equal(directCurated.status, 403);
          assert.equal(directCurated.json?.authorityCode, 'CAPABILITY_NOT_GRANTED');

          const legacyPreview = await httpJson(backend!.baseUrl, 'POST', '/api/agent/deploy-verify', token, {
            path: modId,
            dryRun: true,
          }, { 'x-workspace-id': ws1 });
          assert.equal(legacyPreview.status, 200);
          assert.equal(legacyPreview.json?.ok, true);
          assert.equal(legacyPreview.json?.dryRun, true);
        }
      }
    });

    await check('2_explicit_grants_narrow_preview_only_vs_full_deploy_mcp_tools_and_schemas', async () => {
      const previewOnlyMint = await httpJson(backend!.baseUrl, 'POST', '/api/agent/keys', STUDIO_TOKEN, {
        label: 'preview-status-only',
        scope: 'deploy',
        ttl: '1h',
        authorityMode: 'exact',
        capabilityIdentities: ['deploy.preview@1', 'deploy.status@1'],
        allowedEffects: ['read', 'analyze', 'audit-write', 'audit-retention-delete'],
      }, ws1Headers);
      assert.equal(previewOnlyMint.status, 200);
      const previewOnlyMcp = await openMcp(previewOnlyMint.json.token || previewOnlyMint.json.key, ws1);
      const previewListed = (await previewOnlyMcp.request('tools/list')).result?.tools?.map((t: any) => t.name) || [];
      assert(previewListed.includes('preview_native_deploy'));
      assert(previewListed.includes('get_deploy_operation_status'));
      assert(!previewListed.includes('apply_native_deploy'));
      assert(!previewListed.includes('undo_native_deploy'));

      const fullMint = await httpJson(backend!.baseUrl, 'POST', '/api/agent/keys', STUDIO_TOKEN, {
        label: 'full-curated-deploy',
        scope: 'deploy',
        ttl: '1h',
        authorityMode: 'exact',
        capabilityIdentities: allDeployIdentities,
        allowedEffects: allDeployEffects,
      }, ws1Headers);
      assert.equal(fullMint.status, 200);
      deployKeyToken = fullMint.json.token || fullMint.json.key;
      deployKeyId = fullMint.json.record?.id || fullMint.json.id;
      assert(deployKeyId, 'expected key record id');
      deployMcp = await openMcp(deployKeyToken, ws1);
      const fullListed = (await deployMcp.request('tools/list')).result?.tools?.map((t: any) => t.name) || [];
      for (const name of deployToolNames) {
        assert(fullListed.includes(name), `missing expected MCP tool ${name}`);
      }

      const emptyUndo = await deployMcp.callTool('undo_native_deploy', {});
      assert.equal(emptyUndo.isError, true);
      assert.equal(emptyUndo.raw.error?.code, -32602);
      const ambiguousUndo = await deployMcp.callTool('undo_native_deploy', {
        deployOperationId: 'op-a-12345678',
        recoveryId: 'rec_1234567890ab',
      });
      assert.equal(ambiguousUndo.isError, true);
      assert.equal(ambiguousUndo.raw.error?.code, -32602);
    });

    await check('3_preview_exercises_loose_catalog_and_addressed_workspace_without_writing_or_mutating_config', async () => {
      const configBefore = fs.readFileSync(configPath, 'utf8');
      const loosePreview = await deployMcp.callTool('preview_native_deploy', {
        path: modId,
        root: 'workspace',
        deployFormat: 'loose',
      });
      assert.equal(loosePreview.isError, false);
      assert.equal(loosePreview.payload.ok, true);
      assert.equal(loosePreview.payload.dryRun, true);
      assert.equal(loosePreview.payload.deployFormat?.mode, 'loose');
      assert.equal(loosePreview.payload.targetFingerprint, 'absent');

      const catalogPreview = await deployMcp.callTool('preview_native_deploy', {
        path: modId,
        root: 'workspace',
        deployFormat: 'catalog',
      });
      assert.equal(catalogPreview.isError, false);
      assert.equal(catalogPreview.payload.ok, true);
      assert.equal(catalogPreview.payload.deployFormat?.mode, 'catalog');
      assert.notEqual(catalogPreview.payload.artifactHash, loosePreview.payload.artifactHash);
      assert.notEqual(catalogPreview.payload.bindingHash, loosePreview.payload.bindingHash);

      const addressedPreview = await deployMcp.callTool('preview_native_deploy', {
        useAddressedWorkspace: true,
        deployFormat: 'loose',
      });
      assert.equal(addressedPreview.isError, false);
      assert.equal(addressedPreview.payload.ok, true);
      assert.equal(addressedPreview.payload.modId, modId);

      assert(!fs.existsSync(path.join(extensionsDir, modId)));
      assert.equal(fs.readFileSync(configPath, 'utf8'), configBefore);
    });

    await check('4_apply_refuses_mismatches_and_surfaces_unaccepted_findings_as_isError_before_qualified_apply', async () => {
      const preview = await deployMcp.callTool('preview_native_deploy', {
        path: modId,
        root: 'workspace',
        deployFormat: 'loose',
      });
      assert.equal(preview.isError, false);

      const badHash = await deployMcp.callTool('apply_native_deploy', {
        operationId: 'mcp-bad-hash-01',
        path: modId,
        root: 'workspace',
        deployFormat: 'loose',
        expectedModId: preview.payload.modId,
        expectedSourceHash: preview.payload.sourceHash,
        expectedArtifactHash: '0'.repeat(64),
        expectedBindingHash: preview.payload.bindingHash,
        expectedTargetFingerprint: preview.payload.targetFingerprint,
      });
      assert.equal(badHash.isError, true);
      assert.equal(badHash.payload.code, 'DEPLOY_IDENTITY_MISMATCH');
      assert(!fs.existsSync(path.join(extensionsDir, modId)));

      const badTarget = await deployMcp.callTool('apply_native_deploy', {
        operationId: 'mcp-bad-target-01',
        path: modId,
        root: 'workspace',
        deployFormat: 'loose',
        expectedModId: preview.payload.modId,
        expectedSourceHash: preview.payload.sourceHash,
        expectedArtifactHash: preview.payload.artifactHash,
        expectedBindingHash: preview.payload.bindingHash,
        expectedTargetFingerprint: 'f'.repeat(64),
      });
      assert.equal(badTarget.isError, true);
      assert.equal(badTarget.payload.code, 'DEPLOY_TARGET_CHANGED');
      assert(!fs.existsSync(path.join(extensionsDir, modId)));

      // Introduce a semantic mod error (missing signalled cue) and verify HTTP-200 UNACCEPTED_MOD_FINDINGS is flagged isError:true
      fs.writeFileSync(
        path.join(modDir, 'md', 'probe.xml'),
        `<?xml version="1.0" encoding="utf-8"?>\n<mdscript name="Mcp_Deploy_Probe">\n  <cues>\n    <cue name="Init">\n      <conditions><event_cue_signalled /></conditions>\n      <actions><signal_cue cue="MissingCueTarget" /></actions>\n    </cue>\n  </cues>\n</mdscript>\n`,
      );
      try {
        const errPreview = await deployMcp.callTool('preview_native_deploy', {
          path: modId,
          root: 'workspace',
          deployFormat: 'loose',
        });
        assert.equal(errPreview.isError, true);
        assert.equal(errPreview.payload.ok, false);
        assert.equal(errPreview.payload.code, 'UNACCEPTED_MOD_FINDINGS');
        assert.equal(errPreview.payload.acceptanceRequest?.path, '/api/agent/deploy-verify/apply');
        assert.equal(errPreview.payload.acceptanceRequest?.body?.dryRun, undefined);
        assert(Array.isArray(errPreview.payload.blockingFindings) && errPreview.payload.blockingFindings.length >= 1);

        const acceptedBody = {
          ...errPreview.payload.acceptanceRequest.body,
          operationId: 'mcp-qualified-apply-01',
          acceptances: errPreview.payload.acceptanceRequest.body.acceptances.map((a: any) => ({
            ...a,
            reason: 'Intentional fixture test of explicit finding acceptance through MCP.',
          })),
        };
        const qualifiedApply = await deployMcp.callTool('apply_native_deploy', acceptedBody);
        assert.equal(qualifiedApply.isError, false, JSON.stringify(qualifiedApply.payload));
        assert.equal(qualifiedApply.payload.ok, true);
        assert(['accepted-findings', 'accepted-findings-and-incomplete-checks'].includes(qualifiedApply.payload.validation?.outcome));
        assert.equal(qualifiedApply.payload.acceptanceRecords?.length, errPreview.payload.blockingFindings.length);

        const undoQualified = await deployMcp.callTool('undo_native_deploy', {
          deployOperationId: 'mcp-qualified-apply-01',
        });
        assert.equal(undoQualified.isError, false);
        assert.equal(undoQualified.payload.restoredFingerprint, 'absent');
        assert(!fs.existsSync(path.join(extensionsDir, modId)));
      } finally {
        writeCleanMod('101');
      }
    });

    let looseOpId = 'mcp-clean-loose-01';
    let catOpId = 'mcp-clean-cat-02';
    let catRecoveryId = '';

    await check('5_loose_and_catalog_apply_status_observations_and_one_use_undo_chain', async () => {
      const loosePreview = await deployMcp.callTool('preview_native_deploy', {
        path: modId,
        root: 'workspace',
        deployFormat: 'loose',
      });
      assert.equal(loosePreview.isError, false);
      assert.equal(loosePreview.payload.ok, true);

      const looseApply = await deployMcp.callTool('apply_native_deploy', {
        operationId: looseOpId,
        path: modId,
        root: 'workspace',
        deployFormat: 'loose',
        expectedModId: loosePreview.payload.modId,
        expectedSourceHash: loosePreview.payload.sourceHash,
        expectedArtifactHash: loosePreview.payload.artifactHash,
        expectedBindingHash: loosePreview.payload.bindingHash,
        expectedTargetFingerprint: loosePreview.payload.targetFingerprint,
      });
      assert.equal(looseApply.isError, false, JSON.stringify(looseApply.payload));
      assert.equal(looseApply.payload.ok, true);
      assert.equal(looseApply.payload.bytesConfirmed, true);
      assert.equal(looseApply.payload.deployFormat?.mode, 'loose');
      assert(fs.existsSync(path.join(extensionsDir, modId, 'md', 'probe.xml')));

      // Duplicate replay of same operationId refuses before writing
      const replayLoose = await deployMcp.callTool('apply_native_deploy', {
        operationId: looseOpId,
        path: modId,
        root: 'workspace',
        deployFormat: 'loose',
        expectedModId: loosePreview.payload.modId,
        expectedSourceHash: loosePreview.payload.sourceHash,
        expectedArtifactHash: loosePreview.payload.artifactHash,
        expectedBindingHash: loosePreview.payload.bindingHash,
        expectedTargetFingerprint: loosePreview.payload.targetFingerprint,
      });
      assert.equal(replayLoose.isError, true);
      assert.equal(replayLoose.payload.code, 'DEPLOY_OPERATION_ALREADY_RECORDED');

      const looseStatus = await deployMcp.callTool('get_deploy_operation_status', {
        deployOperationId: looseOpId,
        inspectDeployTarget: 'managed',
        inspectDeployEffect: '1',
      });
      assert.equal(looseStatus.isError, false);
      assert.equal(looseStatus.payload.outcome, 'committed');
      assert.equal(looseStatus.payload.managedObservation?.state, 'matches-committed');
      assert.equal(looseStatus.payload.effectReport?.status, 'available');

      // Deploy CAT/DAT catalog over the existing loose target
      writeCleanMod('102');
      const catPreview = await deployMcp.callTool('preview_native_deploy', {
        path: modId,
        root: 'workspace',
        deployFormat: 'catalog',
        inspectDeployOperationId: looseOpId,
      });
      assert.equal(catPreview.isError, false);
      assert.equal(catPreview.payload.ok, true);
      assert.equal(catPreview.payload.deployFormat?.mode, 'catalog');
      assert.equal(catPreview.payload.previousOperation?.historicalOutcome, 'committed');

      const catApply = await deployMcp.callTool('apply_native_deploy', {
        operationId: catOpId,
        path: modId,
        root: 'workspace',
        deployFormat: 'catalog',
        expectedModId: catPreview.payload.modId,
        expectedSourceHash: catPreview.payload.sourceHash,
        expectedArtifactHash: catPreview.payload.artifactHash,
        expectedBindingHash: catPreview.payload.bindingHash,
        expectedTargetFingerprint: catPreview.payload.targetFingerprint,
      });
      assert.equal(catApply.isError, false, JSON.stringify(catApply.payload));
      assert.equal(catApply.payload.ok, true);
      assert.equal(catApply.payload.deployFormat?.mode, 'catalog');
      catRecoveryId = catApply.payload.recovery?.id;
      assert(typeof catRecoveryId === 'string' && catRecoveryId.length > 0);
      assert(fs.existsSync(path.join(extensionsDir, modId, 'ext_01.cat')));
      assert(!fs.existsSync(path.join(extensionsDir, modId, 'md', 'probe.xml')));

      // Undo catalog deploy via recoveryId -> restores exact v101 loose tree
      const undoCat = await deployMcp.callTool('undo_native_deploy', {
        recoveryId: catRecoveryId,
      });
      assert.equal(undoCat.isError, false, JSON.stringify(undoCat.payload));
      assert.equal(undoCat.payload.ok, true);
      assert.equal(undoCat.payload.priorExisted, true);
      assert(fs.existsSync(path.join(extensionsDir, modId, 'md', 'probe.xml')));
      assert(!fs.existsSync(path.join(extensionsDir, modId, 'ext_01.cat')));

      // Replaying consumed recoveryId fails with RECOVERY_ALREADY_USED
      const undoCatAgain = await deployMcp.callTool('undo_native_deploy', {
        recoveryId: catRecoveryId,
      });
      assert.equal(undoCatAgain.isError, true);
      assert.equal(undoCatAgain.payload.code, 'RECOVERY_ALREADY_USED');
    });

    await check('6_cross_workspace_isolation_and_revocation_fail_closed', async () => {
      const foreignMint = await httpJson(backend!.baseUrl, 'POST', '/api/agent/keys', STUDIO_TOKEN, {
        label: 'foreign-curated-deploy',
        scope: 'deploy',
        ttl: '1h',
        authorityMode: 'exact',
        capabilityIdentities: allDeployIdentities,
        allowedEffects: allDeployEffects,
      }, ws2Headers);
      assert.equal(foreignMint.status, 200);
      const foreignMcp = await openMcp(foreignMint.json.token || foreignMint.json.key, ws2);

      // Foreign workspace cannot inspect or undo ws1's loose deployment
      const foreignStatus = await foreignMcp.callTool('get_deploy_operation_status', {
        deployOperationId: looseOpId,
      });
      assert.equal(foreignStatus.isError, true);
      assert.equal(foreignStatus.payload.code, 'DEPLOY_OPERATION_NOT_FOUND');

      const looseStatus = await deployMcp.callTool('get_deploy_operation_status', {
        deployOperationId: looseOpId,
      });
      const looseRecoveryId = looseStatus.payload.receipt?.rollback?.reference;
      assert(typeof looseRecoveryId === 'string');

      const foreignUndoByOp = await foreignMcp.callTool('undo_native_deploy', {
        deployOperationId: looseOpId,
      });
      assert.equal(foreignUndoByOp.isError, true);
      assert.equal(foreignUndoByOp.payload.code, 'DEPLOY_OPERATION_NOT_FOUND');

      const foreignUndoByRec = await foreignMcp.callTool('undo_native_deploy', {
        recoveryId: looseRecoveryId,
      });
      assert.equal(foreignUndoByRec.isError, true);
      assert.equal(foreignUndoByRec.payload.code, 'RECOVERY_NOT_FOUND');
      assert(fs.existsSync(path.join(extensionsDir, modId, 'md', 'probe.xml')));

      // Undo ws1's loose deployment cleanly with its owner before revoking key
      const ownerUndoLoose = await deployMcp.callTool('undo_native_deploy', {
        deployOperationId: looseOpId,
      });
      assert.equal(ownerUndoLoose.isError, false);
      assert.equal(ownerUndoLoose.payload.restoredFingerprint, 'absent');
      assert(!fs.existsSync(path.join(extensionsDir, modId)));

      // Revoke ws1 deploy key -> status and apply fail closed immediately via durableKeyRoute
      const revoked = await httpJson(backend!.baseUrl, 'POST', '/api/agent/keys/revoke', STUDIO_TOKEN, {
        id: deployKeyId,
      });
      assert.equal(revoked.status, 200);

      const postRevokeStatus = await deployMcp.callTool('get_deploy_operation_status', {
        deployOperationId: looseOpId,
      });
      assert.equal(postRevokeStatus.isError, true);
      assert.equal(postRevokeStatus.raw?.error?.code, -32602);

      const postRevokeHttp = await httpJson(
        backend!.baseUrl,
        'GET',
        `/api/agent/deploy-verify/status?deployOperationId=${looseOpId}`,
        deployKeyToken,
        undefined,
        { 'x-workspace-id': ws1 },
      );
      assert.equal(postRevokeHttp.status, 401);
      assert(String(postRevokeHttp.json?.error || '').toLowerCase().includes('revoked'));
    });
  } finally {
    for (const s of mcpSessions) await s.close();
    if (backend) await backend.stop();
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        fs.rmSync(root, { recursive: true, force: true });
        break;
      } catch (err: any) {
        if (attempt === 19 || !['EPERM', 'EBUSY', 'ENOTEMPTY'].includes(String(err?.code || ''))) throw err;
        await new Promise(r => setTimeout(r, 150));
      }
    }
  }

  for (const item of checks) {
    console.log(`${item.pass ? 'PASS' : 'FAIL'} ${item.name}${item.error ? `\n${item.error}` : ''}`);
  }
  const failed = checks.filter(item => !item.pass);
  console.log(`[native-deploy-mcp selftest] ${checks.length - failed.length}/${checks.length} passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
