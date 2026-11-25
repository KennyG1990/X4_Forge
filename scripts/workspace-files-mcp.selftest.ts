import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runWorkspaceSymbolServiceSelftest } from '../src/server/workspaceSymbolService';

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
  fs.mkdirSync(path.join(corpusDir, 'aiscripts'), { recursive: true });
  fs.mkdirSync(path.join(corpusDir, 'md'), { recursive: true });
  fs.mkdirSync(path.join(corpusDir, 'extensions', 'ego_dlc_split', 'md'), { recursive: true });
  fs.mkdirSync(path.join(corpusDir, 'assets', 'units', 'size_s', 'macros'), { recursive: true });
  fs.writeFileSync(path.join(corpusDir, 'libraries', 'factions.xml'), '<factions><faction id="argon" name="Argon"/></factions>');
  fs.writeFileSync(path.join(corpusDir, 'libraries', 'wares.xml'), '<wares><ware id="energycells" name="Energy Cells" group="energy"/></wares>');
  fs.writeFileSync(
    path.join(corpusDir, 'aiscripts', 'order.fight.attack.object.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n<aiscript name="order.fight.attack.object"><order id="Attack" category="combat" infinite="false"><params><param name="primarytarget" type="object"/></params></order><attention min="unknown"><actions/></attention></aiscript>\n',
  );
  fs.writeFileSync(
    path.join(corpusDir, 'aiscripts', 'lib.helper.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n<aiscript name="lib.helper"><attention min="unknown"><actions/></attention></aiscript>\n',
  );
  fs.writeFileSync(
    path.join(corpusDir, 'md', 'base_missions.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n<mdscript name="BaseMissions"><cues><cue name="SharedCue"/><cue name="BaseOnlyCue"/></cues></mdscript>\n',
  );
  fs.writeFileSync(
    path.join(corpusDir, 'md', 'shared_override.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n<mdscript name="SharedOverride"><cues><cue name="OverrideCue"/></cues></mdscript>\n',
  );
  fs.writeFileSync(
    path.join(corpusDir, 'extensions', 'ego_dlc_split', 'md', 'dlc_missions.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n<mdscript name="DlcMissions"><cues><cue name="SharedCue"/><cue name="DlcOnlyCue"/></cues></mdscript>\n',
  );
  fs.writeFileSync(
    path.join(corpusDir, 'extensions', 'ego_dlc_split', 'md', 'shared_override.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n<mdscript name="SharedOverride"><cues><cue name="OverrideCue"/></cues></mdscript>\n',
  );
  fs.writeFileSync(
    path.join(corpusDir, 'assets', 'units', 'size_s', 'macros', 'ship_arg_s_scout_01_a_macro.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n<macros>\n  <macro name="ship_arg_s_scout_01_a_macro" class="ship_s">\n    <properties>\n      <hull max="2000" />\n    </properties>\n  </macro>\n</macros>\n',
  );

  const repoHarvested = path.join(REPO_ROOT, 'data', 'harvested-schemas');
  if (fs.existsSync(path.join(repoHarvested, 'md.xsd')) && fs.existsSync(path.join(repoHarvested, 'common.xsd'))) {
    fs.copyFileSync(path.join(repoHarvested, 'md.xsd'), path.join(schemaDir, 'md.xsd'));
    fs.copyFileSync(path.join(repoHarvested, 'common.xsd'), path.join(schemaDir, 'common.xsd'));
    if (fs.existsSync(path.join(repoHarvested, 'scriptproperties.xml'))) {
      fs.copyFileSync(path.join(repoHarvested, 'scriptproperties.xml'), path.join(schemaDir, 'scriptproperties.xml'));
    }
  } else {
    fs.writeFileSync(path.join(schemaDir, 'md.xsd'), '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"/>');
    fs.writeFileSync(path.join(schemaDir, 'common.xsd'), '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"/>');
  }

  // Seed universe 01.cat/01.dat and two installed extensions for Slice 4 ecosystem & authoring MCP checks.
  const galXmlBuf = Buffer.from(
    '<macros><macro name="Xu_Ep2_universe_macro" class="galaxy"><connections><connection name="Cluster_01_connection" ref="clusters"><offset><position x="100" y="0" z="200"/></offset><macro ref="Cluster_01_macro" connection="galaxy"/></connection></connections></macro></macros>',
    'utf8',
  );
  const cluXmlBuf = Buffer.from(
    '<macros><macro name="Cluster_01_macro" class="cluster"><connections><connection name="Cluster_01_Sector001_connection" ref="sectors"><offset><position x="10" y="0" z="20"/></offset><macro ref="Cluster_01_Sector001_macro" connection="cluster"/></connection></connections></macro></macros>',
    'utf8',
  );
  const waresBaseBuf = Buffer.from('<wares><ware id="energycells" name="Energy Cells" group="energy" transport="energy"/></wares>', 'utf8');
  fs.writeFileSync(path.join(gameDir, '01.dat'), Buffer.concat([galXmlBuf, cluXmlBuf, waresBaseBuf]));
  fs.writeFileSync(
    path.join(gameDir, '01.cat'),
    `maps/xu_ep2_universe/galaxy.xml ${galXmlBuf.length} 1700000000 00000000000000000000000000000000\nmaps/xu_ep2_universe/clusters.xml ${cluXmlBuf.length} 1700000000 00000000000000000000000000000000\nlibraries/wares.xml ${waresBaseBuf.length} 1700000000 00000000000000000000000000000000\n`,
    'utf8',
  );
  for (const [extFolder, depXml, groupVal] of [
    ['mod_alpha', '', 'minerals'],
    ['mod_beta', '<dependency id="mod_alpha" optional="false"/>', 'refined'],
  ] as const) {
    fs.mkdirSync(path.join(extensionsDir, extFolder, 'libraries'), { recursive: true });
    fs.writeFileSync(
      path.join(extensionsDir, extFolder, 'content.xml'),
      `<content id="${extFolder}" name="${extFolder}" version="100" enabled="1">${depXml}</content>`,
    );
    fs.writeFileSync(
      path.join(extensionsDir, extFolder, 'libraries', 'wares.xml'),
      `<diff><replace sel="/wares/ware[@id='energycells']/@group">${groupVal}</replace></diff>`,
    );
    if (extFolder === 'mod_alpha') {
      fs.mkdirSync(path.join(extensionsDir, extFolder, 'md'), { recursive: true });
      fs.writeFileSync(
        path.join(extensionsDir, extFolder, 'md', 'installed_missions.xml'),
        '<?xml version="1.0" encoding="utf-8"?>\n<mdscript name="InstalledMissions"><cues><cue name="SharedCue"/><cue name="InstalledOnlyCue"/></cues></mdscript>\n',
      );
      fs.writeFileSync(
        path.join(extensionsDir, extFolder, 'md', 'shared_override.xml'),
        '<?xml version="1.0" encoding="utf-8"?>\n<mdscript name="SharedOverride"><cues><cue name="OverrideCue"/></cues></mdscript>\n',
      );
    }
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
    'get_project_file_inventory',
    'list_workspace_files',
    'read_workspace_file',
    'scaffold_mod_project',
    'write_workspace_file',
    'remove_workspace_file',
    'remove_workspace_directory',
    'restore_workspace_file',
    'apply_warning_suppression',
    'rename_md_symbol',
    'list_workspace_snapshots',
    'create_workspace_snapshot',
    'restore_workspace_snapshot',
    'delete_workspace_snapshot',
    'prepare_nexus_release',
    'prepare_steam_release',
    'verify_steam_release',
    'adopt_steam_workshop_id',
    'revoke_warning_review',
    'revert_action_history',
    'get_mod_drift',
    'import_mod_folder',
    'update_workspace_domain',
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
    let presetReadMcp!: McpSession;

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
        if (scope === 'read') presetReadMcp = session;
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
          if (scope !== 'read') await session.close();
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
        assert(!names.includes('remove_workspace_file'));
        assert(!names.includes('restore_workspace_file'));
        assert(!names.includes('revert_action_history'));
        assert(!names.includes('import_mod_folder'));
        assert(!names.includes('apply_bulk_transform'));
        await readMcp.close();
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
            'files.delete@1',
            'files.delete.dir@1',
            'files.inventory.read@1',
            'files.list@1',
            'files.read@1',
            'files.restore@2',
            'files.scaffold@1',
            'files.write@2',
            'history.list@2',
            'history.raw.read@1',
            'history.revert@2',
            'project.md.rename@1',
            'project.symbols.search@1',
            'release.artifact.verify@1',
            'release.nexus.prepare@1',
            'release.steam.adopt@1',
            'release.steam.prepare@1',
            'release.steam.verify@1',
            'reviews.warning.revoke@1',
          'rules.suppression.apply@1',
          'rules.suppression.prepare@1',
          'snapshots.create@1',
          'snapshots.delete@1',
          'snapshots.list@1',
          'snapshots.restore@1',
          'workspace.domain.read@2',
          'workspace.domain.write@2',
          'workspace.mod.drift@1',
          'workspace.mod.import@1',
          'workspace.read@2',
          'workspace.roundtrip.check@1',
        ],
        allowedEffects: [
          'read',
          'analyze',
          'audit-write',
          'audit-retention-delete',
          'workspace-write',
          'filesystem-write',
          'package',
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

    await check('6_authoring_and_ecosystem_helpers_over_preset_read_mcp', async () => {
      const historyBefore = await presetReadMcp.callTool('list_action_history', { limit: 50 });
      const totalBefore = historyBefore.payload.total;

      const exprRes = await presetReadMcp.callTool('suggest_expression_completions', {
        text: '$st.ow',
        caret: 6,
        variableTypes: { $st: 'station' },
        limit: 10,
      });
      assert.equal(exprRes.isError, false, JSON.stringify(exprRes.payload));
      assert.equal(typeof exprRes.payload.available, 'boolean');
      assert(Array.isArray(exprRes.payload.suggestions));
      if (exprRes.payload.available) {
        assert(exprRes.payload.suggestions.some((s: any) => s.insert === 'owner' && s.source === 'datatype'));
      }

      const depRes = await presetReadMcp.callTool('get_mod_dependency_graph', {});
      assert.equal(depRes.isError, false, JSON.stringify(depRes.payload));
      assert.equal(depRes.payload.extensionsRoot, undefined);
      assert.deepEqual(depRes.payload.loadOrder, ['mod_alpha', 'mod_beta']);

      const ovrRes = await presetReadMcp.callTool('get_extension_override_map', { file: 'libraries/wares.xml' });
      assert.equal(ovrRes.isError, false, JSON.stringify(ovrRes.payload));
      assert.equal(ovrRes.payload.entries?.[0]?.contested, true);
      assert.equal(ovrRes.payload.entries?.[0]?.winner, 'mod_beta');

      const targetsRes = await presetReadMcp.callTool('list_patch_targets', { q: 'wares', limit: 10 });
      assert.equal(targetsRes.isError, false, JSON.stringify(targetsRes.payload));
      assert(targetsRes.payload.items.some((item: any) => item.id === 'libraries/wares.xml'));

      const synthRes = await presetReadMcp.callTool('synthesize_xml_patch', {
        targetFile: 'libraries/wares.xml',
        editedXml: '<wares><ware id="energycells" name="Energy Cells" group="super_energy" transport="energy"/></wares>',
      });
      assert.equal(synthRes.isError, false, JSON.stringify(synthRes.payload));
      assert.equal(synthRes.payload.success, true);
      assert(synthRes.payload.diffXml.includes('super_energy'));

      const galRes = await presetReadMcp.callTool('get_galaxy_map', { q: 'Cluster_01' });
      assert.equal(galRes.isError, false, JSON.stringify(galRes.payload));
      assert.equal(galRes.payload.counts.clusters, 1);
      assert.equal(galRes.payload.sectors?.[0]?.pos?.x, 110);

      const historyAfter = await presetReadMcp.callTool('list_action_history', { limit: 50 });
      assert.equal(historyAfter.payload.total, totalBefore, 'quiet read/analyze tools must record zero Action Ledger rows');
    });

    await check('7_reversible_single_file_remove_restore_and_undo_create_over_mcp_and_write_grant', async () => {
      // Explicit write-scope key (no deploy scope required!) can create, edit, remove, undo-create, and restore files.
      const writeMint = await httpJson(backend!.baseUrl, 'POST', '/api/agent/keys', STUDIO_TOKEN, {
        label: 'files-write-delete-restore',
        scope: 'write',
        ttl: '1h',
        authorityMode: 'exact',
        capabilityIdentities: [
          'files.delete@1',
          'files.delete.dir@1',
          'files.list@1',
          'files.read@1',
          'files.restore@2',
          'files.scaffold@1',
          'files.write@2',
        ],
        allowedEffects: ['read', 'filesystem-write', 'delete', 'audit-write', 'audit-retention-delete'],
      }, wsHeaders);
      assert.equal(writeMint.status, 200, JSON.stringify(writeMint.json));
      const writeMcp = await openMcp(writeMint.json!.token || writeMint.json!.key, wsId);
      const writeNames: string[] = ((await writeMcp.request('tools/list')).result?.tools || []).map((t: any) => t.name);
      assert(writeNames.includes('write_workspace_file'));
      assert(writeNames.includes('remove_workspace_file'));
      assert(writeNames.includes('restore_workspace_file'));
      assert(!writeNames.includes('revert_action_history'), 'write scope must not advertise deploy-only revert_action_history');

      const rootListing = await writeMcp.callTool('list_workspace_files', { root: 'workspace', path: modId });
      const rootId = String(rootListing.payload.workspaceRootId);
      const candidateRel = `${modId}/md/temp_candidate.xml`;
      const candidateAbs = path.join(modDir, 'md', 'temp_candidate.xml');
      const v1Xml = '<mdscript name="TempCandidate"><cues><cue name="Init"/></cues></mdscript>\n';
      const v2Xml = '<mdscript name="TempCandidate"><cues><cue name="Edited"/></cues></mdscript>\r\n';

      // 1. Create new file (expectedSha256: null) -> emits undo-create recovery -> undo-create removes it -> replay fails 409
      const created1 = await writeMcp.callTool('write_workspace_file', {
        path: candidateRel,
        content: v1Xml,
        expectedSha256: null,
        expectedWorkspaceRootId: rootId,
      });
      assert.equal(created1.isError, false, JSON.stringify(created1.payload));
      assert.equal(created1.payload.recovery?.kind, 'file');
      assert.equal(created1.payload.recovery?.operation, 'undo-create');
      assert.equal(created1.payload.recovery?.expectedCurrentHash, created1.payload.written?.sha256);
      assert.equal(fs.existsSync(candidateAbs), true);

      const undoneCreate = await writeMcp.callTool('restore_workspace_file', {
        recoveryId: created1.payload.recovery.id,
        expectedWorkspaceRootId: rootId,
      });
      assert.equal(undoneCreate.isError, false, JSON.stringify(undoneCreate.payload));
      assert.equal(undoneCreate.payload.operation, 'undo-create');
      assert.equal(undoneCreate.payload.action, 'removed-created-file');
      assert.equal(fs.existsSync(candidateAbs), false);

      const replayUndoCreate = await writeMcp.callTool('restore_workspace_file', {
        recoveryId: created1.payload.recovery.id,
      });
      assert.equal(replayUndoCreate.isError, true);
      assert.equal(replayUndoCreate.payload?.code, 'RECOVERY_ALREADY_USED');

      // 2. Re-create + edit -> stale undo-create refused with 409 RECOVERY_STALE while edited bytes survive
      const created2 = await writeMcp.callTool('write_workspace_file', {
        path: candidateRel,
        content: v1Xml,
        expectedSha256: null,
        expectedWorkspaceRootId: rootId,
      });
      assert.equal(created2.isError, false);
      const edited2 = await writeMcp.callTool('write_workspace_file', {
        path: candidateRel,
        content: v2Xml,
        expectedSha256: created2.payload.written.sha256,
        expectedWorkspaceRootId: rootId,
      });
      assert.equal(edited2.isError, false, JSON.stringify(edited2.payload));
      const v2Sha = String(edited2.payload.written.sha256);

      const staleUndoCreate = await writeMcp.callTool('restore_workspace_file', {
        recoveryId: created2.payload.recovery.id,
      });
      assert.equal(staleUndoCreate.isError, true);
      assert.equal(staleUndoCreate.payload?.code, 'RECOVERY_STALE');
      assert.equal(fs.readFileSync(candidateAbs, 'utf8'), v2Xml);

      // 3. Negative delete checks: wrong hash, wrong root, directory target, traversal, hidden path
      const wrongHashDel = await writeMcp.callTool('remove_workspace_file', {
        path: candidateRel,
        expectedSha256: '0'.repeat(64),
      });
      assert.equal(wrongHashDel.isError, true);
      assert.equal(wrongHashDel.payload?.code, 'FILE_CHANGED');
      assert.equal(fs.readFileSync(candidateAbs, 'utf8'), v2Xml);

      const wrongRootDel = await writeMcp.callTool('remove_workspace_file', {
        path: candidateRel,
        expectedSha256: v2Sha,
        expectedWorkspaceRootId: 'f'.repeat(64),
      });
      assert.equal(wrongRootDel.isError, true);
      assert.equal(wrongRootDel.payload?.code, 'WORKSPACE_ROOT_CHANGED');

      const dirDel = await writeMcp.callTool('remove_workspace_file', {
        path: `${modId}/md`,
        expectedSha256: v2Sha,
      });
      assert.equal(dirDel.isError, true);
      assert.equal(dirDel.payload?.code, 'NOT_A_REGULAR_FILE');
      assert.equal(fs.existsSync(path.join(modDir, 'md', 'probe.xml')), true);

      const traversalDel = await writeMcp.callTool('remove_workspace_file', {
        path: '../outside.xml',
        expectedSha256: v2Sha,
      });
      assert.equal(traversalDel.isError, true);
      assert.equal(traversalDel.payload?.code, 'PATH_TRAVERSAL_FORBIDDEN');

      const hiddenDel = await writeMcp.callTool('remove_workspace_file', {
        path: `${modId}/.git/config`,
        expectedSha256: v2Sha,
      });
      assert.equal(hiddenDel.isError, true);
      assert.equal(hiddenDel.payload?.code, 'HIDDEN_PATH_FORBIDDEN');

      // 4. Remove -> occupied restore refused (409 RECOVERY_STALE) -> clean restore preserves exact CRLF bytes -> replay refused
      const removed = await writeMcp.callTool('remove_workspace_file', {
        path: candidateRel,
        expectedSha256: v2Sha,
        expectedWorkspaceRootId: rootId,
      });
      assert.equal(removed.isError, false, JSON.stringify(removed.payload));
      assert.equal(removed.payload.recovery?.operation, 'delete-file');
      assert.equal(removed.payload.recovery?.expectedCurrentHash, 'absent');
      assert(!JSON.stringify(removed.payload).includes(modsDir), 'remove_workspace_file leaked host modsDir');
      assert.equal(fs.existsSync(candidateAbs), false);
      assert.equal(fs.existsSync(path.join(modDir, 'md', 'probe.xml')), true, 'sibling files must remain untouched');

      fs.writeFileSync(candidateAbs, 'occupying-bytes', 'utf8');
      const occupiedRestore = await writeMcp.callTool('restore_workspace_file', {
        recoveryId: removed.payload.recovery.id,
      });
      assert.equal(occupiedRestore.isError, true);
      assert.equal(occupiedRestore.payload?.code, 'RECOVERY_STALE');
      assert.equal(fs.readFileSync(candidateAbs, 'utf8'), 'occupying-bytes');
      fs.unlinkSync(candidateAbs);

      const restored = await writeMcp.callTool('restore_workspace_file', {
        recoveryId: removed.payload.recovery.id,
        expectedWorkspaceRootId: rootId,
      });
      assert.equal(restored.isError, false, JSON.stringify(restored.payload));
      assert.equal(restored.payload.action, 'restored');
      assert.equal(fs.readFileSync(candidateAbs, 'utf8'), v2Xml);

      const replayRestore = await writeMcp.callTool('restore_workspace_file', {
        recoveryId: removed.payload.recovery.id,
      });
      assert.equal(replayRestore.isError, true);
      assert.equal(replayRestore.payload?.code, 'RECOVERY_ALREADY_USED');
      assert.equal(fs.readFileSync(candidateAbs, 'utf8'), v2Xml);

      // 5. Remove again and restore via Action Ledger revert_action_history (one-use CAS)
      const removedAgain = await writeMcp.callTool('remove_workspace_file', {
        path: candidateRel,
        expectedSha256: v2Sha,
        expectedWorkspaceRootId: rootId,
      });
      assert.equal(removedAgain.isError, false);
      assert.equal(fs.existsSync(candidateAbs), false);

      const editRows = await fullMcp.callTool('list_action_history', { kind: 'edit', limit: 10 });
      const deleteRow = (editRows.payload.rows || []).find((r: any) => r.recoveryId === removedAgain.payload.recovery.id);
      assert(deleteRow && deleteRow.revertible === true && deleteRow.recoveryKind === 'file');

      const revertedViaHistory = await fullMcp.callTool('revert_action_history', { id: deleteRow.id });
      assert.equal(revertedViaHistory.isError, false, JSON.stringify(revertedViaHistory.payload));
      assert.equal(fs.readFileSync(candidateAbs, 'utf8'), v2Xml);

      const replayViaHistory = await fullMcp.callTool('revert_action_history', { id: deleteRow.id });
      assert.equal(replayViaHistory.isError, true);
      assert.equal(replayViaHistory.payload?.code, 'RECOVERY_ALREADY_USED');
    });

    await check('8_round_trip_quick_fixes_warning_suppression_review_revoke_and_nexus_release_over_mcp', async () => {
      const u28ModId = 'unit28_mcp_mod';
      const u28ModDir = path.join(modsDir, u28ModId);
      fs.mkdirSync(path.join(u28ModDir, 'md'), { recursive: true });
      fs.mkdirSync(path.join(u28ModDir, 'aiscripts'), { recursive: true });
      fs.writeFileSync(
        path.join(u28ModDir, 'content.xml'),
        `<?xml version="1.0" encoding="utf-8"?>\n<content id="${u28ModId}" name="Unit 28 MCP Mod" version="100" author="ForgeQA" date="2026-11-24" save="0" description="Unit 28 MCP verification mod"><text language="44" name="Unit 28 MCP Mod" description="Unit 28 MCP verification mod" author="ForgeQA"/></content>\n`,
        'utf8',
      );
      fs.writeFileSync(
        path.join(u28ModDir, 'md', 'main.xml'),
        '<?xml version="1.0" encoding="utf-8"?>\n<mdscript name="Unit28Main"><cues><cue name="Boot"><conditions><event_game_loaded/></conditions><actions><debug_text text="\'ok\'"/></actions></cue></cues></mdscript>\n',
        'utf8',
      );
      fs.writeFileSync(
        path.join(u28ModDir, 'aiscripts', 'legacy.xml'),
        '<?xml version="1.0" encoding="utf-8"?>\n<aiscript name="Unit28Legacy"><attention min="unknown"><actions><do_if value="$ship.isexceedingmadscore"><debug_text text="\'warn\'"/></do_if></actions></attention></aiscript>\n',
        'utf8',
      );
      const u28Scope = {
        code: 'migration.deprecated_property',
        file: 'aiscripts/legacy.xml',
        sourceRef: '9.00:isexceedingmadscore',
      };

      // 1. Preset read MCP: check_xml_round_trip & suggest_quick_fixes & prepare_warning_suppression
      const readList = ((await presetReadMcp.request('tools/list')).result?.tools || []).map((t: any) => t.name);
      for (const readTool of ['check_xml_round_trip', 'suggest_quick_fixes', 'prepare_warning_suppression', 'verify_release_artifact']) {
        assert(readList.includes(readTool), `preset read key missing ${readTool}`);
      }

      const rt = await presetReadMcp.callTool('check_xml_round_trip', { path: u28ModId, root: 'workspace' });
      assert.equal(rt.isError, false, JSON.stringify(rt.payload));
      assert.equal(rt.payload.ok, true);
      assert.equal(rt.payload.lossless, true);
      assert.equal(rt.payload.importReport?.folder, undefined);
      assert(!JSON.stringify(rt.payload).includes(modsDir), 'check_xml_round_trip leaked host modsDir');

      const qf = await presetReadMcp.callTool('suggest_quick_fixes', { limit: 20 });
      assert.equal(qf.isError, false, JSON.stringify(qf.payload));
      assert.equal(qf.payload.ok, true);
      assert(Array.isArray(qf.payload.fixes));

      const prep = await presetReadMcp.callTool('prepare_warning_suppression', {
        path: u28ModId,
        scope: u28Scope,
      });
      assert.equal(prep.isError, false, JSON.stringify(prep.payload));
      assert.equal(prep.payload.ok, true);
      assert.equal(prep.payload.expectedSha256, null);

      // 2. Explicit grant apply_warning_suppression: CAS mismatch refused -> null expectedSha256 commits + undo-create recovery
      const staleSuppress = await fullMcp.callTool('apply_warning_suppression', {
        path: u28ModId,
        scope: u28Scope,
        expectedSha256: 'a'.repeat(64),
        review: { ...prep.payload.defaults, owner: 'ForgeQA' },
      });
      assert.equal(staleSuppress.isError, true);
      assert.equal(staleSuppress.payload?.code, 'RULES_FILE_CHANGED');

      const appliedSuppress = await fullMcp.callTool('apply_warning_suppression', {
        path: u28ModId,
        scope: u28Scope,
        expectedSha256: null,
        review: { ...prep.payload.defaults, owner: 'ForgeQA' },
      });
      assert.equal(appliedSuppress.isError, false, JSON.stringify(appliedSuppress.payload));
      assert.equal(appliedSuppress.payload.status, 'VERIFIED');
      assert.equal(appliedSuppress.payload.recovery?.operation, 'undo-create');
      assert.equal(fs.existsSync(path.join(u28ModDir, 'forge.rules.json')), true);

      const dupPrep = await presetReadMcp.callTool('prepare_warning_suppression', {
        path: u28ModId,
        scope: u28Scope,
      });
      assert.equal(dupPrep.isError, true);
      assert(String(dupPrep.payload).includes('not reproduced') || String(dupPrep.payload).includes('already declares'), JSON.stringify(dupPrep.payload));

      const undoneRules = await fullMcp.callTool('restore_workspace_file', {
        recoveryId: appliedSuppress.payload.recovery.id,
      });
      assert.equal(undoneRules.isError, false, JSON.stringify(undoneRules.payload));
      assert.equal(fs.existsSync(path.join(u28ModDir, 'forge.rules.json')), false);

      // 3. prepare_nexus_release + verify_release_artifact + tamper detection
      const nexusBuilt = await fullMcp.callTool('prepare_nexus_release', {
        path: u28ModId,
        bump: 'patch',
      });
      assert.equal(nexusBuilt.isError, false, JSON.stringify(nexusBuilt.payload));
      assert.equal(nexusBuilt.payload.status, 'VERIFIED');
      assert.equal(nexusBuilt.payload.version, '101');
      assert.equal(typeof nexusBuilt.payload.artifactFile, 'string');
      assert(!JSON.stringify(nexusBuilt.payload).includes(modsDir), 'prepare_nexus_release leaked host modsDir');

      const verifiedZip = await presetReadMcp.callTool('verify_release_artifact', {
        platform: 'nexus',
        modId: u28ModId,
        artifactFile: nexusBuilt.payload.artifactFile,
      });
      assert.equal(verifiedZip.isError, false, JSON.stringify(verifiedZip.payload));
      assert.equal(verifiedZip.payload.verified, true);
      assert.equal(verifiedZip.payload.sha256, nexusBuilt.payload.sha256);

      const badTraversalVerify = await presetReadMcp.callTool('verify_release_artifact', {
        platform: 'nexus',
        modId: u28ModId,
        artifactFile: '../escape.zip',
      });
      assert.equal(badTraversalVerify.isError, true);

      const zipOnDisk = path.join(modsDir, '.forge-builds', 'releases', 'nexus', nexusBuilt.payload.artifactFile);
      fs.appendFileSync(zipOnDisk, Buffer.from([0x00]));
      const tamperedVerify = await presetReadMcp.callTool('verify_release_artifact', {
        platform: 'nexus',
        modId: u28ModId,
        artifactFile: nexusBuilt.payload.artifactFile,
      });
      assert.equal(tamperedVerify.isError, true);

      // 4. Import u28ModId into a fresh workspace, accept warning on deploy-verify, and revoke via revoke_warning_review over MCP
      const u28Client = 'client_u28_revoke';
      const u28WsCreate = await httpJson(backend!.baseUrl, 'POST', '/api/agent/workspaces', STUDIO_TOKEN, {
        clientId: u28Client,
        name: u28ModId,
      }, { 'x-client-id': u28Client, 'x-forge-operation-id': `create-${u28ModId}` });
      assert.equal(u28WsCreate.status, 201);
      const u28WsId = String(u28WsCreate.json!.workspaceId);
      const u28Headers = { 'x-client-id': u28Client, 'x-workspace-id': u28WsId };

      const u28Imp = await httpJson(backend!.baseUrl, 'POST', '/api/agent/mod-folder/import', STUDIO_TOKEN, {
        path: u28ModId,
        root: 'workspace',
      }, u28Headers);
      assert.equal(u28Imp.status, 200);
      const u28SaveWs = await httpJson(backend!.baseUrl, 'POST', '/api/agent/workspace', STUDIO_TOKEN, {
        workspace: u28Imp.json!.workspace,
        force: true,
      }, { ...u28Headers, 'x-forge-operation-id': `save-${u28ModId}` });
      assert.equal(u28SaveWs.status, 200);

      const dry1 = await httpJson(backend!.baseUrl, 'POST', '/api/agent/deploy-verify', STUDIO_TOKEN, {
        path: u28ModId,
        root: 'workspace',
        dryRun: true,
      }, u28Headers);
      const finding = (dry1.json?.validation?.evidence?.findings || []).find((f: any) => f.severity === 'warning');
      assert(finding, 'expected warning finding in dry1');
      const acceptances = [{ findingId: finding.findingId, bindingHash: dry1.json!.bindingHash, reason: 'Reviewed deprecated element for MCP revoke test.' }];
      const dry2 = await httpJson(backend!.baseUrl, 'POST', '/api/agent/deploy-verify', STUDIO_TOKEN, {
        path: u28ModId,
        root: 'workspace',
        dryRun: true,
        acceptances,
      }, u28Headers);
      const depApply = await httpJson(backend!.baseUrl, 'POST', '/api/agent/deploy-verify', STUDIO_TOKEN, {
        path: u28ModId,
        root: 'workspace',
        dryRun: false,
        acceptances,
        expectedModId: dry2.json!.modId,
        expectedSourceHash: dry2.json!.sourceHash,
        expectedArtifactHash: dry2.json!.artifactHash,
        expectedBindingHash: dry2.json!.bindingHash,
        expectedTargetFingerprint: dry2.json!.targetFingerprint,
      }, u28Headers);
      assert.equal(depApply.status, 200, JSON.stringify(depApply.json));
      const acceptanceReceiptId = String(depApply.json!.acceptanceRecords[0].id);
      const reviewScopeHash = String(dry2.json!.validation.review.warningReviews.scopeHash);

      const u28DeployMint = await httpJson(backend!.baseUrl, 'POST', '/api/agent/keys', STUDIO_TOKEN, {
        label: 'u28-revoke-mcp',
        scope: 'deploy',
        ttl: '1h',
        authorityMode: 'exact',
        capabilityIdentities: ['reviews.warning.revoke@1'],
        allowedEffects: ['filesystem-write', 'audit-write', 'audit-retention-delete'],
      }, u28Headers);
      assert.equal(u28DeployMint.status, 200);
      const u28RevokeMcp = await openMcp(u28DeployMint.json!.token || u28DeployMint.json!.key, u28WsId);

      const badRevoke = await u28RevokeMcp.callTool('revoke_warning_review', {
        receiptId: acceptanceReceiptId,
        reviewScopeHash: '0'.repeat(64),
        reason: 'Wrong scope hash',
      });
      assert.equal(badRevoke.isError, true);
      assert.equal(badRevoke.payload?.code, 'REVIEW_WORKSPACE_MISMATCH');

      const okRevoke = await u28RevokeMcp.callTool('revoke_warning_review', {
        receiptId: acceptanceReceiptId,
        reviewScopeHash,
        reason: 'Revoked warning acceptance over MCP',
      });
      assert.equal(okRevoke.isError, false, JSON.stringify(okRevoke.payload));
      assert.equal(okRevoke.payload.ok, true);
      assert.equal(okRevoke.payload.outcome, 'warning-review-revoked');
    });

    await check('9_multi_source_workspace_symbols_and_cas_md_symbol_rename_over_mcp', async () => {
      const unitSelf = runWorkspaceSymbolServiceSelftest();
      assert.equal(unitSelf.pass, true, JSON.stringify(unitSelf));
      assert.equal(unitSelf.total, 6);

      const u29ModId = 'unit29_symbols_mod';
      const u29ModDir = path.join(modsDir, u29ModId);
      fs.mkdirSync(path.join(u29ModDir, 'md'), { recursive: true });
      fs.mkdirSync(path.join(u29ModDir, 'aiscripts'), { recursive: true });
      fs.writeFileSync(
        path.join(u29ModDir, 'content.xml'),
        `<?xml version="1.0" encoding="utf-8"?>\n<content id="${u29ModId}" name="Unit 29 Symbols Mod" version="100" author="ForgeQA" date="2026-11-24" save="0"/>\n`,
        'utf8',
      );
      const mdOneText = '<?xml version="1.0" encoding="utf-8"?>\n<mdscript name="Unit29One">\n  <cues>\n    <cue name="SharedCue">\n      <conditions><event_cue_signalled/></conditions>\n      <actions><signal_cue cue="SharedCue"/></actions>\n    </cue>\n    <library name="LocalHelper"/>\n  </cues>\n</mdscript>\n';
      const mdTwoText = '<?xml version="1.0" encoding="utf-8"?>\n<mdscript name="Unit29Two">\n  <cues>\n    <cue name="CallerCue">\n      <conditions><event_cue_signalled/></conditions>\n      <actions><signal_cue cue="md.Unit29One.Sh&#97;redCue"/></actions>\n    </cue>\n  </cues>\n</mdscript>\n';
      fs.writeFileSync(path.join(u29ModDir, 'md', 'one.xml'), mdOneText, 'utf8');
      fs.writeFileSync(path.join(u29ModDir, 'md', 'two.xml'), mdTwoText, 'utf8');
      fs.writeFileSync(
        path.join(u29ModDir, 'md', 'shared_override.xml'),
        '<?xml version="1.0" encoding="utf-8"?>\n<mdscript name="SharedOverride"><cues><cue name="OverrideCue"/></cues></mdscript>\n',
        'utf8',
      );
      fs.writeFileSync(
        path.join(u29ModDir, 'aiscripts', 'patrol.xml'),
        '<?xml version="1.0" encoding="utf-8"?>\n<aiscript name="unit29.patrol"><interrupts><library><actions name="SharedCueInterrupt"/></library></interrupts><attention min="unknown"><actions/></attention></aiscript>\n',
        'utf8',
      );

      // 1. Multi-source search_workspace_symbols over preset read MCP (authored > base > DLC > installed on same qualifiedName, zero ledger rows, zero host paths)
      const readList = ((await presetReadMcp.request('tools/list')).result?.tools || []).map((t: any) => t.name);
      assert(readList.includes('search_workspace_symbols'), 'preset read key must advertise search_workspace_symbols');
      assert(!readList.includes('rename_md_symbol'), 'preset read key must NOT advertise rename_md_symbol');

      const ledgerBefore = (await presetReadMcp.callTool('list_action_history', { limit: 100 })).payload.total;
      const symRes = await presetReadMcp.callTool('search_workspace_symbols', {
        q: 'OverrideCue',
        path: u29ModId,
        includeReference: true,
        includeInstalled: true,
        limit: 20,
      });
      assert.equal(symRes.isError, false, JSON.stringify(symRes.payload));
      assert.equal(symRes.payload.ok, true);
      assert.equal(symRes.payload.referenceIncluded, true);
      assert.equal(symRes.payload.installedIncluded, true);
      assert(!JSON.stringify(symRes.payload).includes(modsDir), 'search_workspace_symbols leaked host modsDir');
      assert(!JSON.stringify(symRes.payload).includes(corpusDir), 'search_workspace_symbols leaked host corpusDir');
      assert(!JSON.stringify(symRes.payload).includes(extensionsDir), 'search_workspace_symbols leaked host extensionsDir');
      const exactShared = (symRes.payload.symbols || []).filter((s: any) => s.qualifiedName === 'md.SharedOverride.OverrideCue');
      assert.deepEqual(
        exactShared.map((s: any) => s.sourceScope),
        ['authored', 'base', 'dlc', 'installed'],
        `Expected authored > base > dlc > installed ordering on matching qualifiedName, got: ${JSON.stringify(exactShared)}`,
      );

      // Qualified query disambiguates DLC script owner
      const dlcQualified = await presetReadMcp.callTool('search_workspace_symbols', {
        q: 'md.DlcMissions.SharedCue',
        path: u29ModId,
      });
      assert.equal(dlcQualified.isError, false);
      assert.equal(dlcQualified.payload.total, 1);
      assert.equal(dlcQualified.payload.symbols[0].sourceScope, 'dlc');

      // 2. Dry-run preview via rename_md_symbol (explicit grant): plans cross-file edits (including &#97; entity span) without mutating disk or Action Ledger
      const targetOffset = mdOneText.indexOf('name="SharedCue"') + 'name="Shared'.length - 1;
      const preview = await fullMcp.callTool('rename_md_symbol', {
        path: u29ModId,
        file: 'md/one.xml',
        offset: targetOffset,
        newName: 'RenamedSharedCue',
        apply: false,
      });
      assert.equal(preview.isError, false, JSON.stringify(preview.payload));
      assert.equal(preview.payload.applied, false);
      assert.equal(preview.payload.editCount, 3);
      assert.deepEqual(preview.payload.touchedFiles, ['md/one.xml', 'md/two.xml']);
      assert.equal(fs.readFileSync(path.join(u29ModDir, 'md', 'one.xml'), 'utf8'), mdOneText);
      assert.equal(fs.readFileSync(path.join(u29ModDir, 'md', 'two.xml'), 'utf8'), mdTwoText);
      const ledgerAfterPreview = (await presetReadMcp.callTool('list_action_history', { limit: 100 })).payload.total;
      assert.equal(ledgerAfterPreview, ledgerBefore, 'dry-run rename preview must not record an Action Ledger row');

      // 3. Refusal on casefolded collision (LocalHelper) and CAS conflict on stale expectedSha256ByFile
      const collision = await fullMcp.callTool('rename_md_symbol', {
        path: u29ModId,
        file: 'md/one.xml',
        offset: targetOffset,
        newName: 'localhelper',
        apply: false,
      });
      assert.equal(collision.isError, true);
      assert.equal(collision.payload?.code, 'MD_RENAME_REFUSED');

      const staleApply = await fullMcp.callTool('rename_md_symbol', {
        path: u29ModId,
        file: 'md/one.xml',
        offset: targetOffset,
        newName: 'RenamedSharedCue',
        apply: true,
        expectedSha256ByFile: {
          'md/one.xml': '0'.repeat(64),
          'md/two.xml': preview.payload.expectedSha256ByFile['md/two.xml'],
        },
      });
      assert.equal(staleApply.isError, true);
      assert.equal(staleApply.payload?.code, 'MD_RENAME_CONFLICT');
      assert.equal(fs.readFileSync(path.join(u29ModDir, 'md', 'one.xml'), 'utf8'), mdOneText);

      // 4. Valid CAS commit updates both MD files atomically, records Action Ledger diff, and refreshes symbol cache
      const committed = await fullMcp.callTool('rename_md_symbol', {
        path: u29ModId,
        file: 'md/one.xml',
        offset: targetOffset,
        newName: 'RenamedSharedCue',
        apply: true,
        expectedSha256ByFile: preview.payload.expectedSha256ByFile,
      });
      assert.equal(committed.isError, false, JSON.stringify(committed.payload));
      assert.equal(committed.payload.applied, true);
      assert.equal(committed.payload.editCount, 3);
      assert(fs.readFileSync(path.join(u29ModDir, 'md', 'one.xml'), 'utf8').includes('name="RenamedSharedCue"'));
      assert(fs.readFileSync(path.join(u29ModDir, 'md', 'two.xml'), 'utf8').includes('cue="md.Unit29One.RenamedSharedCue"'));

      const postRenameSym = await presetReadMcp.callTool('search_workspace_symbols', {
        q: 'RenamedSharedCue',
        path: u29ModId,
        includeReference: false,
        includeInstalled: false,
      });
      assert.equal(postRenameSym.isError, false);
      assert.equal(postRenameSym.payload.total, 1);
      assert.equal(postRenameSym.payload.symbols[0].qualifiedName, 'md.Unit29One.RenamedSharedCue');

      const editHistory = await fullMcp.callTool('list_action_history', { kind: 'edit', limit: 10 });
      const renameRow = (editHistory.payload.rows || []).find(
        (r: any) => Array.isArray(r.files) && r.files.includes(`${u29ModId}/md/one.xml`) && r.files.includes(`${u29ModId}/md/two.xml`),
      );
      assert(renameRow, `Expected multi-file rename row in Action Ledger: ${JSON.stringify(editHistory.payload.rows)}`);
    });

    await check('10_history_raw_blob_and_cas_workspace_snapshots_create_list_restore_delete_undo_over_mcp', async () => {
      // 1. Preset read MCP exposes read_action_history_blob and reads stored unified diff blob
      const readList = ((await presetReadMcp.request('tools/list')).result?.tools || []).map((t: any) => t.name);
      assert(readList.includes('read_action_history_blob'), 'preset read key must advertise read_action_history_blob');
      assert(!readList.includes('list_workspace_snapshots'), 'preset read key must not advertise explicit-grant snapshot tools');

      const editRows = await presetReadMcp.callTool('list_action_history', { kind: 'edit', limit: 10 });
      const diffRow = (editRows.payload.rows || []).find((r: any) => Array.isArray(r.files) && r.files.some((f: string) => f.includes('unit29_symbols_mod/md/one.xml')));
      assert(diffRow, 'Expected unit29 rename row in history');

      const rawDiff = await presetReadMcp.callTool('read_action_history_blob', {
        id: diffRow.id,
        which: 'diff',
      });
      assert.equal(rawDiff.isError, false, JSON.stringify(rawDiff.payload));
      assert.equal(rawDiff.payload.ok, true);
      assert.equal(rawDiff.payload.which, 'diff');
      assert.equal(rawDiff.payload.contentTruncated, false);
      assert(String(rawDiff.payload.content).includes('RenamedSharedCue'));

      // 2. create_workspace_snapshot + undo-create on a disposable second snapshot + list_workspace_snapshots
      const snap1 = await fullMcp.callTool('create_workspace_snapshot', {
        modId,
        name: 'Checkpoint Alpha',
      });
      assert.equal(snap1.isError, false, JSON.stringify(snap1.payload));
      assert.equal(snap1.payload.ok, true);
      assert.equal((snap1.payload as any).workspace, undefined, 'create_workspace_snapshot must not echo full workspace');
      assert.equal(snap1.payload.recovery?.operation, 'undo-create');
      const snap1Name = String(snap1.payload.snapshotName);
      const snap1Sha = String(snap1.payload.sha256);

      const snapTemp = await fullMcp.callTool('create_workspace_snapshot', {
        modId,
        name: 'Disposable Snapshot',
      });
      assert.equal(snapTemp.isError, false, JSON.stringify(snapTemp.payload));
      const undoneSnapTemp = await fullMcp.callTool('restore_workspace_file', {
        recoveryId: snapTemp.payload.recovery.id,
      });
      assert.equal(undoneSnapTemp.isError, false, JSON.stringify(undoneSnapTemp.payload));
      assert.equal(fs.existsSync(path.join(modDir, '.snapshots', snapTemp.payload.snapshotName)), false);

      const listed1 = await fullMcp.callTool('list_workspace_snapshots', { modId });
      assert.equal(listed1.isError, false, JSON.stringify(listed1.payload));
      assert.equal(listed1.payload.total, 1);
      assert.equal(listed1.payload.snapshots[0].snapshotName, snap1Name);
      assert.equal(listed1.payload.snapshots[0].sha256, snap1Sha);
      assert.equal(listed1.payload.snapshots[0].workspace, undefined);

      // 3. Mutate addressed workspace description, test stale CAS refusal on restore_workspace_snapshot, then commit restore + one-use revert via revert_action_history
      const wsBeforeMutate = await httpJson(backend!.baseUrl, 'GET', '/api/agent/workspace', STUDIO_TOKEN, undefined, wsHeaders);
      const mutatedRes = await httpJson(backend!.baseUrl, 'POST', '/api/agent/workspace/merge', STUDIO_TOKEN, {
        changes: { description: 'Mutated after Checkpoint Alpha' },
        expectedHead: wsBeforeMutate.json!.workspaceHash,
        expectedSnapshotHash: wsBeforeMutate.json!.snapshotHash,
      }, { ...wsHeaders, 'x-forge-operation-id': 'op_u30_mutate_before_restore' });
      assert.equal(mutatedRes.status, 200, JSON.stringify(mutatedRes.json));
      const mutatedHead = String(mutatedRes.json!.workspaceHash);
      const mutatedSnapHash = String(mutatedRes.json!.snapshotHash);

      const staleRestore = await fullMcp.callTool('restore_workspace_snapshot', {
        operationId: 'op_u30_stale_restore',
        modId,
        snapshotName: snap1Name,
        expectedHead: '0'.repeat(16),
        expectedSnapshotHash: mutatedSnapHash,
      });
      assert.equal(staleRestore.isError, true);
      assert.equal(staleRestore.payload?.code, 'WORKSPACE_SNAPSHOT_EXPECTED_HEAD_STALE');

      const okRestore = await fullMcp.callTool('restore_workspace_snapshot', {
        operationId: 'op_u30_ok_restore',
        modId,
        snapshotName: snap1Name,
        expectedHead: mutatedHead,
        expectedSnapshotHash: mutatedSnapHash,
      });
      assert.equal(okRestore.isError, false, JSON.stringify(okRestore.payload));
      assert.equal(okRestore.payload.applied, true);
      assert.equal(okRestore.payload.detail, 'compact');
      assert.equal(okRestore.payload.workspace, undefined);
      assert.equal(okRestore.payload.receipt?.status, 'committed');
      assert.equal(okRestore.payload.recovery?.kind, 'workspace');

      const snapHistory = await fullMcp.callTool('list_action_history', { kind: 'snapshot', limit: 10 });
      const restoreRow = (snapHistory.payload.rows || []).find((r: any) => r.recoveryId === okRestore.payload.receipt.id);
      assert(restoreRow && restoreRow.revertible === true, `Expected revertible snapshot restore row: ${JSON.stringify(snapHistory.payload.rows)}`);

      const revertedSnapRestore = await fullMcp.callTool('revert_action_history', { id: restoreRow.id });
      assert.equal(revertedSnapRestore.isError, false, JSON.stringify(revertedSnapRestore.payload));
      assert.equal(revertedSnapRestore.payload.workspaceHash, mutatedHead);

      // 4. delete_workspace_snapshot: stale expectedSha256 refused -> valid delete unlinks + returns one-use file recovery -> restore_workspace_file restores exact bytes
      const staleDelSnap = await fullMcp.callTool('delete_workspace_snapshot', {
        modId,
        snapshotName: snap1Name,
        expectedSha256: '0'.repeat(64),
      });
      assert.equal(staleDelSnap.isError, true);
      assert.equal(staleDelSnap.payload?.code, 'SNAPSHOT_CHANGED');
      assert.equal(fs.existsSync(path.join(modDir, '.snapshots', snap1Name)), true);

      const okDelSnap = await fullMcp.callTool('delete_workspace_snapshot', {
        modId,
        snapshotName: snap1Name,
        expectedSha256: snap1Sha,
      });
      assert.equal(okDelSnap.isError, false, JSON.stringify(okDelSnap.payload));
      assert.equal(okDelSnap.payload.removed?.sha256, snap1Sha);
      assert.equal(okDelSnap.payload.recovery?.operation, 'delete-file');
      assert.equal(fs.existsSync(path.join(modDir, '.snapshots', snap1Name)), false);

      const restoredDeletedSnap = await fullMcp.callTool('restore_workspace_file', {
        recoveryId: okDelSnap.payload.recovery.id,
      });
      assert.equal(restoredDeletedSnap.isError, false, JSON.stringify(restoredDeletedSnap.payload));
      assert.equal(fs.existsSync(path.join(modDir, '.snapshots', snap1Name)), true);

      const listedAfterRestore = await fullMcp.callTool('list_workspace_snapshots', { modId });
      assert.equal(listedAfterRestore.payload.total, 1);
      assert.equal(listedAfterRestore.payload.snapshots[0].sha256, snap1Sha);
    });

    await check('11_steam_release_prepare_verify_and_cas_workshop_id_adoption_over_mcp', async () => {
      const modId = 'unit31_steam_mod';
      const modDir = path.join(modsDir, modId);
      fs.mkdirSync(path.join(modDir, 'md'), { recursive: true });
      fs.mkdirSync(path.join(modDir, 'assets'), { recursive: true });
      const initialContentXml = [
        '<?xml version="1.0" encoding="utf-8"?>',
        `<content id="${modId}" name="Unit 31 Steam Mod" version="100" date="2026-11-24" author="Forge QA" description="Steam release MCP fixture"/>`,
      ].join('\n');
      fs.writeFileSync(path.join(modDir, 'content.xml'), initialContentXml, 'utf8');
      fs.writeFileSync(path.join(modDir, 'md', 'main.xml'), [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<mdscript name="Unit31SteamScript" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
        '  <cues>',
        '    <cue name="InitCue"><actions/></cue>',
        '  </cues>',
        '</mdscript>',
      ].join('\n'), 'utf8');
      fs.writeFileSync(path.join(modDir, 'assets', 'payload.txt'), 'steam catalog payload\n', 'utf8');
      // Minimal valid 1280x720 baseline SOF0 JPEG header accepted by inspectWorkshopPreview
      const validJpeg1280x720 = Buffer.from([
        0xff, 0xd8,
        0xff, 0xc0, 0x00, 0x0b, 0x08, 0x02, 0xd0, 0x05, 0x00, 0x01, 0x01, 0x11, 0x00,
        0xff, 0xd9,
      ]);
      fs.writeFileSync(path.join(modDir, 'preview.jpg'), validJpeg1280x720);

      // Preset deploy key must NOT advertise or execute Steam release tools
      const presetDeployMint = await httpJson(backend!.baseUrl, 'POST', '/api/agent/keys', STUDIO_TOKEN, {
        label: 'unit31-preset-deploy',
        scope: 'deploy',
        ttl: '1h',
        authorityMode: 'preset',
      }, wsHeaders);
      assert.equal(presetDeployMint.status, 200);
      const presetDeployMcp = await openMcp(String(presetDeployMint.json!.token || presetDeployMint.json!.key), wsId);
      const presetDeployTools: string[] = ((await presetDeployMcp.request('tools/list')).result?.tools || []).map((t: any) => t.name);
      for (const steamTool of ['prepare_steam_release', 'verify_steam_release', 'adopt_steam_workshop_id']) {
        assert(!presetDeployTools.includes(steamTool), `Preset deploy leaked ${steamTool}`);
      }
      await presetDeployMcp.close();

      // Mint explicit deploy grant with Steam release + artifact verify + history read
      const steamMint = await httpJson(backend!.baseUrl, 'POST', '/api/agent/keys', STUDIO_TOKEN, {
        label: 'unit31-steam-explicit',
        scope: 'deploy',
        ttl: '1h',
        authorityMode: 'exact',
        capabilityIdentities: [
          'history.list@2',
          'release.artifact.verify@1',
          'release.steam.adopt@1',
          'release.steam.prepare@1',
          'release.steam.verify@1',
        ],
        allowedEffects: ['read', 'analyze', 'filesystem-write', 'package', 'delete', 'audit-write', 'audit-retention-delete'],
      }, wsHeaders);
      assert.equal(steamMint.status, 200, JSON.stringify(steamMint.json));
      const steamMcp = await openMcp(String(steamMint.json!.token || steamMint.json!.key), wsId);
      const steamTools: string[] = ((await steamMcp.request('tools/list')).result?.tools || []).map((t: any) => t.name);
      for (const steamTool of ['prepare_steam_release', 'verify_steam_release', 'adopt_steam_workshop_id', 'verify_release_artifact']) {
        assert(steamTools.includes(steamTool), `Missing ${steamTool} in ${JSON.stringify(steamTools)}`);
      }

      // 1. prepare_steam_release stages CAT/DAT + preview + rollback backup ZIP with zero host-path leakage
      const prepared = await steamMcp.callTool('prepare_steam_release', {
        path: modId,
        bump: 'patch',
        previewFile: 'preview.jpg',
        changeNote: 'Initial Steam release from MCP',
      });
      assert.equal(prepared.isError, false, JSON.stringify(prepared.payload));
      assert.equal(prepared.payload.ok, true);
      assert.equal(prepared.payload.platform, 'steam');
      assert.equal(prepared.payload.modId, modId);
      assert.equal(prepared.payload.targetFolder, modId);
      assert.equal(prepared.payload.sourceManifestAdoptionAvailable, true);
      assert(!JSON.stringify(prepared.payload).includes(modsDir), 'Steam prepare leaked host modsDir');

      // Verify rollback backup ZIP on disk via verify_release_artifact
      const backupVerified = await steamMcp.callTool('verify_release_artifact', {
        platform: 'steam',
        modId,
        artifactFile: prepared.payload.backupFile,
      });
      assert.equal(backupVerified.isError, false, JSON.stringify(backupVerified.payload));
      assert.equal(backupVerified.payload.verified, true);
      assert.equal(backupVerified.payload.sha256, prepared.payload.backupHash);

      // 2. verify_steam_release refuses before WorkshopTool writes ws_<numeric>
      const verifyBeforeTool = await steamMcp.callTool('verify_steam_release', { modId });
      assert.equal(verifyBeforeTool.isError, true);
      assert.equal(verifyBeforeTool.payload?.code, 'STEAM_WORKSHOP_ID_MISSING');

      // Simulate WorkshopTool writing ws_987654321 into staged content.xml + test CAT tamper refusal + restore CAT + verify clean
      const stagedDir = path.join(modsDir, '.forge-builds', 'releases', 'steam', modId);
      const stagedContentPath = path.join(stagedDir, 'content.xml');
      const stagedBeforeTool = fs.readFileSync(stagedContentPath, 'utf8');
      const stagedAfterTool = stagedBeforeTool.replace(`id="${modId}"`, 'id="ws_987654321"');
      fs.writeFileSync(stagedContentPath, stagedAfterTool, 'utf8');

      const catPath = path.join(stagedDir, 'ext_01.cat');
      const pristineCat = fs.readFileSync(catPath);
      fs.appendFileSync(catPath, Buffer.from('\ntampered'));
      const tamperedVerify = await steamMcp.callTool('verify_steam_release', { modId });
      assert.equal(tamperedVerify.isError, true);
      assert.equal(tamperedVerify.payload?.code, 'STEAM_POST_TOOL_INTEGRITY_FAILED');
      fs.writeFileSync(catPath, pristineCat);

      const okVerify = await steamMcp.callTool('verify_steam_release', { modId });
      assert.equal(okVerify.isError, false, JSON.stringify(okVerify.payload));
      assert.equal(okVerify.payload.status, 'VERIFIED_AFTER_WORKSHOP_TOOL');
      assert.equal(okVerify.payload.workshopId, 'ws_987654321');
      assert.equal(okVerify.payload.sourceManifestAdoptionRequired, true);
      assert(!JSON.stringify(okVerify.payload).includes(modsDir), 'Steam verify leaked host modsDir');

      // 3. adopt_steam_workshop_id preview (quiet in Action Ledger) -> wrong bindingHash refused -> valid CAS apply adopts ws_987654321
      const pkgHistBeforePreview = await steamMcp.callTool('list_action_history', { kind: 'package', limit: 20 });
      const pkgCountBeforePreview = (pkgHistBeforePreview.payload.rows || []).length;

      const adoptPreview = await steamMcp.callTool('adopt_steam_workshop_id', {
        modId,
        apply: false,
      });
      assert.equal(adoptPreview.isError, false, JSON.stringify(adoptPreview.payload));
      assert.equal(adoptPreview.payload.status, 'READY_TO_ADOPT');
      assert.equal(adoptPreview.payload.sourceManifestFile, `${modId}/content.xml`);
      assert.equal(adoptPreview.payload.sourceWritePerformed, false);
      assert(!JSON.stringify(adoptPreview.payload).includes(modsDir), 'Steam adopt preview leaked host modsDir');

      const pkgHistAfterPreview = await steamMcp.callTool('list_action_history', { kind: 'package', limit: 20 });
      assert.equal((pkgHistAfterPreview.payload.rows || []).length, pkgCountBeforePreview, 'Dry-run Steam adoption preview must stay quiet in Action Ledger');

      const badBindingAdopt = await steamMcp.callTool('adopt_steam_workshop_id', {
        modId,
        apply: true,
        expectedSourceSha256: adoptPreview.payload.beforeSha256,
        expectedWorkshopId: 'ws_987654321',
        expectedBindingHash: '0'.repeat(64),
      });
      assert.equal(badBindingAdopt.isError, true);
      assert.equal(badBindingAdopt.payload?.code, 'STEAM_ADOPTION_PREVIEW_CHANGED');
      assert.equal(fs.readFileSync(path.join(modDir, 'content.xml'), 'utf8'), initialContentXml);

      const okAdopt = await steamMcp.callTool('adopt_steam_workshop_id', {
        modId,
        apply: true,
        expectedSourceSha256: adoptPreview.payload.beforeSha256,
        expectedWorkshopId: 'ws_987654321',
        expectedBindingHash: adoptPreview.payload.bindingHash,
      });
      assert.equal(okAdopt.isError, false, JSON.stringify(okAdopt.payload));
      assert.equal(okAdopt.payload.status, 'VERIFIED_AND_ADOPTED');
      assert.equal(okAdopt.payload.sourceWritePerformed, true);
      assert(fs.readFileSync(path.join(modDir, 'content.xml'), 'utf8').includes('id="ws_987654321"'));
      assert(!JSON.stringify(okAdopt.payload).includes(modsDir), 'Steam adopt apply leaked host modsDir');
      await steamMcp.close();
    });

    await check('12_project_inventory_mod_scaffold_undo_and_cas_directory_delete_restore_over_mcp', async () => {
      // 1. get_project_file_inventory returns redacted B100 ownership metadata
      const inv = await fullMcp.callTool('get_project_file_inventory', { modId: 'mcp_files_fixture' });
      assert.equal(inv.isError, false, JSON.stringify(inv.payload));
      assert.equal(inv.payload.ok, true);
      assert.equal(inv.payload.sourceAvailable, true);
      assert.equal(inv.payload.sourceFolder, 'mcp_files_fixture');
      assert(Array.isArray(inv.payload.entries) && inv.payload.entries.length >= 2);
      assert(!JSON.stringify(inv.payload).includes(modsDir), 'get_project_file_inventory leaked host modsDir');

      // 2. scaffold_mod_project preview (quiet in Action Ledger) -> apply -> duplicate refused -> modified undo refused -> restored -> clean undo removes folder
      const editBeforePreview = await fullMcp.callTool('list_action_history', { kind: 'edit', limit: 30 });
      const editCountBeforePreview = (editBeforePreview.payload.rows || []).length;

      const scaffoldModId = 'unit32_scaffolded_mod';
      const scaffoldDir = path.join(modsDir, scaffoldModId);
      const scafPreview = await fullMcp.callTool('scaffold_mod_project', {
        id: scaffoldModId,
        name: 'Unit 32 Scaffolded Mod',
        starterKind: 'md_cue',
        apply: false,
      });
      assert.equal(scafPreview.isError, false, JSON.stringify(scafPreview.payload));
      assert.equal(scafPreview.payload.applied, false);
      assert.equal(scafPreview.payload.fileCount, 2);
      assert.equal(fs.existsSync(scaffoldDir), false);

      const editAfterPreview = await fullMcp.callTool('list_action_history', { kind: 'edit', limit: 30 });
      assert.equal((editAfterPreview.payload.rows || []).length, editCountBeforePreview, 'scaffold preview must remain quiet in Action Ledger');

      const scafApply = await fullMcp.callTool('scaffold_mod_project', {
        id: scaffoldModId,
        name: 'Unit 32 Scaffolded Mod',
        starterKind: 'md_cue',
        deps: [{ id: 'ego_dlc_split', optional: true }],
        apply: true,
      });
      assert.equal(scafApply.isError, false, JSON.stringify(scafApply.payload));
      assert.equal(scafApply.payload.applied, true);
      assert.equal(scafApply.payload.recovery?.operation, 'undo-create-dir');
      assert(!JSON.stringify(scafApply.payload).includes(modsDir), 'scaffold_mod_project leaked host modsDir');
      assert.equal(fs.existsSync(path.join(scaffoldDir, 'md', `${scaffoldModId}.xml`)), true);

      const scafDup = await fullMcp.callTool('scaffold_mod_project', {
        id: scaffoldModId,
        apply: true,
      });
      assert.equal(scafDup.isError, true);
      assert.equal(scafDup.payload?.code, 'MOD_FOLDER_ALREADY_EXISTS');

      // 3. remove_workspace_directory refuses .git-protected folders, previews treeSha256 (quiet), refuses stale treeSha256, deletes & restores nested tree via restore_workspace_file
      const gitProtectedDir = path.join(modsDir, 'unit32_git_protected');
      fs.mkdirSync(path.join(gitProtectedDir, '.git'), { recursive: true });
      fs.writeFileSync(path.join(gitProtectedDir, 'content.xml'), '<content id="unit32_git_protected"/>', 'utf8');
      fs.writeFileSync(path.join(gitProtectedDir, '.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf8');
      const protectedDel = await fullMcp.callTool('remove_workspace_directory', {
        path: 'unit32_git_protected',
        apply: false,
      });
      assert.equal(protectedDel.isError, true);
      assert.equal(protectedDel.payload?.code, 'DIRECTORY_CONTAINS_PROTECTED_ENTRIES');
      assert.equal(fs.existsSync(path.join(gitProtectedDir, '.git', 'HEAD')), true);

      const dirPreview = await fullMcp.callTool('remove_workspace_directory', {
        path: `${scaffoldModId}/md`,
        apply: false,
      });
      assert.equal(dirPreview.isError, false, JSON.stringify(dirPreview.payload));
      assert.equal(dirPreview.payload.applied, false);
      assert.equal(dirPreview.payload.fileCount, 1);

      const staleDirDel = await fullMcp.callTool('remove_workspace_directory', {
        path: `${scaffoldModId}/md`,
        apply: true,
        expectedTreeSha256: 'f'.repeat(64),
      });
      assert.equal(staleDirDel.isError, true);
      assert.equal(staleDirDel.payload?.code, 'DIRECTORY_CHANGED');
      assert.equal(fs.existsSync(path.join(scaffoldDir, 'md', `${scaffoldModId}.xml`)), true);

      const okDirDel = await fullMcp.callTool('remove_workspace_directory', {
        path: `${scaffoldModId}/md`,
        apply: true,
        expectedTreeSha256: dirPreview.payload.treeSha256,
      });
      assert.equal(okDirDel.isError, false, JSON.stringify(okDirDel.payload));
      assert.equal(okDirDel.payload.recovery?.operation, 'delete-dir');
      assert(!JSON.stringify(okDirDel.payload).includes(modsDir), 'remove_workspace_directory leaked host modsDir');
      assert.equal(fs.existsSync(path.join(scaffoldDir, 'md')), false);

      // While md/ is deleted, undo-create-dir of scaffoldModId must fail closed with 409 RECOVERY_STALE!
      const staleScaffoldUndo = await fullMcp.callTool('restore_workspace_file', {
        recoveryId: scafApply.payload.recovery.id,
      });
      assert.equal(staleScaffoldUndo.isError, true);
      assert.equal(staleScaffoldUndo.payload?.code, 'RECOVERY_STALE');
      assert.equal(fs.existsSync(path.join(scaffoldDir, 'content.xml')), true);

      // Restore deleted md/ directory via restore_workspace_file -> exact tree matches again -> undo-create-dir succeeds via revert_action_history!
      const restoredSubdir = await fullMcp.callTool('restore_workspace_file', {
        recoveryId: okDirDel.payload.recovery.id,
      });
      assert.equal(restoredSubdir.isError, false, JSON.stringify(restoredSubdir.payload));
      assert.equal(restoredSubdir.payload.action, 'restored-directory');
      assert.equal(fs.existsSync(path.join(scaffoldDir, 'md', `${scaffoldModId}.xml`)), true);

      const editRows = await fullMcp.callTool('list_action_history', { kind: 'edit', limit: 20 });
      const scaffoldRow = (editRows.payload.rows || []).find((r: any) => r.recoveryId === scafApply.payload.recovery.id);
      assert(scaffoldRow && scaffoldRow.revertible === true, 'scaffold ledger row must be revertible');

      const undoneScaffold = await fullMcp.callTool('revert_action_history', { id: scaffoldRow.id });
      assert.equal(undoneScaffold.isError, false, JSON.stringify(undoneScaffold.payload));
      assert.equal(fs.existsSync(scaffoldDir), false);
    });

    await check('13_contracts_patch_base_xpath_extension_file_and_reference_coverage_over_mcp', async () => {
      const regRes = await presetReadMcp.callTool('list_external_api_contracts', { full: '0' });
      assert.equal(regRes.isError, false, JSON.stringify(regRes.payload));
      assert.equal(regRes.payload.ok, true);
      assert(Array.isArray(regRes.payload.apis));
      assert(!JSON.stringify(regRes.payload).includes(root), 'list_external_api_contracts leaked host root');

      const deriveRes = await presetReadMcp.callTool('derive_external_api_contract', { ext: 'mod_alpha' });
      assert.equal(deriveRes.isError, false, JSON.stringify(deriveRes.payload));
      assert.equal(deriveRes.payload.ok, true);
      assert.equal(deriveRes.payload.extensionFolder, 'mod_alpha');
      assert.equal(deriveRes.payload.sourceKind, 'extensions');
      assert(!JSON.stringify(deriveRes.payload).includes(root), 'derive_external_api_contract leaked host root');

      const deriveMissing = await presetReadMcp.callTool('derive_external_api_contract', { ext: 'nonexistent_ext_xyz' });
      assert.equal(deriveMissing.isError, true);
      assert(String(deriveMissing.payload).includes('was not found under configured roots'), JSON.stringify(deriveMissing.payload));
      assert(!JSON.stringify(deriveMissing.payload).includes(root), 'derive_external_api_contract 404 leaked host root');

      const extFileRes = await presetReadMcp.callTool('read_extension_file', { path: 'mod_alpha/md/installed_missions.xml' });
      assert.equal(extFileRes.isError, false, JSON.stringify(extFileRes.payload));
      assert.equal(extFileRes.payload.ok, true);
      assert.equal(extFileRes.payload.source, 'loose');
      assert(String(extFileRes.payload.content || '').includes('InstalledMissions'));
      assert(!JSON.stringify(extFileRes.payload).includes(root), 'read_extension_file leaked host root');

      const extTraversal = await presetReadMcp.callTool('read_extension_file', { path: 'mod_alpha/../../X4.exe' });
      assert.equal(extTraversal.isError, true);
      assert(String(extTraversal.payload).includes('extensions.file.read requires'), JSON.stringify(extTraversal.payload));

      // Packedbase fallback via 01.cat/01.dat on maps/xu_ep2_universe/galaxy.xml and extension-loose on libraries/wares.xml
      const patchBasePacked = await presetReadMcp.callTool('read_patch_base_content', { targetFile: 'maps/xu_ep2_universe/galaxy.xml' });
      assert.equal(patchBasePacked.isError, false, JSON.stringify(patchBasePacked.payload));
      assert.equal(patchBasePacked.payload.ok, true);
      assert.equal(patchBasePacked.payload.source, 'packed');
      assert.equal(patchBasePacked.payload.sourceKind, 'packed');
      assert.equal(patchBasePacked.payload.archive, '01.cat');
      assert(!JSON.stringify(patchBasePacked.payload).includes(root), 'read_patch_base_content leaked host root');

      const xpathRes = await presetReadMcp.callTool('complete_xpath_selector', {
        path: 'libraries/wares.xml',
        selector: '/wares/',
        cursor: 7,
        limit: 20,
      });
      assert.equal(xpathRes.isError, false, JSON.stringify(xpathRes.payload));
      assert.equal(xpathRes.payload.ok, true);
      assert.equal(xpathRes.payload.path, 'libraries/wares.xml');
      assert(Array.isArray(xpathRes.payload.items) && xpathRes.payload.items.length > 0);
      assert(!JSON.stringify(xpathRes.payload).includes(root), 'complete_xpath_selector leaked host root');

      const covRes = await presetReadMcp.callTool('get_reference_coverage', {});
      assert.equal(covRes.isError, false, JSON.stringify(covRes.payload));
      assert.equal(covRes.payload.ok, true);
      assert.equal(covRes.payload.ready, true);
      assert(covRes.payload.coverage && typeof covRes.payload.coverage === 'object');
      assert(!JSON.stringify(covRes.payload).includes(root), 'get_reference_coverage leaked host root');

      const aiOrdersRes = await presetReadMcp.callTool('list_reference_aiscripts', {
        orderOnly: '1',
        category: 'combat',
      });
      assert.equal(aiOrdersRes.isError, false, JSON.stringify(aiOrdersRes.payload));
      assert.equal(aiOrdersRes.payload.ok, true);
      assert.equal(aiOrdersRes.payload.total, 2);
      assert.equal(aiOrdersRes.payload.orderCount, 1);
      assert.equal(aiOrdersRes.payload.filteredTotal, 1);
      assert.equal(aiOrdersRes.payload.items?.[0]?.order?.id, 'Attack');
      assert(!JSON.stringify(aiOrdersRes.payload).includes(root), 'list_reference_aiscripts leaked host root');

      const snippetsRes = await presetReadMcp.callTool('list_lua_ui_snippets', {});
      assert.equal(snippetsRes.isError, false, JSON.stringify(snippetsRes.payload));
      assert.equal(snippetsRes.payload.ok, true);
      assert(Array.isArray(snippetsRes.payload.snippets) && snippetsRes.payload.total >= 1);

      const uiPreviewRes = await presetReadMcp.callTool('preview_x4_ui_lua', {
        mode: 'inline',
        path: 'ui/addons/dogfood/tab_orders.lua',
        content: [
          'local M = {}',
          'function M.renderTab(frame, headerTitle)',
          '  local tbl = frame:addTable(2, { width = 480, reserveScrollBar = false, scaling = false })',
          '  local row = tbl:addRow(false, { scaling = false })',
          '  row[1]:createText(headerTitle, { height = 20, scaling = false })',
          '  row[2]:createText("Ready", { height = 20, scaling = false })',
          'end',
          'return M',
        ].join('\n'),
        fixture: { samples: { headerTitle: 'Chain of Command' } },
      });
      assert.equal(uiPreviewRes.isError, false, JSON.stringify(uiPreviewRes.payload));
      assert.equal(uiPreviewRes.payload.ok, true);
      assert.equal(uiPreviewRes.payload.schema, 'forge.x4-ui-preview.v1');
      assert.equal(uiPreviewRes.payload.previewHarness, 'shared-frame-parameter');
      assert.equal(uiPreviewRes.payload.layout?.tableCount, 1);
      assert(!JSON.stringify(uiPreviewRes.payload).includes(root), 'preview_x4_ui_lua leaked host root');

      const harvestRes = await presetReadMcp.callTool('harvest_vanilla_ui_menus', { limit: '10' });
      assert.equal(harvestRes.isError, false, JSON.stringify(harvestRes.payload));
      assert.equal(harvestRes.payload.ok, true);
      assert(Array.isArray(harvestRes.payload.menus));
      assert(!JSON.stringify(harvestRes.payload).includes(root), 'harvest_vanilla_ui_menus leaked host root');
    });

    await check('14_help_knowledge_sanitized_bug_report_and_runtime_probes_over_mcp', async () => {
      const wikiRes = await presetReadMcp.callTool('query_forge_knowledge', {
        section: 'wiki',
        category: 'luaui',
        q: 'kuertee',
      });
      assert.equal(wikiRes.isError, false, JSON.stringify(wikiRes.payload));
      assert.equal(wikiRes.payload.ok, true);
      assert.equal(wikiRes.payload.wikiTopics.length, 1);
      assert.equal(wikiRes.payload.wikiTopics[0].id, 'luaui_kuertee_compat');
      assert.equal(wikiRes.payload.shortcuts.length, 0);

      const onboardingRes = await presetReadMcp.callTool('query_forge_knowledge', {
        section: 'onboarding',
        q: 'gamestart',
      });
      assert.equal(onboardingRes.isError, false, JSON.stringify(onboardingRes.payload));
      assert(onboardingRes.payload.starterGuides.some((g: any) => g.id === 'custom_gamestart' && g.rail?.tweakHint));

      const bugRes = await presetReadMcp.callTool('prepare_bug_report', {
        title: 'MCP Bug Bundle Test',
        description: `Secret x4fk_0123456789abcdef0123456789abcdef at ${root}\\secret.xml`,
        extraContext: { LocalPath: `${root}\\nested\\file.xml` },
      });
      assert.equal(bugRes.isError, false, JSON.stringify(bugRes.payload));
      assert.equal(bugRes.payload.ok, true);
      assert(String(bugRes.payload.issueUrl).startsWith('https://github.com/KennyG1990/X4_Forge/issues/new?labels=bug&'));
      assert(!JSON.stringify(bugRes.payload).includes('x4fk_0123'), 'prepare_bug_report leaked agent key');
      assert(!JSON.stringify(bugRes.payload).includes(root), 'prepare_bug_report leaked host root');
      assert(String(bugRes.payload.body).includes('[redacted]'));

      const bugBad = await presetReadMcp.callTool('prepare_bug_report', { title: '   ' });
      assert.equal(bugBad.isError, true);
      assert(String(bugBad.payload).includes('printable title'), JSON.stringify(bugBad.payload));

      const healthRes = await presetReadMcp.callTool('get_forge_health_card', {});
      assert.equal(healthRes.isError, false, JSON.stringify(healthRes.payload));
      assert.equal(healthRes.payload.ok, true);
      assert.equal(healthRes.payload.rows.length, 10);
      assert(!JSON.stringify(healthRes.payload).includes(root), 'get_forge_health_card leaked host root');

      const probeRes = await presetReadMcp.callTool('preview_forge_probe', {
        topics: [{ topic: 'economy', fields: [{ key: 'money', expression: 'player.money' }] }],
      });
      assert.equal(probeRes.isError, false, JSON.stringify(probeRes.payload));
      assert.equal(probeRes.payload.ok, true);
      assert.equal(probeRes.payload.readOnly, true);
      assert(String(probeRes.payload.md).includes('FORGE-STATE economy {'));

      const stateRes = await presetReadMcp.callTool('get_live_forge_state', {});
      assert.equal(stateRes.isError, false, JSON.stringify(stateRes.payload));
      assert.equal(stateRes.payload.ok, true);
      assert.equal(typeof stateRes.payload.available, 'boolean');
      assert(!JSON.stringify(stateRes.payload).includes(root), 'get_live_forge_state leaked host root');
    });

    await check('15_workspace_domain_read_and_cas_domain_authoring_with_undo_over_mcp', async () => {
      // 1. Standard preset read key can inspect all 7 domains without 50-node truncation or host-path leakage
      for (const domain of ['aiscripts', 'integration_contract', 'libraries', 'md_graph', 'translations', 'ui_layout', 'xml_patches'] as const) {
        const readDom = await presetReadMcp.callTool('get_workspace_domain', { domain });
        assert.equal(readDom.isError, false, `get_workspace_domain(${domain}): ${JSON.stringify(readDom.payload)}`);
        assert.equal(readDom.payload.ok, true);
        assert.equal(readDom.payload.domain, domain);
        assert.equal(typeof readDom.payload.workspaceHash, 'string');
        assert.equal(typeof readDom.payload.snapshotHash, 'string');
        assert(!JSON.stringify(readDom.payload).includes(root), `get_workspace_domain(${domain}) leaked host root`);
      }

      const libBefore = await fullMcp.callTool('get_workspace_domain', { domain: 'libraries' });
      assert.equal(libBefore.isError, false, JSON.stringify(libBefore.payload));
      const beforeWaresCount = (libBefore.payload.data?.wares || []).length;

      // 2. Cross-domain field injection is rejected before mutation
      const crossBad = await fullMcp.callTool('update_workspace_domain', {
        domain: 'translations',
        changes: { wares: [] },
        apply: false,
      });
      assert.equal(crossBad.isError, true);
      assert.equal(crossBad.payload?.code, 'CAPABILITY_INPUT_INVALID');

      // 3. Dry-run preview (apply: false) runs diagnostics & returns candidate hashes while staying quiet in Action Ledger
      const wsHistBeforePreview = await fullMcp.callTool('list_action_history', { kind: 'workspace', limit: 30 });
      const wsCountBeforePreview = (wsHistBeforePreview.payload.rows || []).length;

      const wareCandidate = {
        id: 'ware_unit35_cell',
        name: 'Unit 35 Quantum Cell',
        description: 'Domain MCP test ware',
        transport: 'container',
        volume: 4,
        minPrice: 100,
        avgPrice: 150,
        maxPrice: 200,
        prodTime: 60,
        prodAmount: 10,
      };
      const libPreview = await fullMcp.callTool('update_workspace_domain', {
        domain: 'libraries',
        changes: {
          wares: [wareCandidate],
          compileEnabled: false,
        },
        apply: false,
      });
      assert.equal(libPreview.isError, false, JSON.stringify(libPreview.payload));
      assert.equal(libPreview.payload.applied, false);
      assert.equal(libPreview.payload.data?.wares?.length, 1);
      assert(!JSON.stringify(libPreview.payload).includes(root), 'update_workspace_domain preview leaked host root');

      const wsHistAfterPreview = await fullMcp.callTool('list_action_history', { kind: 'workspace', limit: 30 });
      assert.equal((wsHistAfterPreview.payload.rows || []).length, wsCountBeforePreview, 'Dry-run domain preview must stay quiet in Action Ledger');

      // 4. Stale expectedHead is rejected 409 without mutating workspace
      const staleCommit = await fullMcp.callTool('update_workspace_domain', {
        domain: 'libraries',
        changes: { wares: [wareCandidate] },
        apply: true,
        operationId: 'op_unit35_domain_stale_1',
        expectedHead: '0'.repeat(16),
        expectedSnapshotHash: libBefore.payload.snapshotHash,
      });
      assert.equal(staleCommit.isError, true);
      assert.equal(staleCommit.payload?.error, 'head_conflict');

      // 5. Valid CAS apply commits isolated domain update while preserving sibling compileSettings, records Action Receipt + revertible ledger row, and reverts cleanly
      const committed = await fullMcp.callTool('update_workspace_domain', {
        domain: 'libraries',
        changes: {
          wares: [wareCandidate],
          compileEnabled: false,
        },
        apply: true,
        operationId: 'op_unit35_domain_commit_1',
        expectedHead: libBefore.payload.workspaceHash,
        expectedSnapshotHash: libBefore.payload.snapshotHash,
      });
      assert.equal(committed.isError, false, JSON.stringify(committed.payload));
      assert.equal(committed.payload.applied, true);
      assert.equal(committed.payload.receipt?.status, 'committed');
      assert.equal(committed.payload.recovery?.kind, 'workspace');
      assert.equal(committed.payload.data?.wares?.[0]?.id, 'ware_unit35_cell');
      assert(!JSON.stringify(committed.payload).includes(root), 'update_workspace_domain apply leaked host root');

      const libAfterCommit = await presetReadMcp.callTool('get_workspace_domain', { domain: 'libraries' });
      assert.equal(libAfterCommit.payload.data?.wares?.length, 1);
      assert.equal(libAfterCommit.payload.compileSettings?.library, false);
      assert.equal(libAfterCommit.payload.compileSettings?.md, true);

      const wsHistAfterCommit = await fullMcp.callTool('list_action_history', { kind: 'workspace', limit: 10 });
      const domainRow = (wsHistAfterCommit.payload.rows || []).find(
        (r: any) => r.revertible === true && String(r.title || '').includes('libraries domain model'),
      );
      assert(domainRow, `Expected revertible libraries domain row in ${JSON.stringify(wsHistAfterCommit.payload.rows)}`);

      const undone = await fullMcp.callTool('revert_action_history', { id: domainRow.id });
      assert.equal(undone.isError, false, JSON.stringify(undone.payload));
      assert.equal(undone.payload.ok, true);

      const libAfterUndo = await presetReadMcp.callTool('get_workspace_domain', { domain: 'libraries' });
      assert.equal((libAfterUndo.payload.data?.wares || []).length, beforeWaresCount);
      assert.equal(libAfterUndo.payload.compileSettings?.library, true);
    });

    await check('16_integration_contract_domain_glue_preview_patch_audit_schema_domain_and_ai_usage_over_mcp', async () => {
      const readList = ((await presetReadMcp.request('tools/list')).result?.tools || []).map((t: any) => t.name);
      for (const expectedTool of ['get_ai_spend_status', 'preview_contract_glue', 'audit_workspace_patches', 'inspect_schema_domain']) {
        assert(readList.includes(expectedTool), `preset read key must advertise ${expectedTool}`);
      }

      const ledgerBefore = (await presetReadMcp.callTool('list_action_history', { limit: 100 })).payload.total;

      // 1. get_ai_spend_status returns daily spend meter snapshot without key/prompt/path leaks
      const aiUsage = await presetReadMcp.callTool('get_ai_spend_status', {});
      assert.equal(aiUsage.isError, false, JSON.stringify(aiUsage.payload));
      assert.equal(aiUsage.payload.ok, true);
      assert.match(String(aiUsage.payload.day), /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(typeof aiUsage.payload.cap, 'number');
      assert.equal(typeof aiUsage.payload.usdCap, 'number');
      assert.equal(typeof aiUsage.payload.meterAvailable, 'boolean');
      assert(!JSON.stringify(aiUsage.payload).includes(root), 'get_ai_spend_status leaked host root');

      // 2. inspect_schema_domain supports refresh + per-domain element index while redacting host paths
      const schemaList = await presetReadMcp.callTool('inspect_schema_domain', { refresh: '1' });
      assert.equal(schemaList.isError, false, JSON.stringify(schemaList.payload));
      assert.equal(schemaList.payload.ok, true);
      assert(schemaList.payload.domainCount >= 1);
      assert(!JSON.stringify(schemaList.payload).includes(root), 'inspect_schema_domain leaked host root');
      assert(!JSON.stringify(schemaList.payload).includes(schemaDir), 'inspect_schema_domain leaked schemaDir');

      const mdDomain = await presetReadMcp.callTool('inspect_schema_domain', { domain: 'md', limit: '5' });
      assert.equal(mdDomain.isError, false, JSON.stringify(mdDomain.payload));
      assert.equal(mdDomain.payload.domainIndex?.domain, 'md');
      assert(Array.isArray(mdDomain.payload.domainIndex?.elements));
      assert(mdDomain.payload.domainIndex.elements.length <= 5);
      assert(!JSON.stringify(mdDomain.payload).includes(schemaDir), 'inspect_schema_domain(domain=md) leaked schemaDir');

      const missingDomain = await presetReadMcp.callTool('inspect_schema_domain', { domain: 'does_not_exist_domain' });
      assert.equal(missingDomain.isError, true);
      assert.match(String(missingDomain.payload), /Unknown schema domain: does_not_exist_domain/);
      assert(!String(missingDomain.payload).includes(schemaDir), 'inspect_schema_domain(404) leaked schemaDir');

      // 3. audit_workspace_patches supports selftest and addressed workspace modes without host paths
      const patchSelftest = await presetReadMcp.callTool('audit_workspace_patches', { mode: 'selftest' });
      assert.equal(patchSelftest.isError, false, JSON.stringify(patchSelftest.payload));
      assert.equal(patchSelftest.payload.pass, true);
      assert.equal(patchSelftest.payload.summary?.resolved, 1);
      assert.equal(patchSelftest.payload.summary?.unresolved, 1);
      assert.equal(patchSelftest.payload.summary?.rootMismatch, 1);

      const patchWsEmpty = await presetReadMcp.callTool('audit_workspace_patches', { mode: 'workspace' });
      assert.equal(patchWsEmpty.isError, false, JSON.stringify(patchWsEmpty.payload));
      assert.equal(patchWsEmpty.payload.mode, 'workspace');
      assert(!JSON.stringify(patchWsEmpty.payload).includes(root), 'audit_workspace_patches leaked host root');

      // 4. preview_contract_glue sample + inline + empty workspace before authoring
      const sampleGlue = await presetReadMcp.callTool('preview_contract_glue', { mode: 'sample' });
      assert.equal(sampleGlue.isError, false, JSON.stringify(sampleGlue.payload));
      assert.equal(sampleGlue.payload.available, true);
      assert.equal(sampleGlue.payload.errorCount, 0);
      assert(String(sampleGlue.payload.lua).includes('myai.get_status'));
      assert(String(sampleGlue.payload.mdScript).includes('mymod_http'));

      const wsGlueBefore = await presetReadMcp.callTool('preview_contract_glue', { mode: 'workspace' });
      assert.equal(wsGlueBefore.isError, false, JSON.stringify(wsGlueBefore.payload));
      assert.equal(wsGlueBefore.payload.available, false);
      assert.equal(wsGlueBefore.payload.contract, null);

      const ledgerAfterReads = (await presetReadMcp.callTool('list_action_history', { limit: 100 })).payload.total;
      assert.equal(ledgerAfterReads, ledgerBefore, 'read/analyze Slice 13 MCP calls must stay quiet in Action Ledger');

      // 5. Invalid integration_contract is rejected before mutation; valid CAS authoring + workspace glue preview + null clearing succeed
      const contractBefore = await fullMcp.callTool('get_workspace_domain', { domain: 'integration_contract' });
      assert.equal(contractBefore.isError, false, JSON.stringify(contractBefore.payload));
      assert.equal(contractBefore.payload.data?.integrationContract, null);

      const badContract = await fullMcp.callTool('update_workspace_domain', {
        domain: 'integration_contract',
        changes: {
          integrationContract: {
            namespace: 'Bad-Namespace',
            baseUrl: 'ftp://invalid',
            endpoints: [],
          },
        },
        apply: false,
      });
      assert.equal(badContract.isError, true);
      assert.equal(badContract.payload?.code, 'CAPABILITY_INPUT_INVALID');

      const validContract = {
        namespace: 'unit36bridge',
        baseUrl: 'http://127.0.0.1:8799',
        endpoints: [
          {
            id: 'ping',
            method: 'GET',
            path: '/v1/ping',
            response: [{ name: 'ok', type: 'boolean', required: true }],
          },
          {
            id: 'dispatch_job',
            kind: 'file_bridge',
            request: [{ name: 'prompt', type: 'string', required: true }],
            response: [{ name: 'reply', type: 'string' }],
            fileBridge: {
              directory: 'x4_unit36_bridge',
              requestFile: 'job_req.json',
              responseFile: 'job_res.json',
              pollInterval: '1s',
              timeout: '10s',
            },
          },
        ],
      };

      const committedContract = await fullMcp.callTool('update_workspace_domain', {
        domain: 'integration_contract',
        changes: {
          integrationContract: validContract,
          customLua: '-- unit36 custom lua hook\n',
        },
        apply: true,
        operationId: 'op_unit36_contract_commit_1',
        expectedHead: contractBefore.payload.workspaceHash,
        expectedSnapshotHash: contractBefore.payload.snapshotHash,
      });
      assert.equal(committedContract.isError, false, JSON.stringify(committedContract.payload));
      assert.equal(committedContract.payload.applied, true);
      assert.equal(committedContract.payload.data?.integrationContract?.namespace, 'unit36bridge');

      const wsGlueAfter = await presetReadMcp.callTool('preview_contract_glue', {
        mode: 'workspace',
        scriptPrefix: 'unit36_bridge_md',
      });
      assert.equal(wsGlueAfter.isError, false, JSON.stringify(wsGlueAfter.payload));
      assert.equal(wsGlueAfter.payload.available, true);
      assert.equal(wsGlueAfter.payload.errorCount, 0);
      assert(String(wsGlueAfter.payload.lua).includes('unit36bridge.ping'));
      assert(String(wsGlueAfter.payload.mdScript).includes('unit36_bridge_md'));

      const contractMid = await presetReadMcp.callTool('get_workspace_domain', { domain: 'integration_contract' });
      const clearedContract = await fullMcp.callTool('update_workspace_domain', {
        domain: 'integration_contract',
        changes: { integrationContract: null, customLua: '' },
        apply: true,
        operationId: 'op_unit36_contract_clear_1',
        expectedHead: contractMid.payload.workspaceHash,
        expectedSnapshotHash: contractMid.payload.snapshotHash,
      });
      assert.equal(clearedContract.isError, false, JSON.stringify(clearedContract.payload));
      assert.equal(clearedContract.payload.data?.integrationContract, null);
    });

    await check('17_reference_manifest_pagination_and_live_runtime_diagnostics_over_mcp', async () => {
      const readList = ((await presetReadMcp.request('tools/list')).result?.tools || []).map((t: any) => t.name);
      for (const expectedTool of [
        'list_reference_manifest_files',
        'get_live_bridge_state',
        'get_runtime_control_status',
        'analyze_cue_telemetry',
        'get_game_log_status',
      ]) {
        assert(readList.includes(expectedTool), `preset read key must advertise ${expectedTool}`);
      }

      const ledgerBefore = (await presetReadMcp.callTool('list_action_history', { limit: 100 })).payload.total;

      // 1. list_reference_manifest_files paginates indexed SQLite manifest files while redacting root and database paths
      const manifestRes = await presetReadMcp.callTool('list_reference_manifest_files', {
        domain: 'libraries',
        limit: '5',
        offset: '0',
      });
      assert.equal(manifestRes.isError, false, JSON.stringify(manifestRes.payload));
      assert.equal(manifestRes.payload.ok, true);
      assert.equal(manifestRes.payload.ready, true);
      assert(manifestRes.payload.total >= 2);
      assert(Array.isArray(manifestRes.payload.files));
      assert(!JSON.stringify(manifestRes.payload).includes(corpusDir), 'list_reference_manifest_files leaked corpusDir');
      assert(!JSON.stringify(manifestRes.payload).includes(dataDir), 'list_reference_manifest_files leaked dataDir');

      // 2. get_live_bridge_state returns normalized external runtime /health + bridge_events liveness
      const bridgeRes = await presetReadMcp.callTool('get_live_bridge_state', {});
      assert.equal(bridgeRes.isError, false, JSON.stringify(bridgeRes.payload));
      assert.equal(bridgeRes.payload.ok, true);
      assert.equal(typeof bridgeRes.payload.bridgeUp, 'boolean');
      assert.equal(typeof bridgeRes.payload.gameActive, 'boolean');
      assert(!JSON.stringify(bridgeRes.payload).includes(root), 'get_live_bridge_state leaked host root');

      // 3. get_runtime_control_status reads addressed workspace companion reload status without host paths
      const ctrlRes = await presetReadMcp.callTool('get_runtime_control_status', {});
      assert.equal(ctrlRes.isError, false, JSON.stringify(ctrlRes.payload));
      assert.equal(ctrlRes.payload.ok, true);
      assert.equal(ctrlRes.payload.workspaceId, wsId);
      assert.deepEqual(ctrlRes.payload.supportedCommands, ['refreshmd', 'reloadui']);
      assert(!JSON.stringify(ctrlRes.payload).includes(root), 'get_runtime_control_status leaked host root');

      // 4. analyze_cue_telemetry correlates explicit cueNames and addressed workspace cues quietly with host logPath redacted
      const cueRes = await presetReadMcp.callTool('analyze_cue_telemetry', { cueNames: ['Init', 'SharedCue'] });
      assert.equal(cueRes.isError, false, JSON.stringify(cueRes.payload));
      assert.equal(cueRes.payload.ok, true);
      assert.equal(cueRes.payload.cueCount, 2);
      assert.equal((cueRes.payload as any).logPath, undefined, 'analyze_cue_telemetry must redact logPath');
      assert(!JSON.stringify(cueRes.payload).includes(root), 'analyze_cue_telemetry leaked host root');

      // 5. get_game_log_status classifies live X4 debug log + FORGE-LUAV Lua staleness without selectedLogPath / checkedPaths leaks
      const gameLogRes = await presetReadMcp.callTool('get_game_log_status', { modId });
      assert.equal(gameLogRes.isError, false, JSON.stringify(gameLogRes.payload));
      assert.equal(gameLogRes.payload.ok, true);
      assert(['no_log', 'stale', 'errors', 'warnings', 'clean'].includes(gameLogRes.payload.status));
      assert.equal((gameLogRes.payload as any).selectedLogPath, undefined, 'get_game_log_status must redact selectedLogPath');
      assert.equal((gameLogRes.payload as any).checkedPaths, undefined, 'get_game_log_status must redact checkedPaths');
      assert(!JSON.stringify(gameLogRes.payload).includes(root), 'get_game_log_status leaked host root');

      const ledgerAfter = (await presetReadMcp.callTool('list_action_history', { limit: 100 })).payload.total;
      assert.equal(ledgerAfter, ledgerBefore, 'Slice 14 read/analyze MCP calls must stay quiet in Action Ledger');
    });

    await check('18_studio_preferences_and_deterministic_md_graph_analysis_over_mcp', async () => {
      const readList = ((await presetReadMcp.request('tools/list')).result?.tools || []).map((t: any) => t.name);
      for (const expectedTool of [
        'get_studio_preferences',
        'critique_md_graph',
        'explain_md_graph',
        'simulate_md_graph',
        'diagnose_workspace_nodes',
      ]) {
        assert(readList.includes(expectedTool), `preset read key must advertise ${expectedTool}`);
      }

      const ledgerBefore = (await presetReadMcp.callTool('list_action_history', { limit: 100 })).payload.total;

      // 1. get_studio_preferences reads normalized Studio layout, visible rails, and release preferences with zero host paths
      const prefsRes = await presetReadMcp.callTool('get_studio_preferences', {});
      assert.equal(prefsRes.isError, false, JSON.stringify(prefsRes.payload));
      assert.equal(prefsRes.payload.ok, true);
      assert.equal(prefsRes.payload.layout?.version, 1);
      assert.equal(prefsRes.payload.releasePreferences?.mode, 'guided');
      assert(Array.isArray(prefsRes.payload.visibleWorkspaceViews) && prefsRes.payload.visibleWorkspaceViews.includes('blueprint'));
      assert(Array.isArray(prefsRes.payload.visibleSidebarTabs) && prefsRes.payload.visibleSidebarTabs.includes('script'));
      assert(!JSON.stringify(prefsRes.payload).includes(root), 'get_studio_preferences leaked host root');

      // 2. diagnose_workspace_nodes catches unknown_element and missing_required_attr on inline MD nodes and checks addressed workspace
      const wsDiagRes = await presetReadMcp.callTool('diagnose_workspace_nodes', {});
      assert.equal(wsDiagRes.isError, false, JSON.stringify(wsDiagRes.payload));
      assert.equal(wsDiagRes.payload.ok, true);
      assert.equal(wsDiagRes.payload.mode, 'workspace');
      assert.equal(wsDiagRes.payload.workspaceId, wsId);

      const emptyXsdDiagRes = await presetReadMcp.callTool('diagnose_workspace_nodes', {
        mode: 'inline',
        nodes: [
          { id: 'c1', type: 'cue', xmlTag: 'cue', label: 'Cue1', properties: { name: 'Cue1' } },
          { id: 'sv_ok', type: 'action', xmlTag: 'set_value', label: 'SetVal', properties: { name: '$x', exact: '1' } },
        ],
      });
      assert.equal(emptyXsdDiagRes.isError, false, JSON.stringify(emptyXsdDiagRes.payload));
      if (!fs.existsSync(path.join(repoHarvested, 'md.xsd'))) {
        assert.equal(emptyXsdDiagRes.payload.schemaLoaded, false, 'empty placeholder md.xsd must not report schemaLoaded=true');
        assert.equal(emptyXsdDiagRes.payload.totalDiagnostics, 0);
      }

      const mdXsdPath = path.join(schemaDir, 'md.xsd');
      const prevMdXsd = fs.readFileSync(mdXsdPath, 'utf8');
      try {
        if (!fs.existsSync(path.join(repoHarvested, 'md.xsd'))) {
          const minimalMdXsd = [
            '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">',
            '  <xs:element name="set_value">',
            '    <xs:complexType>',
            '      <xs:attribute name="name" type="xs:string" use="required"/>',
            '      <xs:attribute name="exact" type="xs:string"/>',
            '    </xs:complexType>',
            '  </xs:element>',
            '</xs:schema>',
          ].join('\n');
          fs.writeFileSync(mdXsdPath, minimalMdXsd, 'utf8');
          const bumpedTime = new Date(Date.now() + 5000);
          fs.utimesSync(mdXsdPath, bumpedTime, bumpedTime);
        }
        const inlineDiagRes = await presetReadMcp.callTool('diagnose_workspace_nodes', {
          mode: 'inline',
          nodes: [
            { id: 'c1', type: 'cue', xmlTag: 'cue', label: 'Cue1', properties: { name: 'Cue1' } },
            { id: 'bad_el', type: 'action', xmlTag: 'not_a_real_md_tag_xyz', label: 'Bad', properties: {} },
            { id: 'bad_attr', type: 'action', xmlTag: 'set_value', label: 'SetVal', properties: {} },
          ],
        });
        assert.equal(inlineDiagRes.isError, false, JSON.stringify(inlineDiagRes.payload));
        assert.equal(inlineDiagRes.payload.mode, 'inline');
        assert.equal(inlineDiagRes.payload.schemaLoaded, true);
        assert(inlineDiagRes.payload.diagnostics.some((d: any) => d.nodeId === 'bad_el' && d.code === 'unknown_element'));
        assert(inlineDiagRes.payload.diagnostics.some((d: any) => d.nodeId === 'bad_attr' && d.code === 'missing_required_attr'));
      } finally {
        fs.writeFileSync(mdXsdPath, prevMdXsd, 'utf8');
        const restoredTime = new Date(Date.now() + 10000);
        fs.utimesSync(mdXsdPath, restoredTime, restoredTime);
      }

      const mixedBadDiag = await presetReadMcp.callTool('diagnose_workspace_nodes', {
        mode: 'workspace',
        nodes: [],
      });
      assert.equal(mixedBadDiag.isError, true, 'mode=workspace must reject inline nodes');

      // 3. simulate_md_graph evaluates Kleene true/false/unknown logic with scalar seed variables
      const simRes = await presetReadMcp.callTool('simulate_md_graph', {
        mode: 'inline',
        seed: { $threat: 2 },
        nodes: [
          { id: 'cue_gate', type: 'cue', xmlTag: 'cue', label: 'GateCue', properties: { name: 'GateCue' } },
          { id: 'cond_gate', type: 'condition', xmlTag: 'check_value', label: 'ThreatCheck', properties: { value: '$threat ge 10' } },
          { id: 'cue_child', type: 'cue', xmlTag: 'cue', label: 'ChildCue', properties: { name: 'ChildCue' } },
        ],
        links: [
          { id: 'l_cond', sourceNodeId: 'cue_gate', sourcePortId: 'out_cond', targetNodeId: 'cond_gate', targetPortId: 'in_cond' },
          { id: 'l_sub', sourceNodeId: 'cue_gate', sourcePortId: 'out_sub', targetNodeId: 'cue_child', targetPortId: 'in_flow' },
        ],
      });
      assert.equal(simRes.isError, false, JSON.stringify(simRes.payload));
      assert.equal(simRes.payload.ok, true);
      assert(simRes.payload.findings.some((f: any) => f.kind === 'never_satisfiable_cue' && f.nodeId === 'cue_gate'));
      assert(simRes.payload.findings.some((f: any) => f.kind === 'unreachable_subcue' && f.nodeId === 'cue_child'));

      // 4. critique_md_graph runs deterministic MD lints without false positives
      const criticRes = await presetReadMcp.callTool('critique_md_graph', {
        mode: 'inline',
        nodes: [
          { id: 'cue_bare', type: 'cue', xmlTag: 'cue', label: 'BareCue', properties: { name: 'BareCue' } },
          { id: 'act_1', type: 'action', xmlTag: 'set_value', label: 'SetX', properties: { name: '$x', exact: '1' } },
        ],
        links: [
          { id: 'l_act', sourceNodeId: 'cue_bare', sourcePortId: 'out_act', targetNodeId: 'act_1', targetPortId: 'in_act' },
        ],
      });
      assert.equal(criticRes.isError, false, JSON.stringify(criticRes.payload));
      assert.equal(criticRes.payload.ok, true);
      assert.equal(typeof criticRes.payload.totalFindings, 'number');
      assert(Array.isArray(criticRes.payload.findings));

      // 5. explain_md_graph supports both deterministic cue-flow summaries and single-diagnostic explanations
      const explainWsRes = await presetReadMcp.callTool('explain_md_graph', { mode: 'workspace' });
      assert.equal(explainWsRes.isError, false, JSON.stringify(explainWsRes.payload));
      assert.equal(explainWsRes.payload.mode, 'workspace');
      assert.equal(typeof explainWsRes.payload.summary, 'string');
      assert(Array.isArray(explainWsRes.payload.flowSteps));

      const explainDiagRes = await presetReadMcp.callTool('explain_md_graph', {
        mode: 'diagnostic',
        diagnostic: {
          code: 'lua.raw_engine_id_in_player_text',
          severity: 'warning',
          message: 'Raw faction ID in player-visible Lua string.',
        },
      });
      assert.equal(explainDiagRes.isError, false, JSON.stringify(explainDiagRes.payload));
      assert.equal(explainDiagRes.payload.mode, 'diagnostic');
      assert.equal(typeof explainDiagRes.payload.explanation?.why, 'string');
      assert.equal(typeof explainDiagRes.payload.explanation?.next, 'string');

      const ledgerAfter = (await presetReadMcp.callTool('list_action_history', { limit: 100 })).payload.total;
      assert.equal(ledgerAfter, ledgerBefore, 'Slice 15 read/analyze MCP calls must stay quiet in Action Ledger');
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
