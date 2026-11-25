import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  MCP_MANUAL_KEY_PLACEHOLDER,
  MCP_PROVIDER_ID,
  assertNonSecretMetadata,
  buildManualMcpConfigFallback,
  computeIdeWorkspaceSignature,
  containsMcpSecretMaterial,
  createMcpRegistrationLifecycle,
  detectHostMcpProviderApi,
  type McpRegistrationMetadataV1,
  type OwnedSidecarSnapshot,
} from '../vscode-extension/src/mcpRegistrationLifecycle';
import {
  detectIdeCapabilities,
  formatIdeCapabilityReport,
} from '../vscode-extension/src/capabilities';
import { FORGE_CAPABILITIES, type ForgeCapabilityDescriptorV1 } from '../src/lib/forgeCapabilities';
import { requiresExplicitCapabilityGrant } from '../src/lib/agentCapabilityAuthority';

function expectedPresetMcpTools(scope: 'read' | 'write'): string[] {
  return (FORGE_CAPABILITIES as readonly ForgeCapabilityDescriptorV1[])
    .filter(cap => !requiresExplicitCapabilityGrant(cap.id) && (cap.access.public || cap.access.agentScopes.includes(scope)))
    .flatMap(cap => cap.surfaces.mcp.filter(m => m.status !== 'disconnected').map(m => m.id))
    .sort();
}

const REPO_ROOT = process.cwd();
const MCP_SHIM_PATH = path.join(REPO_ROOT, 'vscode-extension', 'mcp', 'x4forge-mcp.cjs');

interface RunningBackend {
  child: ChildProcess;
  baseUrl: string;
  stop(): Promise<void>;
}

async function startBackend(envOverrides: Record<string, string>): Promise<RunningBackend> {
  const env: NodeJS.ProcessEnv = { ...process.env, PORT: '0', API_ONLY: 'true', ...envOverrides };
  delete env.X4_XSD_PATH;
  delete env.X4_REFERENCE_ROOT;

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

interface McpSession {
  request(method: string, params?: unknown): Promise<any>;
  callTool(name: string, args?: Record<string, unknown>): Promise<{ isError: boolean; payload: any; raw: any }>;
  close(): Promise<void>;
}

async function startMcpFromDefinition(envVars: Record<string, string>): Promise<McpSession> {
  const child = spawn(process.execPath, [MCP_SHIM_PATH], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ...envVars,
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
    clientInfo: { name: 'mcp-registration-lifecycle-selftest', version: '1.0.0' },
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
  const root = fs.mkdtempSync(path.join(parent, 'forge-31-mcp-lifecycle-'));
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
  const ideFolderA = path.join(root, 'ide-workspace-a');
  const ideFolderB = path.join(root, 'ide-workspace-b');
  const vscodeCfgDir = path.join(ideFolderA, '.vscode');

  for (const d of [configDir, dataDir, stateDir, coordDir, discoveryDir, ideFolderA, ideFolderB, vscodeCfgDir]) {
    fs.mkdirSync(d, { recursive: true });
  }

  // External MCP config files on disk — must remain 100% byte-unchanged across every lifecycle transition.
  const dotMcpPath = path.join(ideFolderA, '.mcp.json');
  const vscodeMcpPath = path.join(vscodeCfgDir, 'mcp.json');
  const originalDotMcp = JSON.stringify({
    mcpServers: {
      unrelatedTool: { command: 'npx', args: ['unrelated-mcp'], env: { KEEP: '1' } },
    },
  }, null, 2) + '\n';
  const originalVscodeMcp = JSON.stringify({
    servers: {
      customServer: { type: 'stdio', command: 'python', args: ['tool.py'] },
    },
  }, null, 2) + '\n';
  fs.writeFileSync(dotMcpPath, originalDotMcp, 'utf8');
  fs.writeFileSync(vscodeMcpPath, originalVscodeMcp, 'utf8');

  const STUDIO_TOKEN = 'studio_31_mcp_lifecycle_session_token';
  const observedSecrets = new Set<string>([STUDIO_TOKEN]);
  const nonSecretArtifacts: string[] = [];
  const logs: string[] = [];

  let persistedMetadata: unknown = undefined;
  const metadataSnapshots: string[] = [];
  let secretSlot: string | undefined = undefined;
  let failSecretRead = false;
  let failSecretWrite = false;
  let failSecretDelete = false;

  const metadataStore = {
    readMetadata: () => persistedMetadata,
    writeMetadata: async (next: McpRegistrationMetadataV1) => {
      const cloned = structuredClone(next);
      persistedMetadata = cloned;
      const serialized = JSON.stringify(cloned);
      metadataSnapshots.push(serialized);
      nonSecretArtifacts.push(serialized);
    },
  };

  const secretVault = {
    readSecret: async () => {
      if (failSecretRead) throw new Error(`Keychain read error for Bearer ${STUDIO_TOKEN}`);
      return secretSlot;
    },
    saveSecret: async (token: string) => {
      observedSecrets.add(token);
      if (failSecretWrite) throw new Error(`Keychain write error for ${token}`);
      secretSlot = token;
    },
    removeSecret: async () => {
      if (failSecretDelete) throw new Error('Keychain delete locked');
      secretSlot = undefined;
    },
  };

  let backend: RunningBackend | null = null;
  let activeIdeFolders = [ideFolderA];
  let sidecarEnsureCalls = 0;
  let sidecarOffline = false;
  let sidecarOwned = true;
  let currentBoundWs = '';
  let interceptSchemaBody: unknown | undefined = undefined;
  let interceptEffectiveBody: unknown | undefined = undefined;
  let changeEvents = 0;

  const makeSidecarBroker = () => ({
    peekSidecar: (): OwnedSidecarSnapshot | null => {
      if (!backend || sidecarOffline) return null;
      return {
        owned: sidecarOwned,
        baseUrl: backend.baseUrl,
        sessionToken: sidecarOwned ? STUDIO_TOKEN : undefined,
        workspaceId: currentBoundWs,
        clientId: 'client_ext_31_alpha',
      };
    },
    ensureSidecar: async (): Promise<OwnedSidecarSnapshot> => {
      sidecarEnsureCalls += 1;
      if (!backend || sidecarOffline) {
        throw new Error('Managed sidecar is offline');
      }
      return {
        owned: sidecarOwned,
        baseUrl: backend.baseUrl,
        sessionToken: sidecarOwned ? STUDIO_TOKEN : undefined,
        workspaceId: currentBoundWs,
        clientId: 'client_ext_31_alpha',
      };
    },
    fetchJson: async (url: string, init?: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string }) => {
      if (sidecarOffline) throw new Error('ECONNREFUSED 127.0.0.1');
      if (interceptSchemaBody !== undefined && url.endsWith('/api/agent/schema')) {
        return { ok: true, status: 200, body: interceptSchemaBody };
      }
      if (interceptEffectiveBody !== undefined && url.endsWith('/api/agent/capabilities/effective')) {
        return { ok: true, status: 200, body: interceptEffectiveBody };
      }
      const res = await fetch(url, {
        method: init?.method || 'GET',
        headers: init?.headers,
        body: init?.body,
        redirect: 'error',
      });
      let body: any = null;
      try { body = await res.json(); } catch { /* non-json */ }
      if (typeof body?.token === 'string') observedSecrets.add(body.token);
      return { ok: res.ok, status: res.status, body };
    },
    createOperationId: () => `op_31_${crypto.randomBytes(8).toString('hex')}`,
  });

  const buildLifecycle = (hostSupported = true) =>
    createMcpRegistrationLifecycle({
      hostSupported,
      shimPath: MCP_SHIM_PATH,
      extensionVersion: '0.0.93',
      getNodeCommand: () => process.execPath,
      getIdeWorkspaceSignature: () => computeIdeWorkspaceSignature(activeIdeFolders),
      metadataStore,
      secretVault,
      sidecar: makeSidecarBroker(),
      log: line => {
        logs.push(line);
        nonSecretArtifacts.push(line);
      },
      onDidChangeDefinitions: () => { changeEvents += 1; },
    });

  try {
    backend = await startBackend({
      X4_CONFIG_DIR: configDir,
      X4_DATA_DIR: dataDir,
      X4_STATE_DIR: stateDir,
      X4_SOURCE_COORDINATION_DIR: coordDir,
      X4FORGE_DISCOVERY_DIR: discoveryDir,
      STUDIO_API_TOKEN: STUDIO_TOKEN,
      X4_FORGE_MODE: 'dev-build',
    });

    const wsRes1 = await httpJson(backend.baseUrl, 'POST', '/api/agent/workspaces', STUDIO_TOKEN, {
      clientId: 'client_ext_31_alpha',
      name: 'Mod_Alpha',
    }, { 'x-client-id': 'client_ext_31_alpha', 'x-forge-operation-id': 'create-ws-alpha' });
    assert.equal(wsRes1.status, 201);
    const ws1 = String(wsRes1.json.workspaceId);

    const wsRes2 = await httpJson(backend.baseUrl, 'POST', '/api/agent/workspaces', STUDIO_TOKEN, {
      clientId: 'client_ext_31_alpha',
      name: 'Mod_Beta',
    }, { 'x-client-id': 'client_ext_31_alpha', 'x-forge-operation-id': 'create-ws-beta' });
    assert.equal(wsRes2.status, 201);
    const ws2 = String(wsRes2.json.workspaceId);
    currentBoundWs = ws1;

    await check('1_host_detection_default_disabled_and_unsupported_host_manual_fallback_preserve_unrelated_configs', async () => {
      assert.equal(detectHostMcpProviderApi({}).supported, false);
      assert.equal(detectHostMcpProviderApi({ lm: {} }).supported, false);
      let registeredId = '';
      class MockStdioDef {
        constructor(
          public label: string,
          public command: string,
          public args?: string[],
          public env?: Record<string, string | number | null>,
          public version?: string,
        ) {}
      }
      const detected = detectHostMcpProviderApi({
        lm: {
          registerMcpServerDefinitionProvider(id: string) {
            registeredId = id;
            return { dispose() {} };
          },
        },
        McpStdioServerDefinition: MockStdioDef,
      });
      assert.equal(detected.supported, true);
      detected.registerProvider!(MCP_PROVIDER_ID, { provideMcpServerDefinitions: () => [] });
      assert.equal(registeredId, 'x4forge.mcp');

      // Unsupported host refuses native enablement and provides secret-free manual fallback
      const unsupported = buildLifecycle(false);
      assert.equal(unsupported.getStatus().state, 'disabled');
      assert.deepEqual(unsupported.provideDefinitions(), []);
      const refusedEnable = await unsupported.enable({ scope: 'write', ttl: '7d' });
      nonSecretArtifacts.push(refusedEnable.message, refusedEnable.manualFallbackJson || '');
      assert.equal(refusedEnable.ok, false);
      assert.equal(refusedEnable.code, 'UNSUPPORTED_HOST_API');
      assert.equal(unsupported.getStatus().state, 'disabled');
      assert(refusedEnable.manualFallbackJson?.includes(MCP_MANUAL_KEY_PLACEHOLDER));

      const refusedResolve = await unsupported.resolveDefinition();
      nonSecretArtifacts.push(refusedResolve.message);
      assert.equal(refusedResolve.ok, false);
      assert.equal(refusedResolve.code, 'UNSUPPORTED_HOST_API');

      // Merging into existing JSON preserves unrelated mcpServers entries without mutating disk
      const merged = buildManualMcpConfigFallback({
        shimPath: MCP_SHIM_PATH,
        baseUrl: backend!.baseUrl,
        workspaceId: ws1,
        existingConfigJson: originalDotMcp,
      });
      nonSecretArtifacts.push(merged);
      const parsedMerged = JSON.parse(merged);
      assert.deepEqual(parsedMerged.mcpServers.unrelatedTool, {
        command: 'npx',
        args: ['unrelated-mcp'],
        env: { KEEP: '1' },
      });
      assert.equal(parsedMerged.mcpServers.x4forge.env.X4FORGE_KEY, MCP_MANUAL_KEY_PLACEHOLDER);
      assert.equal(parsedMerged.mcpServers.x4forge.env.X4FORGE_WORKSPACE_ID, ws1);

      // Metadata secret tripwire rejects secret-bearing metadata
      assert.throws(() => assertNonSecretMetadata({
        schemaVersion: 1,
        state: 'enabled',
        scope: 'write',
        ttl: '7d',
        boundWorkspaceId: ws1,
        ideWorkspaceSignature: 'ide_ws_1234',
        keyId: `x4fk_${'a'.repeat(64)}` as any,
        hashPrefix: '12345678',
        lastErrorCode: null,
        updatedAt: Date.now(),
      }));
    });

    await check('2_lazy_opt_in_secrets_only_live_mcp_list_call_parity_and_restart_survival', async () => {
      sidecarEnsureCalls = 0;
      sidecarOffline = true; // Sidecar is NOT even running when user opts in!
      const lifecycle = buildLifecycle(true);
      assert.equal(lifecycle.getStatus().state, 'disabled');
      assert.deepEqual(lifecycle.provideDefinitions(), []);

      const enabled = await lifecycle.enable({ scope: 'write', ttl: '7d' });
      nonSecretArtifacts.push(enabled.message);
      assert.equal(enabled.ok, true);
      assert.equal(enabled.state, 'enabled');
      assert.equal(sidecarEnsureCalls, 0, 'Opting in must not eagerly start the sidecar');
      assert.equal(secretSlot, undefined, 'Opting in must not eagerly mint a key');

      // Eager provideDefinitions returns a secret-free stub without starting the sidecar
      const provided = lifecycle.provideDefinitions();
      assert.equal(provided.length, 1);
      assert.deepEqual(provided[0].env, {}, 'provideDefinitions must never embed secrets');
      assert.equal(sidecarEnsureCalls, 0, 'provideDefinitions must remain non-interactive and lazy');

      // Bring sidecar online and lazily resolve when MCP host connects
      sidecarOffline = false;
      const resolved = await lifecycle.resolveDefinition();
      nonSecretArtifacts.push(resolved.message);
      assert.equal(resolved.ok, true, resolved.message);
      assert.equal(sidecarEnsureCalls, 1);
      assert(resolved.definition);
      assert(secretSlot && /^x4fk_[0-9a-f]{64}$/i.test(secretSlot));
      assert.equal(resolved.definition.env.X4FORGE_KEY, secretSlot);
      assert.equal(resolved.definition.env.X4FORGE_WORKSPACE_ID, ws1);

      const firstKeyId = lifecycle.getStatus().keyId;
      assert(firstKeyId && firstKeyId.startsWith('key_'));

      // Boot real bundled x4forge-mcp.cjs using resolved definition env and verify list/call parity & narrowing
      const expectedWriteTools = expectedPresetMcpTools('write');
      const mcp = await startMcpFromDefinition(resolved.definition.env);
      try {
        const listed = await mcp.request('tools/list');
        const names: string[] = (listed.result?.tools || []).map((t: any) => t.name);
        assert.deepEqual([...names].sort(), expectedWriteTools, `write-preset MCP tools must match effective capabilities (${expectedWriteTools.length})`);
        assert(names.includes('get_workspace'));
        assert(names.includes('compile_workspace'));
        assert(!names.includes('preview_native_deploy'), 'native MCP write preset must never grant deploy tools');
        assert(!names.includes('apply_native_deploy'));

        const wsCall = await mcp.callTool('get_workspace');
        assert.equal(wsCall.isError, false);
        assert.equal(wsCall.payload.name, 'Mod_Alpha');
        assert.equal(typeof wsCall.payload.snapshotHash, 'string');

        const domainCall = await mcp.callTool('get_workspace_domain', { domain: 'md_graph' });
        assert.equal(domainCall.isError, false);
        assert.equal(domainCall.payload.workspaceId, ws1);

        const deniedDeploy = await mcp.callTool('preview_native_deploy', { path: 'x' });
        assert.equal(deniedDeploy.isError, true);
        assert.equal(deniedDeploy.raw.error?.code, -32602);
      } finally {
        await mcp.close();
      }

      // Simulate extension host restart in the same IDE workspace: rehydrates lazily and reuses exact key without widening authority
      const ensuresBeforeRestart = sidecarEnsureCalls;
      const restarted = buildLifecycle(true);
      const stateAfterRestart = await restarted.rehydrateOnActivate();
      assert.equal(stateAfterRestart, 'enabled');
      assert.equal(sidecarEnsureCalls, ensuresBeforeRestart, 'rehydrateOnActivate must not start sidecar');
      assert.equal(restarted.getStatus().scope, 'write');
      assert.equal(restarted.getStatus().keyId, firstKeyId);

      const resolvedAfterRestart = await restarted.resolveDefinition();
      assert.equal(resolvedAfterRestart.ok, true);
      assert.equal(restarted.getStatus().keyId, firstKeyId, 'Restart must reuse valid workspace-bound key instead of minting duplicates');
      assert.equal(resolvedAfterRestart.definition?.env.X4FORGE_KEY, secretSlot);
    });

    await check('3_workspace_authority_change_invalidates_and_revokes_key_across_studio_and_ide_switches', async () => {
      const lifecycle = buildLifecycle(true);
      await lifecycle.rehydrateOnActivate();
      const ws1KeyId = lifecycle.getStatus().keyId!;
      const ws1Token = secretSlot!;
      assert(ws1KeyId && ws1Token);

      // 3a: Studio switches bound workspaceId (ws1 -> ws2)
      currentBoundWs = ws2;
      const switchRes = await lifecycle.handleWorkspaceAuthorityChange(ws2);
      nonSecretArtifacts.push(switchRes?.message || '');
      assert(switchRes);
      assert.equal(switchRes.code, 'WORKSPACE_AUTHORITY_CHANGED');
      assert.equal(lifecycle.getStatus().state, 'disabled');
      assert.equal(secretSlot, undefined);
      assert.deepEqual(lifecycle.provideDefinitions(), []);

      // Old token is immediately 401 revoked on backend
      const postSwitchHttp = await httpJson(backend!.baseUrl, 'GET', '/api/agent/workspace', ws1Token, undefined, {
        'x-workspace-id': ws1,
      });
      assert.equal(postSwitchHttp.status, 401);

      // 3b: Re-enable on ws2 (read scope), resolve, then switch IDE workspace folders across restart
      const enableWs2 = await lifecycle.enable({ scope: 'read', ttl: '24h' });
      assert.equal(enableWs2.ok, true);
      const resolvedWs2 = await lifecycle.resolveDefinition();
      assert.equal(resolvedWs2.ok, true);
      const ws2KeyId = lifecycle.getStatus().keyId!;
      const ws2Token = secretSlot!;
      assert(ws2KeyId && ws2KeyId !== ws1KeyId);

      // Verify read-scope narrowing (exact read effective tools, compile_workspace excluded)
      const expectedReadTools = expectedPresetMcpTools('read');
      const readMcp = await startMcpFromDefinition(resolvedWs2.definition!.env);
      try {
        const readNames: string[] = ((await readMcp.request('tools/list')).result?.tools || []).map((t: any) => t.name);
        assert.deepEqual([...readNames].sort(), expectedReadTools, `read-preset MCP tools must match effective capabilities (${expectedReadTools.length})`);
        assert(!readNames.includes('compile_workspace'));
      } finally {
        await readMcp.close();
      }

      // Switch IDE folder from ideFolderA -> ideFolderB and restart
      activeIdeFolders = [ideFolderB];
      const restartedInDifferentIdeFolder = buildLifecycle(true);
      const switchedState = await restartedInDifferentIdeFolder.rehydrateOnActivate();
      assert.equal(switchedState, 'disabled');
      assert.equal(restartedInDifferentIdeFolder.getStatus().lastErrorCode, 'WORKSPACE_AUTHORITY_CHANGED');
      assert.equal(secretSlot, undefined);

      const postIdeSwitchHttp = await httpJson(backend!.baseUrl, 'GET', '/api/agent/workspace', ws2Token, undefined, {
        'x-workspace-id': ws2,
      });
      assert.equal(postIdeSwitchHttp.status, 401);
      activeIdeFolders = [ideFolderA];
      currentBoundWs = ws1;
    });

    await check('4_all_refusal_paths_and_revocation_pending_recovery_hold_under_fault_injection', async () => {
      const lifecycle = buildLifecycle(true);
      await lifecycle.enable({ scope: 'write', ttl: '7d' });

      // 4a: Unavailable sidecar & unowned attached backend refusals
      sidecarOffline = true;
      const offlineResolve = await lifecycle.resolveDefinition();
      nonSecretArtifacts.push(offlineResolve.message);
      assert.equal(offlineResolve.ok, false);
      assert.equal(offlineResolve.code, 'SIDECAR_UNAVAILABLE');
      sidecarOffline = false;

      sidecarOwned = false;
      const attachedResolve = await lifecycle.resolveDefinition();
      nonSecretArtifacts.push(attachedResolve.message);
      assert.equal(attachedResolve.ok, false);
      assert.equal(attachedResolve.code, 'SIDECAR_UNAVAILABLE');
      sidecarOwned = true;

      // 4b: Malformed capability contract on /api/agent/schema refuses before key mint
      interceptSchemaBody = { api_version: '2026-07-30.agent.v4', capability_contract: { schemaVersion: 'broken' } };
      const badSchemaResolve = await lifecycle.resolveDefinition();
      nonSecretArtifacts.push(badSchemaResolve.message);
      assert.equal(badSchemaResolve.ok, false);
      assert.equal(badSchemaResolve.code, 'MALFORMED_CAPABILITY_CONTRACT');
      assert.equal(lifecycle.getStatus().keyId, null, 'Malformed schema must prevent key minting');
      interceptSchemaBody = undefined;

      // 4c: Secret-store write failure during lazy mint immediately revokes newly minted key on server
      const keysBeforeVaultFail = (await httpJson(backend!.baseUrl, 'GET', '/api/agent/keys', STUDIO_TOKEN)).json.keys.length;
      failSecretWrite = true;
      const vaultWriteFail = await lifecycle.resolveDefinition();
      failSecretWrite = false;
      nonSecretArtifacts.push(vaultWriteFail.message);
      assert.equal(vaultWriteFail.ok, false);
      assert.equal(vaultWriteFail.code, 'SECRET_STORE_FAILURE');
      assert.equal(secretSlot, undefined);
      const keysAfterVaultFail = (await httpJson(backend!.baseUrl, 'GET', '/api/agent/keys', STUDIO_TOKEN)).json.keys as any[];
      assert.equal(keysAfterVaultFail.length, keysBeforeVaultFail + 1);
      assert(keysAfterVaultFail.at(-1)?.revokedAt !== null, 'Minted key must be immediately revoked when context.secrets.store fails');

      // 4d: Mint cleanly, then test secret-store read failure + malformed effective contract
      const cleanResolve = await lifecycle.resolveDefinition();
      assert.equal(cleanResolve.ok, true);
      const activeKeyId = lifecycle.getStatus().keyId!;

      failSecretRead = true;
      const vaultReadFail = await lifecycle.resolveDefinition();
      failSecretRead = false;
      nonSecretArtifacts.push(vaultReadFail.message);
      assert.equal(vaultReadFail.ok, false);
      assert.equal(vaultReadFail.code, 'SECRET_STORE_FAILURE');

      interceptEffectiveBody = { api_version: '2026-08-01.agent-effective.v1', authority_schema_version: 'broken' };
      const badEffective = await lifecycle.resolveDefinition();
      interceptEffectiveBody = undefined;
      nonSecretArtifacts.push(badEffective.message);
      assert.equal(badEffective.ok, false);
      assert.equal(badEffective.code, 'MALFORMED_CAPABILITY_CONTRACT');

      // 4e: Server-revoked key refuses with KEY_INVALID_OR_REVOKED and clears enabled state
      const extRevoke = await httpJson(backend!.baseUrl, 'POST', '/api/agent/keys/revoke', STUDIO_TOKEN, { id: activeKeyId });
      assert.equal(extRevoke.status, 200);
      const revokedKeyResolve = await lifecycle.resolveDefinition();
      nonSecretArtifacts.push(revokedKeyResolve.message);
      assert.equal(revokedKeyResolve.ok, false);
      assert.equal(revokedKeyResolve.code, 'KEY_INVALID_OR_REVOKED');
      assert.equal(lifecycle.getStatus().state, 'disabled');
      assert.equal(secretSlot, undefined);

      // 4f: Tampered/mismatched token in secretVault refuses with KEY_INVALID_OR_REVOKED and revokes server key
      await lifecycle.enable({ scope: 'write', ttl: '7d' });
      assert.equal((await lifecycle.resolveDefinition()).ok, true);
      const mismatchKeyId = lifecycle.getStatus().keyId!;
      const fakeToken = `x4fk_${'f'.repeat(64)}`;
      observedSecrets.add(fakeToken);
      secretSlot = fakeToken;
      const mismatchResolve = await lifecycle.resolveDefinition();
      nonSecretArtifacts.push(mismatchResolve.message);
      assert.equal(mismatchResolve.ok, false);
      assert.equal(mismatchResolve.code, 'KEY_INVALID_OR_REVOKED');
      assert.equal(lifecycle.getStatus().state, 'disabled');
      const keysAfterMismatch = (await httpJson(backend!.baseUrl, 'GET', '/api/agent/keys', STUDIO_TOKEN)).json.keys as any[];
      assert(keysAfterMismatch.find(k => k.id === mismatchKeyId)?.revokedAt !== null);

      // 4g: Failed revoke / offline sidecar transitions to truthful revocation-pending, blocks new enable, and recovers on retry
      await lifecycle.enable({ scope: 'write', ttl: '7d' });
      assert.equal((await lifecycle.resolveDefinition()).ok, true);
      const pendingKeyId = lifecycle.getStatus().keyId!;
      const pendingToken = secretSlot!;

      sidecarOffline = true;
      const partialDisable = await lifecycle.disable();
      nonSecretArtifacts.push(partialDisable.message);
      assert.equal(partialDisable.ok, false);
      assert.equal(partialDisable.code, 'REVOKE_FAILED');
      assert.equal(partialDisable.state, 'revocation-pending');
      assert.equal(lifecycle.getStatus().state, 'revocation-pending');
      assert.equal(lifecycle.getStatus().keyId, pendingKeyId);
      assert.equal(secretSlot, undefined, 'Local secret is wiped even when server revocation is pending');
      assert.deepEqual(lifecycle.provideDefinitions(), [], 'revocation-pending must advertise zero MCP servers');

      // Capability report surfaces truthful revocation-pending state without secrets
      const capReport = detectIdeCapabilities({
        installedExtensionIds: [],
        xmlAssociationsEnabled: false,
        backendState: 'stopped',
        mcpRegistration: lifecycle.getStatus(),
      });
      const formattedCap = formatIdeCapabilityReport(capReport).join('\n');
      nonSecretArtifacts.push(formattedCap);
      assert.equal(capReport.mcpRegistration.state, 'revocation-pending');
      assert(formattedCap.includes('revocation-pending'));

      // Trying to enable while sidecar is still offline refuses to orphan the pending key
      const blockedReenable = await lifecycle.enable({ scope: 'read', ttl: '1h' });
      nonSecretArtifacts.push(blockedReenable.message);
      assert.equal(blockedReenable.ok, false);
      assert.equal(blockedReenable.state, 'revocation-pending');

      // Sidecar returns online -> retryPendingRevocation revokes exact key and transitions to disabled
      sidecarOffline = false;
      const retried = await lifecycle.retryPendingRevocation();
      nonSecretArtifacts.push(retried.message);
      assert.equal(retried.ok, true);
      assert.equal(retried.state, 'disabled');
      assert.equal(lifecycle.getStatus().state, 'disabled');
      assert.equal(lifecycle.getStatus().keyId, null);

      const verifyRevokedHttp = await httpJson(backend!.baseUrl, 'GET', '/api/agent/workspace', pendingToken, undefined, {
        'x-workspace-id': ws1,
      });
      assert.equal(verifyRevokedHttp.status, 401);
      assert(changeEvents >= 6);
    });

    await check('5_secret_scans_and_external_mcp_config_byte_immutability_hold_across_all_outputs', async () => {
      assert.equal(fs.readFileSync(dotMcpPath, 'utf8'), originalDotMcp, '.mcp.json must remain byte-unchanged');
      assert.equal(fs.readFileSync(vscodeMcpPath, 'utf8'), originalVscodeMcp, '.vscode/mcp.json must remain byte-unchanged');
      assert(metadataSnapshots.length >= 8);
      for (const item of nonSecretArtifacts) {
        assert.equal(containsMcpSecretMaterial(item), false, `Secret pattern leaked into non-secret output: ${item}`);
        for (const secret of observedSecrets) {
          if (secret) {
            assert(!item.includes(secret), `Observed secret leaked into non-secret artifact: ${item}`);
          }
        }
      }
    });
  } finally {
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
  console.log(`[mcp-registration-lifecycle selftest] ${checks.length - failed.length}/${checks.length} passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
