import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const MCP_SCRIPT = path.join(REPO_ROOT, 'vscode-extension', 'mcp', 'x4forge-mcp.cjs');

async function httpJson(
  baseUrl: string,
  method: 'GET' | 'POST',
  apiPath: string,
  token: string | null,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: Record<string, any> | null }> {
  const reqHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...headers };
  if (token) reqHeaders.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${apiPath}`, {
    method,
    headers: reqHeaders,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json: Record<string, any> | null = null;
  try { json = await res.json() as Record<string, any>; } catch { /* non-json */ }
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
    clientInfo: { name: 'workspace-files-mcp-selftest', version: '1.0.0' },
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
  const root = fs.mkdtempSync(path.join(parent, 'forge-19p4s3-files-mcp-'));
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
  const browseDir = path.join(root, 'deployed');

  for (const d of [configDir, dataDir, stateDir, coordDir, discoveryDir, extensionsDir, corpusDir, schemaDir, modsDir, browseDir]) {
    fs.mkdirSync(d, { recursive: true });
  }
  fs.writeFileSync(path.join(gameDir, 'X4.exe'), 'fixture');
  fs.mkdirSync(path.join(corpusDir, 'libraries'), { recursive: true });
  fs.mkdirSync(path.join(corpusDir, 'assets', 'units', 'size_s', 'macros'), { recursive: true });
  fs.writeFileSync(path.join(corpusDir, 'libraries', 'factions.xml'), '<factions><faction id="argon" name="Argon"/></factions>');
  fs.writeFileSync(path.join(corpusDir, 'libraries', 'wares.xml'), '<wares><ware id="energycells" name="Energy Cells" group="energy"/></wares>');
  fs.writeFileSync(
    path.join(corpusDir, 'assets', 'units', 'size_s', 'macros', 'ship_arg_s_scout_01_a_macro.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n<macros>\n  <macro name="ship_arg_s_scout_01_a_macro" class="ship_s">\n    <properties>\n      <hull max="2000" />\n    </properties>\n  </macro>\n</macros>\n',
  );

  const repoHarvested = path.join(REPO_ROOT, 'data', 'harvested-schemas');
  if (fs.existsSync(path.join(repoHarvested, 'md.xsd')) && fs.existsSync(path.join(repoHarvested, 'common.xsd'))) {
    fs.copyFileSync(path.join(repoHarvested, 'md.xsd'), path.join(schemaDir, 'md.xsd'));
    fs.copyFileSync(path.join(repoHarvested, 'common.xsd'), path.join(schemaDir, 'common.xsd'));
  } else {
    fs.writeFileSync(path.join(schemaDir, 'md.xsd'), '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"/>');
    fs.writeFileSync(path.join(schemaDir, 'common.xsd'), '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"/>');
  }

  const modId = 'mcp_files_fixture';
  const modDir = path.join(modsDir, modId);
  const deployedModDir = path.join(browseDir, modId);
  fs.mkdirSync(path.join(modDir, 'md'), { recursive: true });
  fs.mkdirSync(path.join(deployedModDir, 'md'), { recursive: true });
  const contentXml = `<?xml version="1.0" encoding="utf-8"?>\n<content id="${modId}" name="MCP Files Fixture" version="100" author="ForgeQA" date="2026-11-24" save="0">\n  <text language="44" name="MCP Files Fixture" description="Fixture" author="ForgeQA" />\n</content>\n`;
  const initialProbeXml = `<?xml version="1.0" encoding="utf-8"?>\n<mdscript name="Mcp_Files_Probe" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="md.xsd">\n  <cues>\n    <cue name="Init">\n      <conditions><event_cue_signalled /></conditions>\n      <actions><debug_text text="'initial'" /></actions>\n    </cue>\n  </cues>\n</mdscript>\n`;
  fs.writeFileSync(path.join(modDir, 'content.xml'), contentXml);
  fs.writeFileSync(path.join(modDir, 'md', 'probe.xml'), initialProbeXml);
  fs.writeFileSync(path.join(modDir, 'binary.dat'), Buffer.from([0x00, 0x01, 0x02, 0xff]));
  fs.writeFileSync(path.join(deployedModDir, 'content.xml'), contentXml);
  fs.writeFileSync(path.join(deployedModDir, 'md', 'probe.xml'), initialProbeXml.replace("'initial'", "'deployed-stale'"));

  const importCandidateId = 'mcp_import_candidate';
  const importCandidateDir = path.join(modsDir, importCandidateId);
  fs.mkdirSync(path.join(importCandidateDir, 'md'), { recursive: true });
  fs.writeFileSync(
    path.join(importCandidateDir, 'content.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<content id="${importCandidateId}" name="MCP Import Candidate" version="200" author="ForgeQA" date="2026-11-24" save="0"/>\n`,
  );
  fs.writeFileSync(
    path.join(importCandidateDir, 'md', 'imported_cue.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<mdscript name="Mcp_Imported_Script"><cues><cue name="Imported_Cue"><conditions><event_cue_signalled/></conditions><actions><debug_text text="'imported'"/></actions></cue></cues></mdscript>\n`,
  );

  fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({
    x4GamePath: gameDir,
    x4ReferenceRoot: corpusDir,
    xsdSchemaPath: schemaDir,
    modWorkspacePath: modsDir,
    filesystemPath: browseDir,
    deployFormat: 'loose',
  }, null, 2));

  const STUDIO_TOKEN = 'studio_files_mcp_token_1234567890';
  const baseEnv: Record<string, string> = {
    X4_CONFIG_DIR: configDir,
    X4_DATA_DIR: dataDir,
    X4_STATE_DIR: stateDir,
    X4_SOURCE_COORDINATION_DIR: coordDir,
    X4FORGE_DISCOVERY_DIR: discoveryDir,
    STUDIO_API_TOKEN: STUDIO_TOKEN,
    X4_FORGE_MODE: 'dev-build',
    X4_STUDIO_PROFILE_ID: 'profile_files_mcp_alpha',
  };

  let backend: RunningBackend | null = null;
  const mcpSessions: McpSession[] = [];
  const openMcp = async (key: string, workspaceId: string) => {
    const session = await startMcpSession(backend!.baseUrl, key, workspaceId);
    mcpSessions.push(session);
    return session;
  };

  const explicitToolNames = [
    'preview_bulk_transform',
    'apply_bulk_transform',
    'list_workspace_files',
    'read_workspace_file',
    'write_workspace_file',
    'revert_action_history',
    'get_mod_drift',
    'import_mod_folder',
  ];

  try {
    backend = await startBackend(baseEnv);

    // Ensure reference manifest finishes indexing our tiny corpus fixture.
    for (let attempt = 0; attempt < 40; attempt++) {
      const statusRes = await httpJson(backend.baseUrl, 'GET', '/api/agent/reference/status', STUDIO_TOKEN);
      if (statusRes.json?.manifest?.state === 'ready') break;
      await new Promise(r => setTimeout(r, 50));
    }

    const clientId = 'client_files_mcp_ws1';
    const created = await httpJson(backend.baseUrl, 'POST', '/api/agent/workspaces', STUDIO_TOKEN, {
      clientId,
      name: modId,
    }, { 'x-client-id': clientId, 'x-forge-operation-id': `create-${modId}` });
    assert.equal(created.status, 201);
    const wsId = String(created.json!.workspaceId);
    const wsHeaders = { 'x-client-id': clientId, 'x-workspace-id': wsId };

    let fullMcp!: McpSession;

    await check('1_preset_keys_advertise_zero_unit25_tools_and_receive_403_on_curated_routes', async () => {
      for (const scope of ['read', 'write', 'deploy'] as const) {
        const minted = await httpJson(backend!.baseUrl, 'POST', '/api/agent/keys', STUDIO_TOKEN, {
          label: `preset-${scope}`,
          scope,
          ttl: '1h',
        }, wsHeaders);
        assert.equal(minted.status, 200);
        const token = minted.json!.token || minted.json!.key;
        const session = await openMcp(token, wsId);
        const listed = await session.request('tools/list');
        const names: string[] = (listed.result?.tools || []).map((t: any) => t.name);
        for (const toolName of explicitToolNames) {
          assert(!names.includes(toolName), `preset ${scope} key unexpectedly advertised ${toolName}`);
        }
        const denied = await session.callTool('list_workspace_files', { root: 'workspace' });
        assert.equal(denied.isError, true);
        assert.equal(denied.raw.error?.code, -32602);
        if (scope === 'deploy') {
          const directList = await httpJson(backend!.baseUrl, 'GET', '/api/agent/files/list?root=workspace', token, undefined, { 'x-workspace-id': wsId });
          assert.equal(directList.status, 403);
          assert.equal(directList.json?.authorityCode, 'CAPABILITY_NOT_GRANTED');
          // Legacy HTTP endpoint remains intact for preset deploy keys.
          const legacyList = await httpJson(backend!.baseUrl, 'GET', '/api/fs/list?root=workspace&depth=1', token, undefined, { 'x-workspace-id': wsId });
          assert.equal(legacyList.status, 200);
          assert(Array.isArray(legacyList.json));
        }
      }
    });

    await check('2_read_only_explicit_grant_exposes_only_read_tools_and_blocks_mutations', async () => {
      const readMint = await httpJson(backend!.baseUrl, 'POST', '/api/agent/keys', STUDIO_TOKEN, {
        label: 'files-read-only',
        scope: 'read',
        ttl: '1h',
        authorityMode: 'exact',
        capabilityIdentities: [
          'bulk.transform.preview@1',
          'files.list@1',
          'files.read@1',
          'workspace.mod.drift@1',
        ],
        allowedEffects: ['read', 'analyze'],
      }, wsHeaders);
      assert.equal(readMint.status, 200);
      const readMcp = await openMcp(readMint.json!.token || readMint.json!.key, wsId);
      const names: string[] = ((await readMcp.request('tools/list')).result?.tools || []).map((t: any) => t.name);
      assert(names.includes('list_workspace_files'));
      assert(names.includes('read_workspace_file'));
      assert(names.includes('get_mod_drift'));
      assert(names.includes('preview_bulk_transform'));
      assert(!names.includes('write_workspace_file'));
      assert(!names.includes('revert_action_history'));
      assert(!names.includes('import_mod_folder'));
      assert(!names.includes('apply_bulk_transform'));
    });

    await check('3_files_list_read_write_cas_strict_preflight_and_history_revert_over_mcp', async () => {
      const fullMint = await httpJson(backend!.baseUrl, 'POST', '/api/agent/keys', STUDIO_TOKEN, {
        label: 'full-unit25-mcp',
        scope: 'deploy',
        ttl: '1h',
        authorityMode: 'exact',
        capabilityIdentities: [
          'bulk.transform.apply@1',
          'bulk.transform.preview@1',
          'files.list@1',
          'files.read@1',
          'files.write@1',
          'history.list@2',
          'history.revert@2',
          'workspace.mod.drift@1',
          'workspace.mod.import@1',
          'workspace.read@2',
        ],
        allowedEffects: [
          'read',
          'analyze',
          'audit-write',
          'audit-retention-delete',
          'workspace-write',
          'filesystem-write',
          'deploy',
          'delete',
        ],
      }, wsHeaders);
      assert.equal(fullMint.status, 200, JSON.stringify(fullMint.json));
      fullMcp = await openMcp(fullMint.json!.token || fullMint.json!.key, wsId);
      const listedNames: string[] = ((await fullMcp.request('tools/list')).result?.tools || []).map((t: any) => t.name);
      for (const toolName of explicitToolNames) {
        assert(listedNames.includes(toolName), `full explicit key missing ${toolName}`);
      }

      const rootListing = await fullMcp.callTool('list_workspace_files', { root: 'workspace', path: modId });
      assert.equal(rootListing.isError, false, JSON.stringify(rootListing.payload));
      assert.equal(rootListing.payload.ok, true);
      assert.equal(typeof rootListing.payload.workspaceRootId, 'string');
      assert(!JSON.stringify(rootListing.payload).includes(modsDir), 'list_workspace_files leaked host modsDir');

      const readProbe = await fullMcp.callTool('read_workspace_file', {
        path: `${modId}/md/probe.xml`,
        root: 'workspace',
        expectedWorkspaceRootId: rootListing.payload.workspaceRootId,
      });
      assert.equal(readProbe.isError, false, JSON.stringify(readProbe.payload));
      assert.equal(readProbe.payload.ok, true);
      assert.equal(readProbe.payload.absolutePath, undefined, 'read_workspace_file must redact absolutePath');
      const originalSha = String(readProbe.payload.sha256);
      assert.equal(originalSha, crypto.createHash('sha256').update(initialProbeXml, 'utf8').digest('hex'));

      // Binary refusal (415)
      const binaryRead = await fullMcp.callTool('read_workspace_file', { path: `${modId}/binary.dat`, root: 'workspace' });
      assert.equal(binaryRead.isError, true);
      assert.equal(binaryRead.payload?.code, 'FILE_BINARY_UNSUPPORTED');

      // Strict XML preflight refusal (422) — zero bytes changed on disk
      const brokenXmlWrite = await fullMcp.callTool('write_workspace_file', {
        path: `${modId}/md/probe.xml`,
        content: '<mdscript><cues><cue name="Broken"></cues></mdscript>',
        expectedSha256: originalSha,
      });
      assert.equal(brokenXmlWrite.isError, true);
      assert.equal(brokenXmlWrite.payload?.code, 'REJECTED_BY_STRICT_VALIDATION');
      assert.equal(fs.readFileSync(path.join(modDir, 'md', 'probe.xml'), 'utf8'), initialProbeXml);

      // CAS conflict refusal (409) when expectedSha256 is null on existing file
      const casNullConflict = await fullMcp.callTool('write_workspace_file', {
        path: `${modId}/md/probe.xml`,
        content: initialProbeXml,
        expectedSha256: null,
      });
      assert.equal(casNullConflict.isError, true);
      assert.equal(casNullConflict.payload?.code, 'FILE_CHANGED');

      // Valid CAS update + ledger capture + revert_action_history
      const updatedXml = initialProbeXml.replace("'initial'", "'updated-via-mcp'");
      const validWrite = await fullMcp.callTool('write_workspace_file', {
        path: `${modId}/md/probe.xml`,
        content: updatedXml,
        expectedSha256: originalSha,
        expectedWorkspaceRootId: rootListing.payload.workspaceRootId,
      });
      assert.equal(validWrite.isError, false, JSON.stringify(validWrite.payload));
      assert.equal(validWrite.payload.ok, true);
      assert.equal(validWrite.payload.written?.absolutePath, undefined);
      assert.equal(fs.readFileSync(path.join(modDir, 'md', 'probe.xml'), 'utf8'), updatedXml);

      const historyRes = await fullMcp.callTool('list_action_history', { kind: 'edit', limit: 10 });
      assert.equal(historyRes.isError, false);
      const editRow = (historyRes.payload.rows || []).find((r: any) => r.revertible === true && Array.isArray(r.files) && r.files[0]?.includes('probe.xml'));
      assert(editRow, `Expected revertible edit row in history: ${JSON.stringify(historyRes.payload.rows)}`);

      const revertedFile = await fullMcp.callTool('revert_action_history', { id: editRow.id });
      assert.equal(revertedFile.isError, false, JSON.stringify(revertedFile.payload));
      assert.equal(revertedFile.payload.ok, true);
      assert.equal(fs.readFileSync(path.join(modDir, 'md', 'probe.xml'), 'utf8'), initialProbeXml);
    });

    await check('4_mod_drift_and_mod_folder_import_commit_and_one_use_workspace_revert', async () => {
      const drift = await fullMcp.callTool('get_mod_drift', { mod: modId });
      assert.equal(drift.isError, false, JSON.stringify(drift.payload));
      assert.equal(drift.payload.ok, true);
      assert.equal(drift.payload.available, true);
      assert.equal(drift.payload.mod, modId);
      assert.equal(drift.payload.verdict, 'drifted');
      assert(drift.payload.differing >= 1);

      const previewImport = await fullMcp.callTool('import_mod_folder', {
        path: importCandidateId,
        root: 'workspace',
      });
      assert.equal(previewImport.isError, false, JSON.stringify(previewImport.payload));
      assert.equal(previewImport.payload.applied, false);
      assert.equal(previewImport.payload.workspace, undefined);
      assert.equal(previewImport.payload.workspaceSummary?.name, 'MCP Import Candidate');

      // Stale CAS refusal (409)
      const staleImport = await fullMcp.callTool('import_mod_folder', {
        path: importCandidateId,
        root: 'workspace',
        apply: true,
        operationId: 'op_mcp_import_stale_1',
        expectedHead: '0000000000000000',
        expectedSnapshotHash: '1111111111111111',
      });
      assert.equal(staleImport.isError, true);

      // Commit import into addressed workspace
      const committedImport = await fullMcp.callTool('import_mod_folder', {
        path: importCandidateId,
        root: 'workspace',
        apply: true,
        operationId: 'op_mcp_import_commit_1',
        expectedHead: previewImport.payload.currentWorkspaceHash,
        expectedSnapshotHash: previewImport.payload.currentSnapshotHash,
      });
      assert.equal(committedImport.isError, false, JSON.stringify(committedImport.payload));
      assert.equal(committedImport.payload.applied, true);
      assert.equal(committedImport.payload.receipt?.status, 'committed');
      assert.equal(committedImport.payload.workspace, undefined);
      assert(committedImport.payload.workspaceSummary?.nodeCount >= 1);

      // Revert workspace import once via revert_action_history, then verify second revert returns 409 RECOVERY_ALREADY_USED
      const wsHistory = await fullMcp.callTool('list_action_history', { kind: 'workspace', limit: 10 });
      const importRow = (wsHistory.payload.rows || []).find((r: any) => r.revertible === true && r.recoveryKind === 'workspace');
      assert(importRow, `Expected revertible workspace import row: ${JSON.stringify(wsHistory.payload.rows)}`);

      const revertImport = await fullMcp.callTool('revert_action_history', { id: importRow.id });
      assert.equal(revertImport.isError, false, JSON.stringify(revertImport.payload));
      assert.equal(revertImport.payload.recoveryKind, 'workspace');
      assert.equal(revertImport.payload.workspace, undefined);
      assert.equal(revertImport.payload.workspaceHash, previewImport.payload.currentWorkspaceHash);

      const secondRevert = await fullMcp.callTool('revert_action_history', { id: importRow.id });
      assert.equal(secondRevert.isError, true);
      assert.equal(secondRevert.payload?.code, 'RECOVERY_ALREADY_USED');
    });

    await check('5_bulk_transform_preview_apply_cas_conflict_and_one_use_revert_over_mcp', async () => {
      const rule = {
        pathPrefix: 'assets/units/size_s/macros',
        selector: '/macros/macro/properties/hull/@max',
        operation: 'multiply',
        operand: 1.5,
        rounding: 'nearest',
        roundingIncrement: 100,
        maxFiles: 50,
      };
      const preview = await fullMcp.callTool('preview_bulk_transform', { rule });
      assert.equal(preview.isError, false, JSON.stringify(preview.payload));
      assert.equal(preview.payload.ok, true);
      assert.equal(preview.payload.matchedFiles, 1);
      assert.equal(preview.payload.rows?.[0]?.newValue, '3000');

      const badPlanApply = await fullMcp.callTool('apply_bulk_transform', {
        operationId: 'op_mcp_bulk_bad_plan_1',
        rule,
        expectedPlanHash: '0'.repeat(64),
        expectedHead: preview.payload.workspaceHash,
        expectedSnapshotHash: preview.payload.snapshotHash,
      });
      assert.equal(badPlanApply.isError, true);
      assert.equal(badPlanApply.payload?.code, 'BULK_APPLY_PLAN_CHANGED');

      const applied = await fullMcp.callTool('apply_bulk_transform', {
        operationId: 'op_mcp_bulk_commit_1',
        rule,
        expectedPlanHash: preview.payload.planHash,
        expectedHead: preview.payload.workspaceHash,
        expectedSnapshotHash: preview.payload.snapshotHash,
      });
      assert.equal(applied.isError, false, JSON.stringify(applied.payload));
      assert.equal(applied.payload.applied, true);
      assert.equal(applied.payload.added, 1);
      assert.equal(applied.payload.workspace, undefined);
      assert.equal(applied.payload.workspaceSummary?.xmlPatchCount, 1);
      assert.equal(applied.payload.receipt?.status, 'committed');

      const wsHistory = await fullMcp.callTool('list_action_history', { kind: 'workspace', limit: 10 });
      const bulkRow = (wsHistory.payload.rows || []).find((r: any) => r.revertible === true && r.recoveryId === applied.payload.receipt.id);
      assert(bulkRow, `Expected revertible bulk-transform row: ${JSON.stringify(wsHistory.payload.rows)}`);

      const revertedBulk = await fullMcp.callTool('revert_action_history', { id: bulkRow.id });
      assert.equal(revertedBulk.isError, false, JSON.stringify(revertedBulk.payload));
      assert.equal(revertedBulk.payload.workspaceHash, preview.payload.workspaceHash);
    });
  } finally {
    for (const s of mcpSessions) {
      try { await s.close(); } catch { /* ignore */ }
    }
    if (backend) await backend.stop();
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  const passed = checks.filter(c => c.pass).length;
  console.log(JSON.stringify({
    suite: 'workspace-files-mcp',
    pass: passed === checks.length && checks.length > 0,
    passed,
    total: checks.length,
    checks,
  }, null, 2));
  if (passed !== checks.length || checks.length === 0) process.exit(1);
}

await main();
