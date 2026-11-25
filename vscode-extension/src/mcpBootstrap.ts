/**
 * Headless CLI & MCP cold sidecar discovery + supervised bootstrap (#53, FF-14).
 *
 * Keeps `mcp/x4forge-mcp.cjs` immutable and pure:
 *  1. Discovers live IDE/standalone Forge instances from `~/.x4forge` (`X4FORGE_DISCOVERY_DIR`),
 *     verifying live PID, port, Forge schema identity, and refusing isolated `lab` / `release-host`
 *     / `dev-build` servers unless discovery was explicitly pointed outside `~/.x4forge` (or
 *     `X4FORGE_ALLOW_ISOLATED_HOST=1`).
 *  2. When `X4FORGE_URL` is omitted, empty, or `"auto"` and no eligible sidecar is running (for
 *     example, before the IDE has been opened), cold-bootstraps an owned supervised sidecar via
 *     `sidecar-supervisor.js` (`pipe-v1` parent pipe + Windows Job Object) sharing the extension's
 *     `X4FORGE_STORAGE_DIR` (`state` / `config` / `data`) so pre-minted `x4fk_` agent keys work
 *     without opening Studio, and reaps the cold sidecar cleanly when the MCP or `--exec` session
 *     exits.
 *  3. Never exposes `STUDIO_API_TOKEN` to the MCP shim or `--exec` child process, and performs
 *     zero filesystem writes of its own.
 */

import { spawn, type ChildProcess } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";

export const ISOLATED_HOST_MODES = new Set(["dev-build", "release-host", "lab"]);
const LEGACY_SCHEMA_VERSIONS = new Set(["2026-06-10.agent.v2", "legacy.agent.v0"]);

export interface ProbeInstanceIdentity {
  port: number;
  pid: number;
  startedAt: string;
  mode: string;
  version?: string;
}

export type ProbeFailureCode =
  | "UNREACHABLE"
  | "NOT_FORGE"
  | "ISOLATED_HOST_REFUSED"
  | "PID_MISMATCH"
  | "PORT_MISMATCH";

export type ProbeEndpointResult =
  | { ok: true; baseUrl: string; instance: ProbeInstanceIdentity }
  | { ok: false; code: ProbeFailureCode; detail: string };

export interface DiscoveredRejection {
  candidate: string;
  code: string;
  detail: string;
}

export type DiscoverInstanceResult =
  | {
      ok: true;
      baseUrl: string;
      instance: ProbeInstanceIdentity;
      recordSource: "latest" | "instances";
      rejected: DiscoveredRejection[];
    }
  | { ok: false; rejected: DiscoveredRejection[] };

export interface OwnedColdSidecar {
  baseUrl: string;
  instance: ProbeInstanceIdentity;
  supervisedPid: number;
  child: ChildProcess;
  stop: () => Promise<void>;
}

export type ResolvedForgeEndpoint =
  | {
      ok: true;
      baseUrl: string;
      source: "explicit-url" | "discovered-instance" | "cold-bootstrap";
      instance: ProbeInstanceIdentity;
      ownedSidecar: OwnedColdSidecar | null;
      rejected: DiscoveredRejection[];
    }
  | {
      ok: false;
      code: string;
      detail: string;
      rejected: DiscoveredRejection[];
    };

export function isIsolatedHostMode(mode: string | undefined): boolean {
  return ISOLATED_HOST_MODES.has(String(mode || "").trim().toLowerCase());
}

function normalizeComparablePath(target: string): string {
  let resolved = path.resolve(target);
  try {
    resolved = fs.realpathSync.native(resolved);
  } catch {
    // Directory may not exist yet; lexical normalization still guards ~/.x4forge.
  }
  resolved = resolved.replace(/[\\/]+$/, "");
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function resolveDefaultDiscoveryRoot(homeDir = os.homedir()): string {
  return path.join(homeDir, ".x4forge");
}

export function resolveDiscoveryRoot(env: NodeJS.ProcessEnv = process.env, homeDir = os.homedir()): string {
  const override = env.X4FORGE_DISCOVERY_DIR?.trim();
  return override ? path.resolve(override) : resolveDefaultDiscoveryRoot(homeDir);
}

export function isDiscoveryExplicitlyIsolated(
  env: NodeJS.ProcessEnv = process.env,
  homeDir = os.homedir(),
): boolean {
  const override = env.X4FORGE_DISCOVERY_DIR?.trim();
  if (!override || !path.isAbsolute(override) || /^(?:\\\\|\/\/)/.test(override)) return false;
  const defNorm = normalizeComparablePath(resolveDefaultDiscoveryRoot(homeDir));
  const targetNorm = normalizeComparablePath(override);
  if (targetNorm === defNorm) return false;
  const sep = process.platform === "win32" ? "\\" : path.sep;
  const normDefWithSep = defNorm.replace(/[\\/]/g, sep) + sep;
  const normTarget = targetNorm.replace(/[\\/]/g, sep);
  return !normTarget.startsWith(normDefWithSep);
}

export function isPidAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    return (err as NodeJS.ErrnoException)?.code === "EPERM";
  }
}

function parseInstanceIdentity(raw: unknown): ProbeInstanceIdentity | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const port = Number(rec.port);
  const pid = Number(rec.pid);
  if (!Number.isSafeInteger(port) || port <= 0 || port > 65535) return null;
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  if (typeof rec.startedAt !== "string" || !rec.startedAt.trim()) return null;
  if (typeof rec.mode !== "string" || !rec.mode.trim()) return null;
  return {
    port,
    pid,
    startedAt: rec.startedAt,
    mode: rec.mode.trim(),
    ...(typeof rec.version === "string" && rec.version.trim() ? { version: rec.version.trim() } : {}),
  };
}

function isForgeSchemaPayload(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const rec = body as Record<string, unknown>;
  const contract = rec.capability_contract as Record<string, unknown> | undefined;
  if (contract && typeof contract === "object" && !Array.isArray(contract)) {
    return contract.schemaVersion === "forge.capability.v1" && Array.isArray(contract.capabilities);
  }
  return typeof rec.api_version === "string" && LEGACY_SCHEMA_VERSIONS.has(rec.api_version);
}

export async function probeForgeEndpoint(
  rawBaseUrl: string,
  options: {
    expectedPid?: number;
    expectedPort?: number;
    allowIsolatedHost?: boolean;
    timeoutMs?: number;
  } = {},
): Promise<ProbeEndpointResult> {
  const baseUrl = rawBaseUrl.trim().replace(/\/+$/, "");
  const timeoutMs = Math.max(250, options.timeoutMs ?? 2_000);
  let schemaBody: Record<string, unknown> | null = null;
  try {
    const res = await fetch(`${baseUrl}/api/agent/schema`, {
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      return { ok: false, code: "NOT_FORGE", detail: `/api/agent/schema returned HTTP ${res.status}` };
    }
    schemaBody = (await res.json()) as Record<string, unknown>;
  } catch (err: unknown) {
    return {
      ok: false,
      code: "UNREACHABLE",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (!isForgeSchemaPayload(schemaBody)) {
    return { ok: false, code: "NOT_FORGE", detail: "Response is not a valid X4 Forge schema contract." };
  }

  let instance = parseInstanceIdentity(schemaBody?.instance);
  if (!instance) {
    try {
      const statusRes = await fetch(`${baseUrl}/api/reference/status?observe=1`, {
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
      const statusBody = (await statusRes.json()) as Record<string, unknown>;
      instance = parseInstanceIdentity(statusBody?.instance);
    } catch {
      instance = null;
    }
  }
  if (!instance) {
    return { ok: false, code: "NOT_FORGE", detail: "Responder did not report a public Forge instance identity." };
  }

  if (options.expectedPort !== undefined && instance.port !== options.expectedPort) {
    return {
      ok: false,
      code: "PORT_MISMATCH",
      detail: `Expected port ${options.expectedPort}, responder reported ${instance.port}.`,
    };
  }
  if (options.expectedPid !== undefined && instance.pid !== options.expectedPid) {
    return {
      ok: false,
      code: "PID_MISMATCH",
      detail: `Expected PID ${options.expectedPid}, responder reported PID ${instance.pid}.`,
    };
  }
  if (!options.allowIsolatedHost && isIsolatedHostMode(instance.mode)) {
    return {
      ok: false,
      code: "ISOLATED_HOST_REFUSED",
      detail: `Refusing isolated Forge host mode "${instance.mode}" (pid ${instance.pid} on :${instance.port}).`,
    };
  }

  return { ok: true, baseUrl, instance };
}

function readCandidateRecord(filePath: string): ProbeInstanceIdentity | null {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    return parseInstanceIdentity(raw);
  } catch {
    return null;
  }
}

export async function discoverLiveForgeInstance(
  options: {
    env?: NodeJS.ProcessEnv;
    homeDir?: string;
    timeoutMs?: number;
  } = {},
): Promise<DiscoverInstanceResult> {
  const env = options.env ?? process.env;
  const root = resolveDiscoveryRoot(env, options.homeDir);
  const allowIsolatedHost =
    env.X4FORGE_ALLOW_ISOLATED_HOST === "1" || isDiscoveryExplicitlyIsolated(env, options.homeDir);
  const rejected: DiscoveredRejection[] = [];
  const seenKeys = new Set<string>();
  const candidates: Array<{ source: "latest" | "instances"; file: string; rec: ProbeInstanceIdentity }> = [];

  const latestFile = path.join(root, "latest.json");
  if (fs.existsSync(latestFile)) {
    const rec = readCandidateRecord(latestFile);
    if (!rec) {
      rejected.push({ candidate: latestFile, code: "CORRUPT_RECORD", detail: "latest.json is malformed." });
    } else if (!isPidAlive(rec.pid)) {
      rejected.push({ candidate: `pid:${rec.pid}@:${rec.port}`, code: "DEAD_PID", detail: "Recorded process is not running." });
    } else {
      seenKeys.add(`${rec.pid}:${rec.port}`);
      candidates.push({ source: "latest", file: latestFile, rec });
    }
  }

  const instancesDir = path.join(root, "instances");
  if (fs.existsSync(instancesDir)) {
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(instancesDir).filter(name => name.endsWith(".json"));
    } catch {
      entries = [];
    }
    const instanceRecs: ProbeInstanceIdentity[] = [];
    for (const name of entries) {
      const fullPath = path.join(instancesDir, name);
      const rec = readCandidateRecord(fullPath);
      if (!rec) {
        rejected.push({ candidate: fullPath, code: "CORRUPT_RECORD", detail: "Instance record is malformed." });
        continue;
      }
      if (!isPidAlive(rec.pid)) {
        rejected.push({ candidate: `pid:${rec.pid}@:${rec.port}`, code: "DEAD_PID", detail: "Recorded process is not running." });
        continue;
      }
      if (seenKeys.has(`${rec.pid}:${rec.port}`)) continue;
      seenKeys.add(`${rec.pid}:${rec.port}`);
      instanceRecs.push(rec);
    }
    instanceRecs.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
    for (const rec of instanceRecs) {
      candidates.push({ source: "instances", file: path.join(instancesDir, `${rec.pid}.json`), rec });
    }
  }

  for (const item of candidates) {
    const candidateUrl = `http://127.0.0.1:${item.rec.port}`;
    const probe = await probeForgeEndpoint(candidateUrl, {
      expectedPid: item.rec.pid,
      expectedPort: item.rec.port,
      allowIsolatedHost,
      timeoutMs: options.timeoutMs,
    });
    if (probe.ok === true) {
      return {
        ok: true,
        baseUrl: probe.baseUrl,
        instance: probe.instance,
        recordSource: item.source,
        rejected,
      };
    }
    rejected.push({
      candidate: `${candidateUrl} (pid ${item.rec.pid})`,
      code: probe.code,
      detail: probe.detail,
    });
  }

  return { ok: false, rejected };
}

function findFreeLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (!addr || typeof addr === "string") {
        srv.close(() => reject(new Error("Failed to allocate an ephemeral loopback port.")));
        return;
      }
      const selected = addr.port;
      srv.close(err => (err ? reject(err) : resolve(selected)));
    });
  });
}

function resolveExtensionPackageVersion(extRoot: string): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(extRoot, "package.json"), "utf8")) as { version?: unknown };
    return typeof pkg.version === "string" ? pkg.version.trim() : "";
  } catch {
    return "";
  }
}

export async function spawnOwnedColdSidecar(
  options: {
    env?: NodeJS.ProcessEnv;
    homeDir?: string;
    extensionRoot?: string;
    supervisorPath?: string;
    forgeRoot?: string;
    storageDir?: string;
    nodeCommand?: string;
    studioToken?: string;
    startupTimeoutMs?: number;
  } = {},
): Promise<OwnedColdSidecar> {
  const env = options.env ?? process.env;
  const extRoot = options.extensionRoot
    ? path.resolve(options.extensionRoot)
    : path.resolve(__dirname, "..");
  const supervisorPath = options.supervisorPath
    ? path.resolve(options.supervisorPath)
    : path.join(extRoot, "out", "sidecar-supervisor.js");
  if (!fs.existsSync(supervisorPath)) {
    throw new Error(`Managed sidecar supervisor not found at ${supervisorPath}. Build the extension first.`);
  }

  const candidateRoots: string[] = [];
  const configuredForgeRoot = (options.forgeRoot ?? env.X4FORGE_FORGE_ROOT ?? "").trim();
  if (configuredForgeRoot) candidateRoots.push(path.resolve(configuredForgeRoot));
  candidateRoots.push(path.join(extRoot, "app"));

  let appRoot: string | null = null;
  for (const candidate of candidateRoots) {
    if (fs.existsSync(path.join(candidate, "dist", "server.cjs"))) {
      appRoot = candidate;
      break;
    }
  }
  if (!appRoot) {
    throw new Error(
      `No built Forge server found in [${candidateRoots.join(", ")}] (missing dist/server.cjs).`,
    );
  }

  const storageBase = (options.storageDir ?? env.X4FORGE_STORAGE_DIR ?? "").trim();
  const stateDir = env.X4_STATE_DIR?.trim() || (storageBase ? path.join(storageBase, "state") : "");
  const configDir = env.X4_CONFIG_DIR?.trim() || (storageBase ? path.join(storageBase, "config") : "");
  const dataDir = env.X4_DATA_DIR?.trim() || (storageBase ? path.join(storageBase, "data") : "");

  const port = await findFreeLoopbackPort();
  const studioToken = options.studioToken?.trim() || crypto.randomBytes(32).toString("hex");
  const parentNonce = crypto.randomBytes(32).toString("hex");
  const extVersion = env.X4_FORGE_EXTENSION_VERSION?.trim() || resolveExtensionPackageVersion(extRoot);
  const mode = env.X4_FORGE_MODE?.trim() || "sidecar";
  const allowIsolatedHost =
    env.X4FORGE_ALLOW_ISOLATED_HOST === "1" || isDiscoveryExplicitlyIsolated(env, options.homeDir);

  const serverPath = path.join(appRoot, "dist", "server.cjs");
  const nodeExe = (options.nodeCommand ?? env.X4FORGE_NODE_PATH ?? "").trim() || process.execPath;

  const childEnv: NodeJS.ProcessEnv = {
    ...env,
    NODE_ENV: "production",
    PORT: String(port),
    STUDIO_API_TOKEN: studioToken,
    X4_FORGE_MODE: mode,
    X4_FORGE_EXTENSION_VERSION: extVersion,
    X4_FORGE_PARENT_MODE: "pipe-v1",
    X4_FORGE_PARENT_PID: String(process.pid),
    X4_FORGE_PARENT_NONCE: parentNonce,
    X4_FORGE_NATIVE_MODE: "",
    X4_FORGE_NATIVE_EPOCH: "",
    FORGE_ALLOW_RUN_COMMAND: "",
    ...(stateDir ? { X4_STATE_DIR: stateDir } : {}),
    ...(configDir ? { X4_CONFIG_DIR: configDir } : {}),
    ...(dataDir ? { X4_DATA_DIR: dataDir } : {}),
  };

  const child = spawn(nodeExe, [supervisorPath, serverPath], {
    cwd: appRoot,
    env: childEnv,
    stdio: ["pipe", "pipe", "pipe", "ipc"],
    windowsHide: true,
  });

  let supervisedPid = 0;
  let stderrTail = "";
  let stdoutBuf = "";
  child.stdout?.on("data", chunk => {
    stdoutBuf += chunk.toString("utf8");
    const lines = stdoutBuf.split(/\r?\n/);
    stdoutBuf = lines.pop() ?? "";
    for (const line of lines) {
      const m = line.match(/X4FORGE_SUPERVISED_PID=(\d+)/);
      if (m) supervisedPid = Number(m[1]);
    }
  });
  child.stderr?.on("data", chunk => {
    stderrTail = (stderrTail + chunk.toString("utf8")).slice(-2048);
  });

  let stopPromise: Promise<void> | null = null;
  const stop = (): Promise<void> => {
    if (stopPromise) return stopPromise;
    stopPromise = new Promise<void>(resolve => {
      if (child.exitCode !== null || child.signalCode !== null) {
        resolve();
        return;
      }
      const killTimer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // Already exited.
        }
        resolve();
      }, 4_000);
      killTimer.unref?.();
      child.once("close", () => {
        clearTimeout(killTimer);
        resolve();
      });
      try {
        child.stdin?.end();
      } catch {
        // Ignore broken pipe.
      }
      try {
        if (child.connected) child.disconnect();
      } catch {
        // Ignore IPC disconnect race.
      }
    });
    return stopPromise;
  };

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + Math.max(2_000, options.startupTimeoutMs ?? 30_000);
  try {
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(
          `Cold-bootstrapped Forge sidecar exited early (code=${child.exitCode}, signal=${child.signalCode}): ${stderrTail.trim()}`,
        );
      }
      const probe = await probeForgeEndpoint(baseUrl, {
        ...(supervisedPid > 0 ? { expectedPid: supervisedPid } : {}),
        expectedPort: port,
        allowIsolatedHost,
        timeoutMs: 1_500,
      });
      if (probe.ok) {
        return {
          baseUrl,
          instance: probe.instance,
          supervisedPid: probe.instance.pid,
          child,
          stop,
        };
      }
      await new Promise(r => setTimeout(r, 150));
    }
    throw new Error(`Timed out waiting for cold-bootstrapped Forge sidecar on ${baseUrl}. ${stderrTail.trim()}`);
  } catch (err) {
    await stop();
    throw err;
  }
}

export async function resolveOrBootstrapForgeEndpoint(
  options: {
    env?: NodeJS.ProcessEnv;
    homeDir?: string;
    extensionRoot?: string;
    allowColdBootstrap?: boolean;
    startupTimeoutMs?: number;
  } = {},
): Promise<ResolvedForgeEndpoint> {
  const env = options.env ?? process.env;
  const rawUrl = (env.X4FORGE_URL ?? "").trim();
  const isAuto = !rawUrl || rawUrl.toLowerCase() === "auto";
  const allowIsolatedHost =
    env.X4FORGE_ALLOW_ISOLATED_HOST === "1" || isDiscoveryExplicitlyIsolated(env, options.homeDir);

  if (!isAuto) {
    const explicitProbe = await probeForgeEndpoint(rawUrl, { allowIsolatedHost });
    if (explicitProbe.ok === true) {
      return {
        ok: true,
        baseUrl: explicitProbe.baseUrl,
        source: "explicit-url",
        instance: explicitProbe.instance,
        ownedSidecar: null,
        rejected: [],
      };
    }
    if (explicitProbe.code === "ISOLATED_HOST_REFUSED" || env.X4FORGE_FALLBACK_DISCOVERY !== "1") {
      return {
        ok: false,
        code: explicitProbe.code,
        detail: explicitProbe.detail,
        rejected: [{ candidate: rawUrl, code: explicitProbe.code, detail: explicitProbe.detail }],
      };
    }
  }

  const discovered = await discoverLiveForgeInstance({ env, homeDir: options.homeDir });
  if (discovered.ok) {
    return {
      ok: true,
      baseUrl: discovered.baseUrl,
      source: "discovered-instance",
      instance: discovered.instance,
      ownedSidecar: null,
      rejected: discovered.rejected,
    };
  }

  const shouldColdBootstrap =
    (options.allowColdBootstrap ?? true) && env.X4FORGE_BOOTSTRAP_SIDECAR !== "0";
  if (!shouldColdBootstrap) {
    return {
      ok: false,
      code: "NO_LIVE_FORGE_INSTANCE",
      detail: "No live Forge sidecar was found in discovery and cold bootstrap is disabled.",
      rejected: discovered.rejected,
    };
  }

  try {
    const owned = await spawnOwnedColdSidecar({
      env,
      homeDir: options.homeDir,
      extensionRoot: options.extensionRoot,
      startupTimeoutMs: options.startupTimeoutMs,
    });
    return {
      ok: true,
      baseUrl: owned.baseUrl,
      source: "cold-bootstrap",
      instance: owned.instance,
      ownedSidecar: owned,
      rejected: discovered.rejected,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      code: "COLD_BOOTSTRAP_FAILED",
      detail: err instanceof Error ? err.message : String(err),
      rejected: discovered.rejected,
    };
  }
}

function buildSanitizedCallerEnv(baseEnv: NodeJS.ProcessEnv, resolvedUrl: string): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = { ...baseEnv, X4FORGE_URL: resolvedUrl };
  // Never pass a Studio owner session credential to external MCP or CLI child processes.
  delete next.STUDIO_API_TOKEN;
  return next;
}

async function runCliOrMcpMain(): Promise<void> {
  const args = process.argv.slice(2);

  if (args[0] === "--resolve-json") {
    const result = await resolveOrBootstrapForgeEndpoint({ allowColdBootstrap: false });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (args[0] === "--exec") {
    const [cmd, ...cmdArgs] = args.slice(1);
    if (!cmd) {
      process.stderr.write("[mcp-bootstrap] Usage: mcp-bootstrap.js --exec <command> [args...]\n");
      process.exitCode = 64;
      return;
    }
    const resolved = await resolveOrBootstrapForgeEndpoint({ allowColdBootstrap: true });
    if (resolved.ok === false) {
      process.stderr.write(`[mcp-bootstrap] ${resolved.code}: ${resolved.detail}\n`);
      process.exitCode = 1;
      return;
    }
    try {
      const exitCode = await new Promise<number>(resolve => {
        const child = spawn(cmd, cmdArgs, {
          env: buildSanitizedCallerEnv(process.env, resolved.baseUrl),
          stdio: "inherit",
          windowsHide: true,
        });
        child.on("error", err => {
          process.stderr.write(`[mcp-bootstrap] exec failed: ${err.message}\n`);
          resolve(1);
        });
        child.on("close", code => resolve(code ?? 1));
      });
      process.exitCode = exitCode;
    } finally {
      await resolved.ownedSidecar?.stop();
    }
    return;
  }

  // Default mode: MCP stdio wrapper around immutable `mcp/x4forge-mcp.cjs`.
  // Buffer any early JSON-RPC frames arriving on stdin while sidecar discovery / cold-bootstrap completes.
  const bufferedChunks: Buffer[] = [];
  let stdinEnded = false;
  const onEarlyData = (chunk: Buffer | string) => {
    bufferedChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8"));
  };
  const onEarlyEnd = () => {
    stdinEnded = true;
  };
  process.stdin.on("data", onEarlyData);
  process.stdin.once("end", onEarlyEnd);

  const extRoot = path.resolve(__dirname, "..");
  const shimPath = path.join(extRoot, "mcp", "x4forge-mcp.cjs");
  const resolved = await resolveOrBootstrapForgeEndpoint({
    extensionRoot: extRoot,
    allowColdBootstrap: true,
  });
  const ownedSidecar = resolved.ok === true ? resolved.ownedSidecar : null;
  if (resolved.ok === false) {
    process.stderr.write(`[x4forge-mcp-bootstrap] ${resolved.code}: ${resolved.detail}\n`);
  }
  const targetUrl = resolved.ok === true ? resolved.baseUrl : "http://127.0.0.1:9";

  process.stdin.removeListener("data", onEarlyData);
  process.stdin.removeListener("end", onEarlyEnd);

  const mcpChild = spawn(process.execPath, [shimPath], {
    cwd: extRoot,
    env: buildSanitizedCallerEnv(process.env, targetUrl),
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  mcpChild.stdout?.on("data", chunk => {
    process.stdout.write(chunk);
  });
  mcpChild.stderr?.on("data", chunk => {
    process.stderr.write(chunk);
  });

  for (const chunk of bufferedChunks) {
    mcpChild.stdin?.write(chunk);
  }
  bufferedChunks.length = 0;

  if (stdinEnded) {
    mcpChild.stdin?.end();
  } else {
    process.stdin.on("data", chunk => {
      mcpChild.stdin?.write(chunk);
    });
    process.stdin.once("end", () => {
      mcpChild.stdin?.end();
    });
  }

  const cleanup = async () => {
    try {
      mcpChild.stdin?.end();
    } catch {
      // Ignore.
    }
    await ownedSidecar?.stop();
  };

  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.once(sig, () => {
      void cleanup().finally(() => {
        process.stdin.destroy();
      });
    });
  }

  await new Promise<void>(resolve => {
    mcpChild.once("close", code => {
      if (typeof code === "number" && code !== 0) process.exitCode = code;
      resolve();
    });
  });

  await ownedSidecar?.stop();
  process.stdin.destroy();
}

const isDirectEntrypoint =
  typeof process.argv[1] === "string"
  && /(?:^|[\\/])mcp(?:-b|B)ootstrap\.[cm]?[jt]s$/i.test(process.argv[1]);

if (isDirectEntrypoint) {
  void runCliOrMcpMain().catch(err => {
    process.stderr.write(`[x4forge-mcp-bootstrap] fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
    process.stdin.destroy();
  });
}
