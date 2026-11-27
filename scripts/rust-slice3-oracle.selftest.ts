/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Slice 3A black-box oracle selftest:
 *  1. Startup security guards (refuse non-loopback --host / --upstream with exit 2)
 *  2. Ephemeral `x4forge serve --port 0 --ready-json` boot, discovery files, SQLite WAL & auto-token
 *  3. Public routes (/api/health, /api/agent/schema, /api/reference/status) & 401 unauth/bogus rejection
 *  4. Workspaces, x4fk_ scoped key lifecycle (mint/list/revoke), workspace binding & Studio-only 403
 *  5. Optimistic CAS mutations (expectedVersion/expectedHead 409, dryRun, x-forge-operation-id replay/conflict),
 *     snapshots (create/list/restore/delete), and action history + revert
 *  6. In-process Rust analysis HTTP routes (validate, reference/search, inspect, tree-hash, cat/list+extract,
 *     and unsafe '../escape.xml' refusal)
 *  7. Static SPA serving (--static-dir): studio token injection into index.html & %2e%2e traversal 403
 *  8. Live pure-Rust `x4forge mcp --mode proxy` <-> `x4forge serve` auto-discovery & tool execution
 *  9. Optional `--upstream` loopback strangler proxy forwarding + optional live X4 9.00 corpus benchmark
 */

import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planCatDatCatalogs } from '../src/lib/x4CatDat';
import { resolveRustX4ForgeBin } from '../src/server/rustAccelerator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

function physicalTmpRoot(): string {
  const base = fs.realpathSync.native(os.tmpdir());
  return fs.mkdtempSync(path.join(base, 'x4-slice3-oracle-'));
}

interface ReadyBanner {
  ready: boolean;
  port: number;
  url: string;
  pid: number;
  engine: string;
}

class ServeProcess {
  public readonly ready: ReadyBanner;
  private child: ChildProcessWithoutNullStreams;
  private exitPromise: Promise<number | null>;
  private stderrChunks: string[] = [];

  private constructor(
    child: ChildProcessWithoutNullStreams,
    ready: ReadyBanner,
    exitPromise: Promise<number | null>,
    stderrChunks: string[],
  ) {
    this.child = child;
    this.ready = ready;
    this.exitPromise = exitPromise;
    this.stderrChunks = stderrChunks;
  }

  static async start(
    bin: string,
    args: string[],
    envOverrides: Record<string, string | undefined> = {},
    timeoutMs = 15000,
  ): Promise<{ proc: ServeProcess; bootMs: number }> {
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const [k, v] of Object.entries(envOverrides)) {
      if (v === undefined) delete env[k];
      else env[k] = v;
    }
    const t0 = performance.now();
    const child = spawn(bin, ['serve', '--port', '0', '--ready-json', ...args], {
      cwd: REPO_ROOT,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const stderrChunks: string[] = [];
    child.stderr.on('data', (c: Buffer) => {
      stderrChunks.push(c.toString('utf8'));
    });
    const exitPromise = new Promise<number | null>((resolve) => {
      child.once('exit', (code) => resolve(code));
    });

    const ready = await new Promise<ReadyBanner>((resolve, reject) => {
      let stdoutBuf = '';
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          child.kill();
          reject(new Error(`Timed out waiting for x4forge serve ready JSON; stderr=${stderrChunks.join('')}`));
        }
      }, timeoutMs);

      const onData = (chunk: Buffer) => {
        stdoutBuf += chunk.toString('utf8');
        const idx = stdoutBuf.indexOf('\n');
        if (idx >= 0 && !settled) {
          const line = stdoutBuf.slice(0, idx).replace(/\r$/, '').trim();
          if (line.startsWith('{')) {
            try {
              const parsed = JSON.parse(line) as ReadyBanner;
              if (parsed.ready) {
                settled = true;
                clearTimeout(timer);
                child.stdout.off('data', onData);
                resolve(parsed);
              }
            } catch {
              // ignore partial/non-JSON line
            }
          }
        }
      };

      child.stdout.on('data', onData);
      child.once('exit', (code) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error(`x4forge serve exited before ready (${code}): ${stderrChunks.join('')}`));
        }
      });
    });

    const bootMs = performance.now() - t0;
    return { proc: new ServeProcess(child, ready, exitPromise, stderrChunks), bootMs };
  }

  async stop(): Promise<void> {
    if (this.child.exitCode !== null || this.child.signalCode !== null) {
      await this.exitPromise;
      return;
    }
    this.child.kill();
    await Promise.race([
      this.exitPromise,
      new Promise<void>((resolve) => setTimeout(resolve, 3000)),
    ]);
  }

  getStderr(): string {
    return this.stderrChunks.join('');
  }
}

class McpClient {
  private child: ChildProcessWithoutNullStreams;
  private buf = '';
  private nextId = 1;
  private pending = new Map<number | string, { resolve: (val: unknown) => void; reject: (err: Error) => void }>();
  private stderrChunks: string[] = [];
  private exitPromise: Promise<number | null>;

  constructor(bin: string, args: string[], envOverrides: Record<string, string | undefined> = {}) {
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const [k, v] of Object.entries(envOverrides)) {
      if (v === undefined) delete env[k];
      else env[k] = v;
    }
    this.child = spawn(bin, args, {
      cwd: REPO_ROOT,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => {
      this.buf += chunk;
      let idx: number;
      while ((idx = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, idx).replace(/\r$/, '').trim();
        this.buf = this.buf.slice(idx + 1);
        if (!line) continue;
        const msg = JSON.parse(line) as {
          id?: number | string | null;
          result?: unknown;
          error?: { code: number; message: string };
        };
        const key = msg.id === null ? '__null__' : msg.id;
        if (key !== undefined) {
          const slot = this.pending.get(key);
          if (slot) {
            this.pending.delete(key);
            slot.resolve(msg);
          }
        }
      }
    });
    this.child.stderr.on('data', (c: Buffer) => {
      this.stderrChunks.push(c.toString('utf8'));
    });
    this.exitPromise = new Promise((resolve) => {
      this.child.once('exit', (code) => {
        for (const slot of this.pending.values()) {
          slot.reject(new Error(`MCP exited (${code}): ${this.stderrChunks.join('')}`));
        }
        this.pending.clear();
        resolve(code);
      });
    });
  }

  request(method: string, params?: unknown): Promise<{ id?: unknown; result?: unknown; error?: { code: number; message: string } }> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      const payload = JSON.stringify({ jsonrpc: '2.0', id, method, ...(params !== undefined ? { params } : {}) });
      this.child.stdin.write(`${payload}\n`);
    });
  }

  notify(method: string, params?: unknown): void {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, ...(params !== undefined ? { params } : {}) })}\n`);
  }

  async close(): Promise<number | null> {
    this.child.stdin.end();
    return this.exitPromise;
  }
}

async function rawHttpRequest(
  baseUrl: string,
  method: string,
  reqPath: string,
  headers: Record<string, string> = {},
  body?: unknown,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; text: string; json: unknown }> {
  const url = new URL(baseUrl);
  const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
  const finalHeaders: Record<string, string> = { ...headers };
  if (payload !== undefined && !finalHeaders['content-type'] && !finalHeaders['Content-Type']) {
    finalHeaders['content-type'] = 'application/json';
  }
  if (payload !== undefined) {
    finalHeaders['content-length'] = String(Buffer.byteLength(payload, 'utf8'));
  }

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: Number(url.port),
        method,
        path: reqPath,
        headers: finalHeaders,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json: unknown = null;
          try {
            json = JSON.parse(text);
          } catch {
            json = null;
          }
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            text,
            json,
          });
        });
      },
    );
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

function checkStartupSecurityGuards(bin: string, scratch: string): void {
  const dataDir = path.join(scratch, 'guard-data');
  fs.mkdirSync(dataDir, { recursive: true });

  const badHost = spawnSync(
    bin,
    ['serve', '--host', '0.0.0.0', '--no-discovery', '--data-dir', dataDir],
    { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true },
  );
  assert.equal(badHost.status, 2, `Expected exit 2 for non-loopback host, got ${badHost.status}`);
  assert(
    badHost.stderr.includes('Refusing non-loopback bind host'),
    `Expected loopback bind error message, got: ${badHost.stderr}`,
  );

  const badUpstream = spawnSync(
    bin,
    ['serve', '--upstream', 'https://evil.example.com', '--no-discovery', '--data-dir', dataDir],
    { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true },
  );
  assert.equal(badUpstream.status, 2, `Expected exit 2 for non-loopback upstream, got ${badUpstream.status}`);
  assert(
    badUpstream.stderr.includes('Refusing non-loopback Forge URL'),
    `Expected loopback upstream error message, got: ${badUpstream.stderr}`,
  );
}

function buildTestFixtures(scratch: string): {
  dataDir: string;
  discDir: string;
  staticDir: string;
  modDir: string;
  unpackedDir: string;
  catDir: string;
} {
  const dataDir = path.join(scratch, 'serve-data');
  const discDir = path.join(scratch, 'serve-discovery');
  const staticRoot = path.join(scratch, 'static-wrap');
  const staticDir = path.join(staticRoot, 'public');
  const modDir = path.join(scratch, 'test-mod');
  const unpackedDir = path.join(scratch, 'mini-corpus');
  const catDir = path.join(scratch, 'cat-pack');

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(discDir, { recursive: true });
  fs.mkdirSync(staticDir, { recursive: true });
  fs.mkdirSync(path.join(modDir, 'md'), { recursive: true });
  fs.mkdirSync(path.join(unpackedDir, 'libraries'), { recursive: true });
  fs.mkdirSync(catDir, { recursive: true });

  // Static SPA + outside secret sibling for traversal negative test
  fs.writeFileSync(path.join(staticRoot, 'secret.txt'), 'TOP_SECRET_MUST_NOT_ESCAPE', 'utf8');
  fs.writeFileSync(
    path.join(staticDir, 'index.html'),
    '<!doctype html><html><head><title>Forge</title></head><body><div id="root">ok</div></body></html>',
    'utf8',
  );
  fs.writeFileSync(path.join(staticDir, 'app.js'), 'console.log("slice3-static-ok");\n', 'utf8');

  // Clean mod fixture
  fs.writeFileSync(
    path.join(modDir, 'content.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n<content id="slice3_demo" name="Slice 3 Demo" version="100"/>\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(modDir, 'md', 'main.xml'),
    [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<mdscript name="Slice3Main">',
      '  <cues>',
      '    <cue name="Boot">',
      '      <actions>',
      '        <debug_text text="\'slice3_ready\'"/>',
      '      </actions>',
      '    </cue>',
      '  </cues>',
      '</mdscript>',
      '',
    ].join('\n'),
    'utf8',
  );

  // Mini reference corpus
  fs.writeFileSync(
    path.join(unpackedDir, 'libraries', 'factions.xml'),
    '<factions><faction id="argon"/><faction id="teladi"/><faction id="split"/></factions>',
    'utf8',
  );
  fs.writeFileSync(
    path.join(unpackedDir, 'libraries', 'wares.xml'),
    '<wares><ware id="hullparts" transport="container"/><ware id="claytronics" transport="container"/></wares>',
    'utf8',
  );

  // Catalog pair built via Slice 1 x4forge cat-pack
  const packedXml = '<content id="cat_slice3_demo" version="101"/>\n';
  const packedBuf = Buffer.from(packedXml, 'utf8');
  const planned = planCatDatCatalogs(
    [
      {
        name: 'content.xml',
        size: packedBuf.length,
        expectedSha256: crypto.createHash('sha256').update(packedBuf).digest('hex'),
        content: packedXml,
      },
    ],
    { baseName: 'ext' },
  );
  assert.equal(planned.errors.length, 0, planned.errors.join('; '));
  const layoutFile = path.join(scratch, 'cat-layout.json');
  fs.writeFileSync(
    layoutFile,
    JSON.stringify({
      volumes: planned.volumes.map((v) => ({
        index: v.index,
        catName: v.catName,
        datName: v.datName,
        catBytes: v.catBytes,
        datBytes: v.datBytes,
        entries: v.entries.map((e) => ({
          name: e.name,
          size: e.size,
          expectedSha256: e.expectedSha256,
          timestamp: 0,
          content: typeof e.content === 'string' ? e.content : '',
        })),
      })),
      errors: planned.errors,
    }),
    'utf8',
  );

  return { dataDir, discDir, staticDir, modDir, unpackedDir, catDir };
}

async function verifyPrimaryServeAndMcpProxy(bin: string, scratch: string): Promise<number> {
  const { dataDir, discDir, staticDir, modDir, unpackedDir, catDir } = buildTestFixtures(scratch);
  execFileSync(bin, ['cat-pack', catDir, '--layout-file', path.join(scratch, 'cat-layout.json')], {
    cwd: REPO_ROOT,
    windowsHide: true,
  });

  const { proc: srv, bootMs } = await ServeProcess.start(
    bin,
    [
      '--data-dir',
      dataDir,
      '--static-dir',
      staticDir,
      '--unpacked',
      unpackedDir,
    ],
    {
      STUDIO_API_TOKEN: undefined,
      X4FORGE_DISCOVERY_DIR: discDir,
      X4_REFERENCE_ROOT: undefined,
    },
  );

  try {
    const baseUrl = srv.ready.url;
    assert.equal(srv.ready.engine, 'x4forge-rust');
    assert(srv.ready.port > 0);

    // Discovery files + SQLite WAL + generated studio token
    const tokenFile = path.join(dataDir, '.studio-api-token');
    assert(fs.existsSync(tokenFile), 'Expected .studio-api-token inside --data-dir');
    const studioToken = fs.readFileSync(tokenFile, 'utf8').trim();
    assert(studioToken.length >= 32, 'Expected non-empty generated studio token');
    assert(fs.existsSync(path.join(dataDir, 'forge-serve.db')), 'Expected SQLite WAL db in --data-dir');

    const latestFile = path.join(discDir, 'latest.json');
    const instFile = path.join(discDir, 'instances', `${srv.ready.pid}.json`);
    assert(fs.existsSync(latestFile), 'Expected discovery latest.json');
    assert(fs.existsSync(instFile), 'Expected discovery instances/<pid>.json');
    const latestJson = JSON.parse(fs.readFileSync(latestFile, 'utf8')) as { url: string; engine: string; port: number };
    assert.equal(latestJson.url, baseUrl);
    assert.equal(latestJson.engine, 'x4forge-rust');

    const studioAuth = { Authorization: `Bearer ${studioToken}` };

    // Public endpoints & unauth 401 enforcement
    const health = await rawHttpRequest(baseUrl, 'GET', '/api/health');
    assert.equal(health.status, 200);
    const healthBody = health.json as {
      ok: boolean;
      engine: string;
      db: { driver: string; available: boolean };
      corpus: { loaded: boolean; factions: number; wares: number };
    };
    assert.equal(healthBody.ok, true);
    assert.equal(healthBody.engine, 'x4forge-rust');
    assert.equal(healthBody.db.driver, 'rusqlite-bundled');
    assert.equal(healthBody.db.available, true);
    assert.equal(healthBody.corpus.loaded, true);
    assert(healthBody.corpus.factions >= 3);
    assert(healthBody.corpus.wares >= 2);

    const schemaRes = await rawHttpRequest(baseUrl, 'GET', '/api/agent/schema');
    assert.equal(schemaRes.status, 200);
    const schemaBody = schemaRes.json as {
      engine: string;
      capability_contract: { schemaVersion: string; capabilities: unknown[] };
    };
    assert.equal(schemaBody.engine, 'x4forge-rust');
    assert.equal(schemaBody.capability_contract.schemaVersion, 'forge.capability.v1');
    assert.equal(schemaBody.capability_contract.capabilities.length, 17);

    const refStat = await rawHttpRequest(baseUrl, 'GET', '/api/reference/status');
    assert.equal(refStat.status, 200);
    assert.equal((refStat.json as { loaded: boolean }).loaded, true);

    assert.equal((await rawHttpRequest(baseUrl, 'GET', '/api/agent/workspace')).status, 401);
    assert.equal(
      (await rawHttpRequest(baseUrl, 'GET', '/api/agent/workspace', { Authorization: 'Bearer bogus_token' })).status,
      401,
    );

    // Workspaces creation + operation-id negative/replay check
    const missingOpCreate = await rawHttpRequest(baseUrl, 'POST', '/api/agent/workspaces', studioAuth, {
      id: 'ws_alpha',
      name: 'AlphaMod',
    });
    assert.equal(missingOpCreate.status, 400, 'POST /api/agent/workspaces without x-forge-operation-id must return 400');

    const createWs = await rawHttpRequest(
      baseUrl,
      'POST',
      '/api/agent/workspaces',
      { ...studioAuth, 'x-forge-operation-id': 'op_ws_create_alpha' },
      { id: 'ws_alpha', name: 'AlphaMod' },
    );
    assert.equal(createWs.status, 200);
    assert.equal((createWs.json as { workspaceId: string }).workspaceId, 'ws_alpha');
    assert.equal((createWs.json as { replayed: boolean }).replayed, false);

    const replayWs = await rawHttpRequest(
      baseUrl,
      'POST',
      '/api/agent/workspaces',
      { ...studioAuth, 'x-forge-operation-id': 'op_ws_create_alpha' },
      { id: 'ws_alpha', name: 'AlphaMod' },
    );
    assert.equal(replayWs.status, 200);
    assert.equal((replayWs.json as { replayed: boolean }).replayed, true);

    // Scoped x4fk_ keys mint / list / revoke / isolation
    const mintRead = await rawHttpRequest(baseUrl, 'POST', '/api/agent/keys', studioAuth, {
      label: 'reader',
      scope: 'read',
      ttl: '1h',
      workspaceId: 'ws_alpha',
    });
    assert.equal(mintRead.status, 200);
    const readKey = (mintRead.json as { token: string; record: { id: string } }).token;
    assert(readKey.startsWith('x4fk_'));

    const mintWrite = await rawHttpRequest(baseUrl, 'POST', '/api/agent/keys', studioAuth, {
      label: 'writer',
      scope: 'write',
      ttl: '24h',
      workspaceId: 'ws_alpha',
    });
    assert.equal(mintWrite.status, 200);
    const writeKey = (mintWrite.json as { token: string }).token;
    assert(writeKey.startsWith('x4fk_'));

    const mintDisposable = await rawHttpRequest(baseUrl, 'POST', '/api/agent/keys', studioAuth, {
      label: 'disposable',
      scope: 'read',
      ttl: '1h',
      workspaceId: 'ws_default',
    });
    assert.equal(mintDisposable.status, 200);
    const dispToken = (mintDisposable.json as { token: string; record: { id: string } }).token;
    const dispId = (mintDisposable.json as { record: { id: string } }).record.id;

    const listKeys = await rawHttpRequest(baseUrl, 'GET', '/api/agent/keys', studioAuth);
    assert.equal(listKeys.status, 200);
    assert(!listKeys.text.includes(readKey), 'GET /api/agent/keys must never echo raw secret tokens');
    assert(!listKeys.text.includes(writeKey), 'GET /api/agent/keys must never echo raw secret tokens');

    // Negative auth & scope checks
    const readAuth = { Authorization: `Bearer ${readKey}` };
    const writeAuth = { Authorization: `Bearer ${writeKey}` };
    assert.equal((await rawHttpRequest(baseUrl, 'GET', '/api/agent/keys', writeAuth)).status, 403);
    assert.equal(
      (
        await rawHttpRequest(
          baseUrl,
          'POST',
          '/api/agent/workspace',
          { ...readAuth, 'x-forge-operation-id': 'op_read_denied' },
          { workspace: { name: 'Denied' } },
        )
      ).status,
      403,
    );
    assert.equal(
      (await rawHttpRequest(baseUrl, 'GET', '/api/agent/workspace?workspaceId=ws_default', writeAuth)).status,
      403,
      'Agent bound to ws_alpha must not access ws_default',
    );

    // Revoke lifecycle
    assert.equal(
      (await rawHttpRequest(baseUrl, 'GET', '/api/agent/workspace', { Authorization: `Bearer ${dispToken}` })).status,
      200,
    );
    const revRes = await rawHttpRequest(baseUrl, 'POST', '/api/agent/keys/revoke', studioAuth, { id: dispId });
    assert.equal(revRes.status, 200);
    assert.equal(
      (await rawHttpRequest(baseUrl, 'GET', '/api/agent/workspace', { Authorization: `Bearer ${dispToken}` })).status,
      401,
    );
    assert.equal(
      (await rawHttpRequest(baseUrl, 'POST', '/api/agent/keys/revoke', studioAuth, { id: dispId })).status,
      404,
    );

    // Effective capabilities scoped per caller
    const readEff = await rawHttpRequest(baseUrl, 'GET', '/api/agent/capabilities/effective', readAuth);
    assert.equal(readEff.status, 200);
    const readCapIds = ((readEff.json as { capability_contract: { capabilities: Array<{ id: string }> } })
      .capability_contract.capabilities).map((c) => c.id);
    assert(readCapIds.includes('workspace.read'));
    assert(!readCapIds.includes('workspace.write'), 'Read key must not see workspace.write capability');

    const writeEff = await rawHttpRequest(baseUrl, 'GET', '/api/agent/capabilities/effective', writeAuth);
    assert.equal(writeEff.status, 200);
    const writeCapIds = ((writeEff.json as { capability_contract: { capabilities: Array<{ id: string }> } })
      .capability_contract.capabilities).map((c) => c.id);
    assert(writeCapIds.includes('workspace.write'));

    // CAS replacement, stale 409, dryRun, replay, conflict
    const wsBefore = await rawHttpRequest(baseUrl, 'GET', '/api/agent/workspace', writeAuth);
    assert.equal(wsBefore.status, 200);
    const wsBeforeJson = wsBefore.json as { version: number; workspaceHash: string; workspaceId: string };
    assert.equal(wsBeforeJson.workspaceId, 'ws_alpha');
    assert.equal(wsBeforeJson.version, 1);

    const staleCas = await rawHttpRequest(
      baseUrl,
      'POST',
      '/api/agent/workspace',
      { ...writeAuth, 'x-forge-operation-id': 'op_stale_1' },
      { workspace: { name: 'AlphaMod', nodes: [{ id: 'stale' }] }, expectedVersion: 999 },
    );
    assert.equal(staleCas.status, 409);

    const dryRunRes = await rawHttpRequest(
      baseUrl,
      'POST',
      '/api/agent/workspace',
      { ...writeAuth, 'x-forge-operation-id': 'op_dry_1' },
      { workspace: { name: 'AlphaMod', nodes: [{ id: 'dry' }] }, expectedVersion: 1, dryRun: true },
    );
    assert.equal(dryRunRes.status, 200);
    assert.equal((dryRunRes.json as { dryRun: boolean; nextVersion: number }).dryRun, true);
    assert.equal((dryRunRes.json as { nextVersion: number }).nextVersion, 2);
    assert.equal(((await rawHttpRequest(baseUrl, 'GET', '/api/agent/workspace', writeAuth)).json as { version: number }).version, 1);

    const payloadV2 = {
      name: 'AlphaMod',
      nodes: [{ id: 'n1', label: 'Node1' }],
      connections: [],
      files: { 'content.xml': '<content id="ws_alpha"/>' },
    };
    const casOk = await rawHttpRequest(
      baseUrl,
      'POST',
      '/api/agent/workspace',
      { ...writeAuth, 'x-forge-operation-id': 'op_cas_v2' },
      {
        workspace: payloadV2,
        expectedVersion: 1,
        expectedHead: wsBeforeJson.workspaceHash,
      },
    );
    assert.equal(casOk.status, 200);
    assert.equal((casOk.json as { version: number; replayed: boolean }).version, 2);
    assert.equal((casOk.json as { replayed: boolean }).replayed, false);

    // Idempotent replay with same opId & payload
    const casReplay = await rawHttpRequest(
      baseUrl,
      'POST',
      '/api/agent/workspace',
      { ...writeAuth, 'x-forge-operation-id': 'op_cas_v2' },
      {
        workspace: payloadV2,
        expectedVersion: 1,
        expectedHead: wsBeforeJson.workspaceHash,
      },
    );
    assert.equal(casReplay.status, 200);
    assert.equal((casReplay.json as { replayed: boolean }).replayed, true);

    // Different payload with reused opId -> 409 conflict
    const casOpConflict = await rawHttpRequest(
      baseUrl,
      'POST',
      '/api/agent/workspace',
      { ...writeAuth, 'x-forge-operation-id': 'op_cas_v2' },
      { workspace: { name: 'DifferentPayload' }, expectedVersion: 2 },
    );
    assert.equal(casOpConflict.status, 409);

    // Snapshots CRUD + restore
    const snapCreate = await rawHttpRequest(baseUrl, 'POST', '/api/agent/snapshots/create', writeAuth, {
      name: 'before_edit',
    });
    assert.equal(snapCreate.status, 200);
    const snapName = (snapCreate.json as { snapshotName: string }).snapshotName;
    const snapList = await rawHttpRequest(baseUrl, 'GET', '/api/agent/snapshots/list', readAuth);
    assert.equal(snapList.status, 200);
    assert((snapList.json as { snapshots: Array<{ snapshotName: string }> }).snapshots.some((s) => s.snapshotName === snapName));

    const v3Write = await rawHttpRequest(
      baseUrl,
      'POST',
      '/api/agent/workspace',
      { ...writeAuth, 'x-forge-operation-id': 'op_cas_v3' },
      { workspace: { name: 'AlphaMod', nodes: [{ id: 'n_temp' }] }, expectedVersion: 2 },
    );
    assert.equal(v3Write.status, 200);

    const snapRestore = await rawHttpRequest(baseUrl, 'POST', '/api/agent/snapshots/restore', writeAuth, {
      snapshotName: snapName,
    });
    assert.equal(snapRestore.status, 200);
    const afterRestoreNodes = ((snapRestore.json as { workspace: { nodes: Array<{ id: string }> } }).workspace.nodes);
    assert.equal(afterRestoreNodes[0]?.id, 'n1');

    const snapDelete = await rawHttpRequest(baseUrl, 'POST', '/api/agent/snapshots/delete', writeAuth, {
      snapshotName: snapName,
    });
    assert.equal(snapDelete.status, 200);
    const snapListAfterDel = await rawHttpRequest(baseUrl, 'GET', '/api/agent/snapshots/list', readAuth);
    assert(!(snapListAfterDel.json as { snapshots: Array<{ snapshotName: string }> }).snapshots.some((s) => s.snapshotName === snapName));

    // Action history + revert
    const histRes = await rawHttpRequest(baseUrl, 'GET', '/api/agent/history', readAuth);
    assert.equal(histRes.status, 200);
    assert((histRes.json as { total: number }).total >= 3);

    await rawHttpRequest(
      baseUrl,
      'POST',
      '/api/agent/workspace',
      { ...writeAuth, 'x-forge-operation-id': 'op_bad_edit' },
      { workspace: { name: 'AlphaMod', nodes: [{ id: 'bad_revert_target' }] } },
    );
    const revHist = await rawHttpRequest(baseUrl, 'POST', '/api/agent/history/revert', writeAuth, {});
    assert.equal(revHist.status, 200);
    assert.equal((revHist.json as { workspace: { nodes: Array<{ id: string }> } }).workspace.nodes[0]?.id, 'n1');

    // In-process Rust engines over HTTP
    const valClean = await rawHttpRequest(baseUrl, 'POST', '/api/agent/validate', readAuth, { modDir });
    assert.equal(valClean.status, 200);
    assert.equal((valClean.json as { passed: boolean }).passed, true);

    const valBad = await rawHttpRequest(baseUrl, 'POST', '/api/agent/validate', readAuth, {
      relPath: 'md/bad.xml',
      text: '<mdscript name="Bad"><cues><cue name="A"><actions><signal_cue cue="MissingCue"/></actions></cue></cues></mdscript>',
    });
    assert.equal(valBad.status, 200);
    assert.equal((valBad.json as { passed: boolean }).passed, false);

    const searchRes = await rawHttpRequest(baseUrl, 'GET', '/api/agent/reference/search?q=argon&kind=faction', readAuth);
    assert.equal(searchRes.status, 200);
    const searchJson = searchRes.json as { totalMatched: number; items: Array<{ id: string }> };
    assert(searchJson.totalMatched >= 1);
    assert(searchJson.items.some((i) => i.id === 'argon'));

    const inspectRes = await rawHttpRequest(baseUrl, 'POST', '/api/agent/inspect', readAuth, {
      relPath: 'md/demo.xml',
      text: fs.readFileSync(path.join(modDir, 'md', 'main.xml'), 'utf8'),
    });
    assert.equal(inspectRes.status, 200);
    assert((inspectRes.json as { symbolCount: number }).symbolCount >= 1);

    const treeRes = await rawHttpRequest(baseUrl, 'POST', '/api/agent/tree-hash', readAuth, {
      root: modDir,
      checkUtf8: true,
    });
    assert.equal(treeRes.status, 200);
    const treeBody = treeRes.json as {
      ok: boolean;
      missing: boolean;
      totalBytes: number;
      entries: Array<{ path: string; kind: string; sha256?: string; utf8?: boolean }>;
    };
    assert.equal(treeBody.ok, true);
    assert.equal(treeBody.missing, false);
    assert(treeBody.totalBytes > 0);
    const hashedFiles = treeBody.entries.filter((e) => e.kind === 'file');
    assert(hashedFiles.length >= 2);
    assert(hashedFiles.every((f) => typeof f.sha256 === 'string' && /^[a-f0-9]{64}$/.test(f.sha256)));
    assert(hashedFiles.every((f) => f.utf8 === true));

    const catFile = path.join(catDir, 'ext_01.cat');
    const datFile = path.join(catDir, 'ext_01.dat');
    const catList = await rawHttpRequest(baseUrl, 'POST', '/api/agent/cat/list', readAuth, { catPath: catFile });
    assert.equal(catList.status, 200);
    assert.equal((catList.json as { totalEntries: number }).totalEntries, 1);

    const catExtract = await rawHttpRequest(baseUrl, 'POST', '/api/agent/cat/extract', readAuth, {
      catPath: catFile,
      datPath: datFile,
      entryName: 'content.xml',
    });
    assert.equal(catExtract.status, 200);
    assert.equal((catExtract.json as { encoding: string; content: string }).encoding, 'utf8');
    assert((catExtract.json as { content: string }).content.includes('cat_slice3_demo'));

    const catUnsafe = await rawHttpRequest(baseUrl, 'POST', '/api/agent/cat/extract', readAuth, {
      catPath: catFile,
      datPath: datFile,
      entryName: '../escape.xml',
    });
    assert.equal(catUnsafe.status, 400);
    assert.equal((catUnsafe.json as { code: string }).code, 'CAT_UNSAFE_ENTRY');

    // Static SPA serving + token injection + traversal refusal + JSON 404 on unknown /api/*
    const indexRes = await rawHttpRequest(baseUrl, 'GET', '/');
    assert.equal(indexRes.status, 200);
    assert(indexRes.text.includes('window.__STUDIO_API_TOKEN__'), 'Expected injected studio token script in index.html');
    assert(indexRes.text.includes(studioToken), 'Expected actual studio token injected into index.html');

    const jsRes = await rawHttpRequest(baseUrl, 'GET', '/app.js');
    assert.equal(jsRes.status, 200);
    assert(jsRes.text.includes('slice3-static-ok'));

    const traversalRes = await rawHttpRequest(baseUrl, 'GET', '/%2e%2e/secret.txt');
    assert.equal(traversalRes.status, 403, `Expected 403 on encoded path traversal, got ${traversalRes.status}`);
    assert(!traversalRes.text.includes('TOP_SECRET_MUST_NOT_ESCAPE'));

    const unknownApi = await rawHttpRequest(baseUrl, 'GET', '/api/does-not-exist');
    assert.equal(unknownApi.status, 404);
    assert.equal((unknownApi.json as { code: string }).code, 'ROUTE_NOT_FOUND');

    // Live pure-Rust `x4forge mcp --mode proxy` <-> `x4forge serve` via discovery dir!
    const mcp = new McpClient(bin, ['mcp', '--mode', 'proxy'], {
      X4FORGE_DISCOVERY_DIR: discDir,
      X4FORGE_KEY: writeKey,
      X4FORGE_URL: undefined,
      X4FORGE_WORKSPACE_ID: undefined,
    });
    const mcpInit = await mcp.request('initialize', {
      protocolVersion: '2024-11-05',
      clientInfo: { name: 'slice3-oracle', version: '1' },
    });
    assert.equal((mcpInit.result as { protocolVersion: string }).protocolVersion, '2024-11-05');
    mcp.notify('notifications/initialized', {});

    const mcpList = await mcp.request('tools/list');
    const toolNames = ((mcpList.result as { tools: Array<{ name: string }> }).tools).map((t) => t.name);
    assert(toolNames.includes('get_workspace'));
    assert(toolNames.includes('search_reference_symbols'));
    assert(toolNames.includes('validate_mod'));
    assert(toolNames.includes('inspect_document'));
    assert(!toolNames.includes('create_agent_key'));

    const mcpSearch = await mcp.request('tools/call', {
      name: 'search_reference_symbols',
      arguments: { q: 'hull', kind: 'ware' },
    });
    assert.equal((mcpSearch.result as { isError: boolean }).isError, false);
    const mcpSearchText = (mcpSearch.result as { content: Array<{ text: string }> }).content[0].text;
    assert(mcpSearchText.includes('hullparts'), `Expected hullparts in MCP search result: ${mcpSearchText}`);

    const mcpValidate = await mcp.request('tools/call', {
      name: 'validate_mod',
      arguments: { modDir },
    });
    assert.equal((mcpValidate.result as { isError: boolean }).isError, false);
    const mcpValidateText = (mcpValidate.result as { content: Array<{ text: string }> }).content[0].text;
    assert(JSON.parse(mcpValidateText).passed === true);

    const mcpWs = await mcp.request('tools/call', {
      name: 'get_workspace',
      arguments: {},
    });
    assert.equal((mcpWs.result as { isError: boolean }).isError, false);
    assert(JSON.parse((mcpWs.result as { content: Array<{ text: string }> }).content[0].text).workspaceId === 'ws_alpha');

    const mcpExit = await mcp.close();
    assert.equal(mcpExit, 0, 'Expected x4forge mcp --mode proxy to exit 0');

    return bootMs;
  } finally {
    await srv.stop();
  }
}

async function verifyUpstreamStranglerProxy(bin: string, scratch: string): Promise<void> {
  const upstreamCalls: Array<{ method: string; url: string; auth?: string }> = [];
  const server = http.createServer((req, res) => {
    upstreamCalls.push({
      method: req.method ?? '',
      url: req.url ?? '',
      auth: typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined,
    });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, via: 'upstream-mock', url: req.url }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  assert(addr && typeof addr !== 'string');
  const upstreamUrl = `http://127.0.0.1:${addr.port}`;

  const dataDir = path.join(scratch, 'upstream-data');
  fs.mkdirSync(dataDir, { recursive: true });
  const { proc: srv } = await ServeProcess.start(
    bin,
    ['--no-discovery', '--data-dir', dataDir, '--upstream', upstreamUrl],
    { STUDIO_API_TOKEN: undefined, X4_REFERENCE_ROOT: undefined },
  );

  try {
    // Native route handled directly by Rust without hitting upstream
    const health = await rawHttpRequest(srv.ready.url, 'GET', '/api/health');
    assert.equal(health.status, 200);
    assert.equal((health.json as { engine: string }).engine, 'x4forge-rust');
    assert.equal(upstreamCalls.length, 0);

    // Unmigrated /api/* route forwarded cleanly to loopback upstream
    const legacy = await rawHttpRequest(
      srv.ready.url,
      'GET',
      '/api/legacy/ping?foo=bar',
      { Authorization: 'Bearer pass-through-check' },
    );
    assert.equal(legacy.status, 200);
    assert.equal((legacy.json as { via: string; url: string }).via, 'upstream-mock');
    assert.equal((legacy.json as { url: string }).url, '/api/legacy/ping?foo=bar');
    assert.equal(upstreamCalls.length, 1);
    assert.equal(upstreamCalls[0].auth, 'Bearer pass-through-check');
  } finally {
    await srv.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function runOptionalLiveCorpusBenchmark(bin: string, scratch: string): Promise<void> {
  const candidates = [
    process.env.X4_REFERENCE_ROOT?.trim(),
    'G:\\F-rescue-2026-09-26\\Downskies\\x4unpackersuiteV1\\X4 unpacked 9.00',
  ].filter((x): x is string => Boolean(x));
  const liveRoot = candidates.find((p) => fs.existsSync(p));
  if (!liveRoot) {
    console.log('Slice 3A live X4 9.00 HTTP benchmark: skipped (unpacked corpus not present in CI)');
    return;
  }

  const dataDir = path.join(scratch, 'live-bench-data');
  fs.mkdirSync(dataDir, { recursive: true });
  const { proc: srv, bootMs } = await ServeProcess.start(
    bin,
    ['--no-discovery', '--data-dir', dataDir, '--unpacked', liveRoot, '--token', 'bench_tok_123456'],
    { STUDIO_API_TOKEN: undefined },
    30000,
  );
  try {
    const t0 = performance.now();
    const res = await rawHttpRequest(
      srv.ready.url,
      'GET',
      '/api/agent/reference/search?q=argon&kind=faction',
      { Authorization: 'Bearer bench_tok_123456' },
    );
    const searchMs = performance.now() - t0;
    assert.equal(res.status, 200);
    assert((res.json as { totalMatched: number }).totalMatched >= 1);
    console.log(`Slice 3A live X4 9.00 HTTP benchmark: preload_boot=${bootMs.toFixed(1)}ms search=${searchMs.toFixed(2)}ms`);
  } finally {
    await srv.stop();
  }
}

async function main(): Promise<void> {
  const bin = resolveRustX4ForgeBin();
  assert(bin, 'Built x4forge binary not found; run `npm run build:rust` first.');
  const scratch = physicalTmpRoot();
  try {
    checkStartupSecurityGuards(bin, scratch);
    const serveColdMs = await verifyPrimaryServeAndMcpProxy(bin, scratch);
    await verifyUpstreamStranglerProxy(bin, scratch);
    await runOptionalLiveCorpusBenchmark(bin, scratch);
    console.log(`rust-slice3-oracle PASS | serve_cold=${serveColdMs.toFixed(1)}ms`);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

main().catch((err) => {
  console.error('rust-slice3-oracle FAIL:', err);
  process.exit(1);
});
