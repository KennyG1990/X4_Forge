/**
 * route-integration.mjs — external HTTP integration gate for the highest-RISK, security-
 * relevant routes (BACKLOG B64-T1, 2026-07-19; audit finding C-TEST-1: 133 routes had no
 * automated coverage beyond 9 e2e specs).
 *
 * Why a SEPARATE harness (not an in-process oracle): auth + agent-key SCOPE can only be
 * exercised by an EXTERNAL client presenting different credentials over HTTP — the existing
 * SELFTESTS run server-side and bypass authMiddleware entirely. This boots an ephemeral
 * server (isolated state/data dirs, a known session token, NO game corpus needed) and asserts
 * the security contract from the outside, then tears the server down by PID tree.
 *
 * Scope (corpus-independent security surface):
 *   - unauthenticated request is refused (401)
 *   - session token has full access; a bogus token is refused
 *   - a READ-scoped agent key: 200 on read GETs, 403 on the run_command exec route (B64-SEC1
 *     regression guard — this makes that one-off live drill PERMANENT), 403 on write POSTs
 *   - a WRITE-scoped key: 200 on a write-scoped prefix, 403 on deploy-only routes + key mgmt
 *   - fs/write path containment: a traversal path is rejected; an in-root write is accepted
 * Deploy, validate-with-fixture-schema, and the extension smoke are B64-T1b (need a fixture).
 *
 * Usage:  npm run test:routes    (or: node scripts/route-integration.mjs)
 * Exit 0 ⇔ every assertion passed; exit 1 ⇔ any failed / server never came up.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = Number(process.env.ROUTE_TEST_PORT || 8971);
const BASE = `http://127.0.0.1:${PORT}`;
const SESSION_TOKEN = 'route-int-selftest-token-' + process.pid;
const tmp = path.join(os.tmpdir(), `x4-route-int-${process.pid}`);
const stateDir = path.join(tmp, 'state');
const dataDir = path.join(tmp, 'data');
fs.mkdirSync(stateDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });
const referenceRoot = path.join(tmp, 'reference');
fs.mkdirSync(path.join(referenceRoot, 'libraries'), { recursive: true });
fs.writeFileSync(path.join(referenceRoot, 'libraries', 'factions.xml'), '<factions><faction id="routefixture" name="Route Fixture" tags="economic"/></factions>');
fs.writeFileSync(path.join(referenceRoot, 'libraries', 'wares.xml'), '<wares><ware id="routeware" name="Route Ware" group="test" tags="economy"/></wares>');
fs.writeFileSync(path.join(referenceRoot, 'libraries', 'scriptproperties.xml'), '<scriptproperties><datatype name="faction"><property name="id" result="ID" type="string"/></datatype></scriptproperties>');

const checks = [];
const ok = (name, pass, detail) => { checks.push({ name, pass: !!pass, detail }); console.log(`${pass ? '  ok  ' : ' FAIL '}${name}${detail ? `  [${detail}]` : ''}`); };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } } }
}

async function req(method, urlPath, token, body) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  try {
    const res = await fetch(BASE + urlPath, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const raw = await res.text();
    let json = null; try { json = JSON.parse(raw); } catch { /* non-json */ }
    return { status: res.status, json, raw };
  } catch (e) {
    return { status: 0, json: null, error: String(e) };
  }
}

let child;
async function main() {
  child = spawn('npx', ['tsx', 'server.ts'], {
    cwd: process.cwd(),
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development', STUDIO_API_TOKEN: SESSION_TOKEN, X4_STATE_DIR: stateDir, X4_DATA_DIR: dataDir, X4_REFERENCE_ROOT: referenceRoot },
  });
  let serverOut = '';
  child.stdout.on('data', (d) => { serverOut += d; });
  child.stderr.on('data', (d) => { serverOut += d; });

  // readiness: poll a public route until it answers
  let up = false;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    const r = await req('GET', '/api/agent/schema', null);
    if (r.status && r.status !== 0) { up = true; break; }
  }
  if (!up) { ok('server_came_up', false, serverOut.slice(-400)); return; }
  ok('server_came_up', true);

  // --- auth basics ---
  ok('no_token_401', (await req('GET', '/api/agent/workspace', null)).status === 401);
  ok('bogus_token_401', (await req('GET', '/api/agent/workspace', 'not-a-real-token')).status === 401);
  ok('session_token_200_workspace', (await req('GET', '/api/agent/workspace', SESSION_TOKEN)).status === 200);

  // --- public canonical reference API + raw-file containment ---
  const factions = await req('GET', '/api/reference/factions', null);
  ok('reference_factions_public_and_canonical', factions.status === 200 && factions.json?.[0]?.id === 'routefixture');
  const rawFaction = await req('GET', '/api/reference/file?path=libraries/factions.xml', null);
  ok('reference_file_returns_real_raw_file', rawFaction.status === 200 && rawFaction.raw.includes('routefixture'));
  const referenceTraversal = await req('GET', '/api/reference/file?path=../outside.xml', null);
  ok('reference_file_traversal_rejected', referenceTraversal.status === 403, `status=${referenceTraversal.status}`);

  // --- mint a read + a write agent key with the session token ---
  const mkKey = async (scope) => {
    const r = await req('POST', '/api/agent/keys', SESSION_TOKEN, { label: `route-int-${scope}`, scope, ttl: '1h' });
    return r.json && (r.json.token || r.json.key);
  };
  const readKey = await mkKey('read');
  const writeKey = await mkKey('write');
  ok('minted_read_and_write_keys', !!readKey && !!writeKey, `read=${!!readKey} write=${!!writeKey}`);

  // --- read-scope contract ---
  ok('read_key_200_read_get', (await req('GET', '/api/agent/workspace', readKey)).status === 200);
  ok('read_key_403_run_command', (await req('GET', '/api/run_command?cmd=echo+hi', readKey)).status === 403); // B64-SEC1 permanent guard
  ok('read_key_403_run_command_job', (await req('POST', '/api/run_command/job', readKey, { cmd: 'echo hi' })).status === 403);
  ok('read_key_403_write_post', (await req('POST', '/api/agent/workspace', readKey, { workspace: {} })).status === 403);
  ok('read_key_403_key_mgmt', (await req('POST', '/api/agent/keys', readKey, { label: 'x', scope: 'read', ttl: '1h' })).status === 403);

  // --- write-scope contract ---
  ok('write_key_403_run_command', (await req('GET', '/api/run_command?cmd=echo+hi', writeKey)).status === 403);
  ok('write_key_403_key_mgmt', (await req('GET', '/api/agent/keys', writeKey)).status === 403);

  // --- fs/write path containment ---
  const traversal = await req('POST', '/api/fs/write', SESSION_TOKEN, { path: '../../../../etc/passwd_x4_route_test', content: 'x' });
  ok('fs_write_traversal_rejected', traversal.status === 400 || traversal.status === 403, `status=${traversal.status}`);
}

try {
  await main();
} catch (e) {
  ok('harness_ran_without_throwing', false, String(e));
} finally {
  killTree(child && child.pid);
  // best-effort: also clear the port in case the tree kill missed a grandchild
  if (process.platform === 'win32') {
    const ns = spawnSync('netstat', ['-ano'], { encoding: 'utf8' });
    const line = (ns.stdout || '').split(/\r?\n/).find((l) => l.includes(`:${PORT}`) && /LISTENING/i.test(l));
    if (line) { const pid = line.trim().split(/\s+/).pop(); spawnSync('taskkill', ['/PID', pid, '/F'], { stdio: 'ignore' }); }
  }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
}

const passed = checks.filter((c) => c.pass).length;
console.log(`\n[route-integration] ${passed}/${checks.length} ${passed === checks.length ? 'PASS' : 'FAIL'}`);
process.exit(passed === checks.length && checks.length > 0 ? 0 : 1);
