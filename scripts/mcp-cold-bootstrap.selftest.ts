#!/usr/bin/env node
/**
 * Deterministic end-to-end selftest for #53 (FF-14):
 *  1. Activation-time stale discovery pruning (`pruneDeadInstances`).
 *  2. Zero-I/O public `instance` identity on `GET /api/agent/schema`.
 *  3. Live discovery vs dead-PID, PID-mismatch, and `lab` / `release-host` host-mode refusal.
 *  4. Manual MCP fallback config generation with `out/mcp-bootstrap.js` + `X4FORGE_STORAGE_DIR` (zero secrets).
 *  5. Full cold MCP stdio bootstrap when ZERO Forge sidecars are running (IDE closed):
 *     spawns owned supervised sidecar, advertises write-preset tools from pre-minted `x4fk_` key,
 *     executes `get_driver_lease` & `get_workspace`, and reaps sidecar + clears `latest.json` on EOF.
 *  6. Headless CLI `out/mcp-bootstrap.js --exec` cold sidecar bootstrap & teardown.
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FORGE_CAPABILITIES, type ForgeCapabilityDescriptorV1 } from "../src/lib/forgeCapabilities";
import { requiresExplicitCapabilityGrant } from "../src/lib/agentCapabilityAuthority";
import { pruneDeadInstances } from "../src/lib/instanceDiscovery";
import {
  discoverLiveForgeInstance,
  isPidAlive,
  probeForgeEndpoint,
  resolveOrBootstrapForgeEndpoint,
  spawnOwnedColdSidecar,
} from "../vscode-extension/src/mcpBootstrap";
import {
  MCP_MANUAL_KEY_PLACEHOLDER,
  buildManualMcpConfigFallback,
  containsMcpSecretMaterial,
} from "../vscode-extension/src/mcpRegistrationLifecycle";

const REPO_ROOT = process.cwd();
const EXT_ROOT = path.join(REPO_ROOT, "vscode-extension");
const BOOTSTRAP_JS = path.join(EXT_ROOT, "out", "mcp-bootstrap.js");
const SHIM_CJS = path.join(EXT_ROOT, "mcp", "x4forge-mcp.cjs");
const SERVER_CJS = path.join(REPO_ROOT, "dist", "server.cjs");

function expectedWritePresetTools(): string[] {
  return (FORGE_CAPABILITIES as readonly ForgeCapabilityDescriptorV1[])
    .filter(cap => !requiresExplicitCapabilityGrant(cap.id) && (cap.access.public || cap.access.agentScopes.includes("write")))
    .flatMap(cap => cap.surfaces.mcp.filter(m => m.status !== "disconnected").map(m => m.id))
    .sort();
}

function runMcpStdio(
  entryScript: string,
  env: NodeJS.ProcessEnv,
  requests: Array<Record<string, unknown>>,
): Promise<{ code: number | null; responses: Map<number, any>; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entryScript], {
      cwd: EXT_ROOT,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let outBuf = "";
    let errBuf = "";
    const responses = new Map<number, any>();
    child.stdout.on("data", chunk => {
      outBuf += chunk.toString("utf8");
      const lines = outBuf.split(/\r?\n/);
      outBuf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const parsed = JSON.parse(line);
        if (typeof parsed.id === "number") responses.set(parsed.id, parsed);
      }
    });
    child.stderr.on("data", chunk => {
      errBuf += chunk.toString("utf8");
    });

    (async () => {
      for (const req of requests) {
        child.stdin.write(`${JSON.stringify(req)}\n`);
        if (typeof req.id === "number") {
          for (let i = 0; i < 150 && !responses.has(req.id); i++) {
            await new Promise(r => setTimeout(r, 100));
          }
        }
      }
      child.stdin.end();
    })().catch(reject);

    child.on("close", code => resolve({ code, responses, stderr: errBuf }));
  });
}

async function main(): Promise<void> {
  assert(fs.existsSync(SERVER_CJS), `Missing ${SERVER_CJS}; run npm run build first.`);
  assert(fs.existsSync(BOOTSTRAP_JS), `Missing ${BOOTSTRAP_JS}; run npm run build --prefix vscode-extension first.`);

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "x4-mcp-cold-bootstrap-"));
  const fakeHome = path.join(scratch, "home");
  const discDir = path.join(scratch, "discovery");
  const storageDir = path.join(scratch, "global-storage");
  const coordDir = path.join(scratch, "coord");
  fs.mkdirSync(fakeHome, { recursive: true });
  fs.mkdirSync(discDir, { recursive: true });
  fs.mkdirSync(storageDir, { recursive: true });
  fs.mkdirSync(coordDir, { recursive: true });

  const checks: string[] = [];
  const recordPass = (name: string) => {
    checks.push(name);
    console.log(`PASS ${name}`);
  };
  const keepAlive = setInterval(() => {}, 1000);
  const savedDiscEnv = process.env.X4FORGE_DISCOVERY_DIR;

  try {
    // 1. Activation-time stale discovery pruning
    process.env.X4FORGE_DISCOVERY_DIR = discDir;
    fs.mkdirSync(path.join(discDir, "instances"), { recursive: true });
    fs.writeFileSync(
      path.join(discDir, "instances", "999999991.json"),
      JSON.stringify({ port: 65106, pid: 999999991, startedAt: "2026-10-27T10:06:00.000Z", cwd: scratch, mode: "sidecar" }),
    );
    fs.writeFileSync(
      path.join(discDir, "latest.json"),
      JSON.stringify({ port: 65106, pid: 999999991, startedAt: "2026-10-27T10:06:00.000Z", cwd: scratch, mode: "sidecar" }),
    );
    const prunedCount = pruneDeadInstances();
    assert(prunedCount >= 2, `Expected dead instance + latest.json to be pruned, got ${prunedCount}`);
    assert(!fs.existsSync(path.join(discDir, "latest.json")), "Dead latest.json must be removed on activation prune");
    recordPass("activation_prune_dead_discovery");

    // 2. Manual MCP fallback config with bootstrapPath + storageDir (secret-free)
    const manualBootstrapJson = buildManualMcpConfigFallback({
      shimPath: SHIM_CJS,
      bootstrapPath: BOOTSTRAP_JS,
      storageDir,
      forgeRoot: REPO_ROOT,
      workspaceId: "ws_11223344556677889900aabb",
    });
    assert.equal(containsMcpSecretMaterial(manualBootstrapJson), false);
    const parsedManual = JSON.parse(manualBootstrapJson);
    assert.deepEqual(parsedManual.mcpServers.x4forge.args, [BOOTSTRAP_JS]);
    assert.equal(parsedManual.mcpServers.x4forge.env.X4FORGE_URL, "auto");
    assert.equal(parsedManual.mcpServers.x4forge.env.X4FORGE_STORAGE_DIR, storageDir);
    assert.equal(parsedManual.mcpServers.x4forge.env.X4FORGE_FORGE_ROOT, REPO_ROOT);
    assert.equal(parsedManual.mcpServers.x4forge.env.X4FORGE_KEY, MCP_MANUAL_KEY_PLACEHOLDER);
    recordPass("manual_fallback_bootstrap_config");

    // 3. Spawn a live `lab` host on isolated discovery, then verify default discovery refuses it!
    const labDiscDir = path.join(scratch, "lab-disc");
    fs.mkdirSync(labDiscDir, { recursive: true });
    const labSidecar = await spawnOwnedColdSidecar({
      extensionRoot: EXT_ROOT,
      forgeRoot: REPO_ROOT,
      storageDir: path.join(scratch, "lab-storage"),
      homeDir: fakeHome,
      env: {
        ...process.env,
        X4_FORGE_MODE: "lab",
        X4FORGE_DISCOVERY_DIR: labDiscDir,
        X4_SOURCE_COORDINATION_DIR: coordDir,
      },
    });
    try {
      const schemaResp = await (await fetch(`${labSidecar.baseUrl}/api/agent/schema`)).json();
      assert.equal(schemaResp.instance?.mode, "lab");
      assert.equal(schemaResp.instance?.pid, labSidecar.supervisedPid);
      recordPass("schema_exposes_instance_identity");

      // Default discovery probing the lab URL directly must refuse `lab` mode (`ISOLATED_HOST_REFUSED`)!
      const refusedLab = await probeForgeEndpoint(labSidecar.baseUrl, { allowIsolatedHost: false });
      assert.equal(refusedLab.ok, false);
      if (refusedLab.ok === false) assert.equal(refusedLab.code, "ISOLATED_HOST_REFUSED");

      // PID mismatch check fails closed (`PID_MISMATCH`)
      const pidMismatch = await probeForgeEndpoint(labSidecar.baseUrl, {
        expectedPid: labSidecar.supervisedPid + 1,
        allowIsolatedHost: true,
      });
      assert.equal(pidMismatch.ok, false);
      if (pidMismatch.ok === false) assert.equal(pidMismatch.code, "PID_MISMATCH");
      recordPass("lab_host_and_pid_mismatch_refused");
    } finally {
      await labSidecar.stop();
      assert.equal(isPidAlive(labSidecar.supervisedPid), false, "Lab sidecar PID must be reaped after stop()");
    }

    // 4. Pre-mint a persistent `write` agent key in `storageDir` (simulating a user who minted a key earlier, then closed the IDE!)
    let mintedToken = "";
    let boundWsId = "";
    const seedToken = "studio_seed_token_for_cold_bootstrap_selftest_0123456789";
    const seedSidecar = await spawnOwnedColdSidecar({
      extensionRoot: EXT_ROOT,
      forgeRoot: REPO_ROOT,
      storageDir,
      studioToken: seedToken,
      homeDir: fakeHome,
      env: {
        ...process.env,
        X4_FORGE_MODE: "sidecar",
        X4FORGE_DISCOVERY_DIR: discDir,
        X4_SOURCE_COORDINATION_DIR: coordDir,
      },
    });
    try {
      // Verify live `sidecar` discovery attaches cleanly while IDE sidecar is up!
      const liveFound = await discoverLiveForgeInstance({
        homeDir: fakeHome,
        env: { X4FORGE_DISCOVERY_DIR: discDir },
      });
      assert.equal(liveFound.ok, true);
      if (liveFound.ok === true) {
        assert.equal(liveFound.baseUrl, seedSidecar.baseUrl);
        assert.equal(liveFound.instance.pid, seedSidecar.supervisedPid);
      }
      recordPass("live_sidecar_discovery_attaches");

      const clientId = `client_seed_${process.pid}_${Date.now().toString(36)}`;
      const bootRes = await (
        await fetch(`${seedSidecar.baseUrl}/api/agent/workspaces/bootstrap`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${seedToken}`,
            "Content-Type": "application/json",
            "x-client-id": clientId,
          },
          body: JSON.stringify({ clientId }),
        })
      ).json();
      boundWsId = String(bootRes.workspaceId);
      assert(/^ws_[a-f0-9]{24}$/i.test(boundWsId), `Expected valid workspaceId, got ${boundWsId}`);

      const mintRes = await (
        await fetch(`${seedSidecar.baseUrl}/api/agent/keys`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${seedToken}`,
            "Content-Type": "application/json",
            "x-workspace-id": boundWsId,
            "x-client-id": clientId,
          },
          body: JSON.stringify({
            label: "cold-bootstrap-write-agent",
            scope: "write",
            ttl: "1h",
            workspaceId: boundWsId,
          }),
        })
      ).json();
      mintedToken = String(mintRes.token);
      assert(mintedToken.startsWith("x4fk_"), "Expected minted x4fk_ agent key");
    } finally {
      await seedSidecar.stop();
    }

    // Confirm IDE sidecar is completely stopped and `latest.json` is absent before cold MCP launch!
    assert.equal(isPidAlive(seedSidecar.supervisedPid), false, "Seed sidecar must be stopped before cold test");
    assert(!fs.existsSync(path.join(discDir, "latest.json")), "Discovery latest.json must be absent before cold test");
    const noLive = await resolveOrBootstrapForgeEndpoint({
      allowColdBootstrap: false,
      homeDir: fakeHome,
      env: { X4FORGE_URL: "auto", X4FORGE_DISCOVERY_DIR: discDir },
    });
    assert.equal(noLive.ok, false);

    // 5. Cold MCP stdio session via `out/mcp-bootstrap.js` with ZERO running servers!
    const expectedWrite = expectedWritePresetTools();
    const coldMcp = await runMcpStdio(
      BOOTSTRAP_JS,
      {
        ...process.env,
        X4FORGE_URL: "auto",
        X4FORGE_KEY: mintedToken,
        X4FORGE_WORKSPACE_ID: boundWsId,
        X4FORGE_STORAGE_DIR: storageDir,
        X4FORGE_FORGE_ROOT: REPO_ROOT,
        X4FORGE_DISCOVERY_DIR: discDir,
        X4_SOURCE_COORDINATION_DIR: coordDir,
        STUDIO_API_TOKEN: "should_never_reach_mcp_child",
      },
      [
        {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "cold-selftest", version: "1.0" } },
        },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
        { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_driver_lease", arguments: {} } },
        { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_workspace", arguments: {} } },
      ],
    );
    assert.equal(coldMcp.code, 0, `Cold MCP bootstrap exited with ${coldMcp.code}: ${coldMcp.stderr}`);
    const advertised = (coldMcp.responses.get(2)?.result?.tools || []).map((t: any) => t.name).sort();
    assert.deepEqual(advertised, expectedWrite, `Cold MCP advertised ${advertised.length} tools vs expected ${expectedWrite.length}`);
    const leasePayload = JSON.parse(coldMcp.responses.get(3)?.result?.content?.[0]?.text ?? "{}");
    assert.equal(leasePayload.ok, true);
    assert.equal(leasePayload.driverLease?.held, false);
    const wsPayload = JSON.parse(coldMcp.responses.get(4)?.result?.content?.[0]?.text ?? "{}");
    assert.equal(typeof wsPayload.name, "string");
    assert.equal(typeof wsPayload.snapshotHash, "string");
    // After MCP stdin EOF, cold-bootstrapped sidecar must have unpublished `latest.json`!
    assert(!fs.existsSync(path.join(discDir, "latest.json")), "Cold MCP sidecar must unpublish latest.json on EOF");
    recordPass("cold_mcp_stdio_bootstrap_and_clean_eof_reap");

    // 6. Headless CLI `--exec` cold sidecar bootstrap & teardown
    const cliExec = await new Promise<{ code: number | null; stdout: string; stderr: string }>(resolve => {
      const child = spawn(
        process.execPath,
        [
          BOOTSTRAP_JS,
          "--exec",
          process.execPath,
          "-e",
          "fetch(process.env.X4FORGE_URL + '/api/agent/schema').then(r=>r.json()).then(j=>{console.log(JSON.stringify({pid:j.instance.pid,hasStudio:Boolean(process.env.STUDIO_API_TOKEN)}));})",
        ],
        {
          cwd: EXT_ROOT,
          env: {
            ...process.env,
            X4FORGE_URL: "auto",
            X4FORGE_STORAGE_DIR: storageDir,
            X4FORGE_FORGE_ROOT: REPO_ROOT,
            X4FORGE_DISCOVERY_DIR: discDir,
            X4_SOURCE_COORDINATION_DIR: coordDir,
            STUDIO_API_TOKEN: "must_be_stripped",
          },
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        },
      );
      let out = "";
      let err = "";
      child.stdout.on("data", c => {
        out += c.toString("utf8");
      });
      child.stderr.on("data", c => {
        err += c.toString("utf8");
      });
      child.on("close", code => resolve({ code, stdout: out.trim(), stderr: err }));
    });
    assert.equal(cliExec.code, 0, `CLI --exec failed: ${cliExec.stderr}`);
    const execJson = JSON.parse(cliExec.stdout.split(/\r?\n/).pop() || "{}");
    assert(Number.isSafeInteger(execJson.pid) && execJson.pid > 0, `Expected cold sidecar pid, got ${cliExec.stdout}`);
    assert.equal(execJson.hasStudio, false, "STUDIO_API_TOKEN must never leak to --exec child");
    assert.equal(isPidAlive(execJson.pid), false, "CLI --exec cold sidecar PID must be reaped on exit");
    assert(!fs.existsSync(path.join(discDir, "latest.json")), "CLI --exec cold sidecar must remove latest.json on exit");
    recordPass("cli_exec_cold_bootstrap_and_reap");

    console.log(`[mcp-cold-bootstrap-selftest] PASS (${checks.length}/7: ${checks.join(", ")})`);
  } finally {
    clearInterval(keepAlive);
    if (savedDiscEnv === undefined) delete process.env.X4FORGE_DISCOVERY_DIR;
    else process.env.X4FORGE_DISCOVERY_DIR = savedDiscEnv;
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

void main().catch(err => {
  console.error("[mcp-cold-bootstrap-selftest] FAIL:", err);
  process.exit(1);
});
