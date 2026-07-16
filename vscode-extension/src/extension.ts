/**
 * X4 Forge Studio — VS Code extension controller (proof-of-concept, B41).
 *
 * Thin shell over the EXISTING Forge product: the React app is rendered in a webview
 * (full-bleed iframe to a loopback origin) and the EXISTING Express backend runs as a
 * managed sidecar (dist/server.cjs, NODE_ENV=production) on a dynamically selected
 * loopback port with a per-session bearer token. No core Forge code is imported here
 * and no core file knows this shell exists.
 *
 * Ownership rules (deliberate):
 *  - ATTACH-FIRST: if an already-running Forge answers the agent-schema probe at
 *    x4forge.attachUrl, we attach and NEVER manage (or kill) that process.
 *  - We only ever stop a backend we spawned ourselves.
 *  - Sidecar state (X4_STATE_DIR) defaults to the extension's global storage — never
 *    inside the installed extension (updates wipe it) and never the live checkout's
 *    .studio-state unless the user explicitly configures it.
 */

import * as vscode from "vscode";
import { spawn, type ChildProcess } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";

interface BackendHandle {
  baseUrl: string;
  /** true = we spawned it and own its lifecycle; false = attached, hands off. */
  owned: boolean;
  child?: ChildProcess;
  port?: number;
  /** Session token for an OWNED sidecar (attach mode has no credential — by design). */
  token?: string;
  /** Node inspector port when spawned under --inspect (B43); 0 when not debugging. */
  debugPort?: number;
}

let backend: BackendHandle | null = null;
let panel: vscode.WebviewPanel | null = null;
let output: vscode.OutputChannel;
let statusItem: vscode.StatusBarItem;
/** Set while deliberately stopping the sidecar so the exit handler stays quiet. */
let stoppingDeliberately = false;

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function log(line: string): void {
  output.appendLine(`[${new Date().toISOString()}] ${line}`);
}

function cfg() {
  const c = vscode.workspace.getConfiguration("x4forge");
  return {
    attachUrl: (c.get<string>("attachUrl") || "").trim().replace(/\/+$/, ""),
    forgeRoot: (c.get<string>("forgeRoot") || "").trim(),
    stateDir: (c.get<string>("stateDir") || "").trim(),
    nodePath: (c.get<string>("nodePath") || "").trim(),
    autoOpen: c.get<boolean>("autoOpen") === true,
    debug: ((c.get<string>("debug") || "off").trim() as "off" | "inspect" | "inspect-brk"),
  };
}

/**
 * Gold-standard debugging: attach the IDE's Node debugger to the sidecar's --inspect port.
 * Works identically in VS Code and Antigravity — both bundle ms-vscode.js-debug (verified),
 * which registers the `node` attach type this config uses. `continueOnAttach` is true for
 * plain --inspect (the process is already running) and false for --inspect-brk (stay paused
 * at the first line so the developer can step through startup).
 */
async function attachSidecarDebugger(debugPort: number, appRoot: string, brk: boolean): Promise<void> {
  try {
    const started = await vscode.debug.startDebugging(undefined, {
      type: "node",
      request: "attach",
      name: "X4 Forge Sidecar",
      address: "127.0.0.1",
      port: debugPort,
      continueOnAttach: !brk,
      sourceMaps: true,
      // When forgeRoot points at a real build, dist/server.cjs.map sits here → TS breakpoints.
      outFiles: [path.join(appRoot, "dist", "**", "*.cjs")],
      skipFiles: ["<node_internals>/**"],
      restart: false,
    });
    log(started
      ? `debugger attached to the sidecar on inspector port ${debugPort} (session "X4 Forge Sidecar")`
      : `debugger attach on port ${debugPort} was not started (is js-debug available in this host?)`);
  } catch (err) {
    log(`debugger attach failed on port ${debugPort}: ${err instanceof Error ? err.message : String(err)} — ` +
      `the inspector is still open; attach manually via chrome://inspect (127.0.0.1:${debugPort}).`);
  }
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Positively identify a Forge backend (not just "some local HTTP server") via the
 * public self-documenting agent schema endpoint.
 */
async function probeForge(baseUrl: string, timeoutMs = 3000): Promise<boolean> {
  const res = await fetchWithTimeout(`${baseUrl}/api/agent/schema`, timeoutMs);
  if (!res || !res.ok) return false;
  try {
    const data = (await res.json()) as { api_version?: unknown; description?: unknown };
    return (
      typeof data.api_version === "string" &&
      typeof data.description === "string" &&
      data.description.includes("X4 Forge")
    );
  } catch {
    return false;
  }
}

/** Ask the OS for a free loopback port. */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => (port ? resolve(port) : reject(new Error("no port assigned"))));
    });
  });
}

/** Verify a node executable actually runs. Returns its version string or null. */
function checkNodeExecutable(nodeExe: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const child = spawn(nodeExe, ["--version"], { windowsHide: true });
      let out = "";
      child.stdout?.on("data", (d) => (out += String(d)));
      child.on("error", () => resolve(null));
      child.on("exit", (code) => resolve(code === 0 ? out.trim() : null));
    } catch {
      resolve(null);
    }
  });
}

function showBackendError(message: string): void {
  log(`ERROR: ${message}`);
  void vscode.window.showErrorMessage(`X4 Forge: ${message}`, "Show Logs").then((pick) => {
    if (pick === "Show Logs") output.show(true);
  });
}

// ---------------------------------------------------------------------------
// Backend acquisition: attach-first, then spawn
// ---------------------------------------------------------------------------

/** Resolve the directory containing dist/server.cjs (+ node_modules). */
function resolveAppRoot(context: vscode.ExtensionContext): { root: string; source: string } | null {
  const { forgeRoot } = cfg();
  const candidates: Array<{ root: string; source: string }> = [];
  if (forgeRoot) candidates.push({ root: forgeRoot, source: "x4forge.forgeRoot setting" });
  candidates.push({
    root: vscode.Uri.joinPath(context.extensionUri, "app").fsPath,
    source: "bundled app inside the extension",
  });
  for (const c of candidates) {
    if (fs.existsSync(path.join(c.root, "dist", "server.cjs"))) return c;
    log(`app root candidate rejected (no dist/server.cjs): ${c.root} (${c.source})`);
  }
  return null;
}

function resolveStateDir(context: vscode.ExtensionContext): string {
  const { stateDir } = cfg();
  if (stateDir) return stateDir;
  return path.join(context.globalStorageUri.fsPath, "state");
}

async function spawnSidecar(context: vscode.ExtensionContext): Promise<BackendHandle> {
  const appRoot = resolveAppRoot(context);
  if (!appRoot) {
    throw new Error(
      "No Forge backend found: the extension has no bundled app and x4forge.forgeRoot is not set " +
        "to a built checkout (needs dist/server.cjs). Run the extension's stage-app build or set the setting.",
    );
  }

  const nodeExe = cfg().nodePath || "node";
  const nodeVersion = await checkNodeExecutable(nodeExe);
  if (!nodeVersion) {
    throw new Error(
      `Node.js executable not usable: "${nodeExe}". The Forge sidecar needs a real Node install ` +
        `(its native modules are built for it). Install Node.js or set x4forge.nodePath.`,
    );
  }

  const port = await findFreePort();
  const token = crypto.randomBytes(32).toString("hex");
  const stateDir = resolveStateDir(context);
  fs.mkdirSync(stateDir, { recursive: true });
  // B51: persist the user's Directory Settings (config.json) in global storage, NOT the
  // extension's install dir — the latter is replaced on every extension update, which was
  // wiping the configured game/schema/workspace paths each time the user updated.
  const configDir = path.join(context.globalStorageUri.fsPath, "config");
  fs.mkdirSync(configDir, { recursive: true });

  // B43: gold-standard debugging — spawn under --inspect and auto-attach the IDE debugger.
  const debugMode = cfg().debug;
  const nodeArgs: string[] = [];
  let debugPort = 0;
  if (debugMode !== "off") {
    debugPort = await findFreePort();
    nodeArgs.push(`--${debugMode}=127.0.0.1:${debugPort}`);
  }

  log(`spawning sidecar: ${nodeExe} (${nodeVersion}) ${nodeArgs.join(" ")} dist/server.cjs`.replace(/\s+/g, " "));
  log(`  app root: ${appRoot.root} (${appRoot.source})`);
  log(`  port: ${port} (dynamically selected)  state dir: ${stateDir}`);
  if (debugPort) log(`  DEBUG: node inspector on 127.0.0.1:${debugPort} (${debugMode})`);

  const child = spawn(nodeExe, [...nodeArgs, path.join("dist", "server.cjs")], {
    cwd: appRoot.root,
    windowsHide: true,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      STUDIO_API_TOKEN: token,
      X4_STATE_DIR: stateDir,
      X4_CONFIG_DIR: configDir, // B51: config.json persists across extension updates
      // Defense-in-depth: never allow the dev-only shell route in this shell.
      FORGE_ALLOW_RUN_COMMAND: "",
    },
  });
  child.stdout?.on("data", (d) => output.append(String(d)));
  child.stderr?.on("data", (d) => output.append(String(d)));

  const handle: BackendHandle = { baseUrl: `http://127.0.0.1:${port}`, owned: true, child, port, token, debugPort };

  // Attach the debugger right after spawn (the inspector is up at process start). For
  // --inspect-brk the process is paused at entry until this attach + a manual continue.
  if (debugPort) {
    void attachSidecarDebugger(debugPort, appRoot.root, debugMode === "inspect-brk");
  }

  child.on("exit", (code, signal) => {
    log(`sidecar exited (code=${code}, signal=${signal ?? "none"})`);
    const wasCurrent = backend === handle;
    if (backend === handle) backend = null;
    updateStatus();
    if (wasCurrent && !stoppingDeliberately) {
      showBackendError(
        `The Forge backend exited unexpectedly (code ${code ?? "?"}). ` +
          `The studio view will not work until it is restarted — run "X4 Forge: Open Studio" again.`,
      );
    }
  });
  child.on("error", (err) => {
    log(`sidecar spawn error: ${err.message}`);
  });

  // Readiness: the server must answer its own public schema endpoint.
  const deadline = Date.now() + (debugMode === "off" ? 30_000 : 120_000);
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Forge backend crashed during startup (exit code ${child.exitCode}). See "X4 Forge" output for its logs.`,
      );
    }
    if (await probeForge(handle.baseUrl, 1500)) {
      log(`sidecar ready at ${handle.baseUrl}`);
      return handle;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  // --inspect-brk pauses the server at entry until the developer continues in the debugger,
  // so a readiness timeout is EXPECTED there — return the handle instead of killing it.
  if (debugMode === "inspect-brk") {
    log(`sidecar is paused at startup (--inspect-brk) — continue execution in the debugger to start the server.`);
    return handle;
  }
  stoppingDeliberately = true;
  try {
    child.kill();
  } finally {
    stoppingDeliberately = false;
  }
  throw new Error("Forge backend did not become ready within 30s. See \"X4 Forge\" output for its logs.");
}

async function ensureBackend(context: vscode.ExtensionContext): Promise<BackendHandle> {
  // Reuse a live handle.
  if (backend) {
    if (await probeForge(backend.baseUrl, 2000)) return backend;
    log(`existing backend at ${backend.baseUrl} no longer answers; discarding handle`);
    if (backend.owned && backend.child && backend.child.exitCode === null) {
      stoppingDeliberately = true;
      try {
        backend.child.kill();
      } finally {
        stoppingDeliberately = false;
      }
    }
    backend = null;
  }

  // Attach-first: an already-running Forge (e.g. the standalone dev stack) wins.
  const { attachUrl } = cfg();
  if (attachUrl) {
    if (await probeForge(attachUrl)) {
      log(`attached to already-running Forge at ${attachUrl} (externally owned — will not be stopped by the extension)`);
      backend = { baseUrl: attachUrl, owned: false };
      updateStatus();
      return backend;
    }
    log(`no Forge answering at ${attachUrl}; starting a managed sidecar`);
  }

  backend = await spawnSidecar(context);
  updateStatus();
  return backend;
}

function stopOwnedSidecar(reason: string): boolean {
  if (!backend?.owned || !backend.child) return false;
  log(`stopping owned sidecar (${reason})`);
  stoppingDeliberately = true;
  try {
    backend.child.kill();
  } finally {
    stoppingDeliberately = false;
  }
  backend = null;
  updateStatus();
  return true;
}

// ---------------------------------------------------------------------------
// Webview
// ---------------------------------------------------------------------------

function webviewHtml(webview: vscode.Webview, forgeUrl: string, mode: string): string {
  // The Forge page is served BY ITS OWN BACKEND (token pre-injected, all API calls
  // same-origin inside the frame) — the webview shell only needs to host the iframe.
  // Loopback http is a "potentially trustworthy" origin, so framing it is allowed.
  const csp = [
    "default-src 'none'",
    "frame-src http://127.0.0.1:* http://localhost:*",
    "style-src 'unsafe-inline'",
  ].join("; ");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #0b0e14; }
    iframe { border: 0; width: 100%; height: 100%; display: block; }
    .badge { position: fixed; right: 6px; bottom: 4px; font: 10px sans-serif; color: #556; pointer-events: none; }
  </style>
</head>
<body>
  <iframe src="${forgeUrl}/" allow="clipboard-read; clipboard-write"></iframe>
  <div class="badge">X4 Forge Studio — ${mode}</div>
</body>
</html>`;
}

function updateStatus(): void {
  if (!backend) {
    statusItem.hide();
    return;
  }
  statusItem.text = backend.owned
    ? `$(rocket) X4 Forge: sidecar :${backend.port}`
    : `$(plug) X4 Forge: attached ${backend.baseUrl.replace(/^https?:\/\//, "")}`;
  statusItem.tooltip = backend.owned
    ? `Managed Forge backend on ${backend.baseUrl} (started by this extension; stopped on deactivate)`
    : `Attached to an externally-run Forge at ${backend.baseUrl} (the extension will never stop it)`;
  statusItem.command = "x4forge.showLogs";
  statusItem.show();
}

async function openStudio(context: vscode.ExtensionContext): Promise<void> {
  if (panel) {
    panel.reveal();
    return;
  }
  let handle: BackendHandle;
  try {
    handle = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "X4 Forge: starting backend…" },
      () => ensureBackend(context),
    );
  } catch (err) {
    showBackendError(err instanceof Error ? err.message : String(err));
    return;
  }

  panel = vscode.window.createWebviewPanel("x4forge.studio", "X4 Forge Studio", vscode.ViewColumn.One, {
    enableScripts: true,
    retainContextWhenHidden: true,
  });
  panel.webview.html = webviewHtml(
    panel.webview,
    handle.baseUrl,
    handle.owned ? `managed sidecar on port ${handle.port}` : `attached to ${handle.baseUrl}`,
  );
  panel.onDidDispose(() => {
    // Keep the sidecar warm for quick reopen; it is released on deactivate/stop command.
    panel = null;
  });
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel("X4 Forge");
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  context.subscriptions.push(output, statusItem);

  log(`extension activated (host: ${vscode.env.appName} ${vscode.version})`);

  // B50: the Activity Bar launcher view. An empty tree provider makes the view render its
  // `viewsWelcome` buttons (Open Studio / Create Agent Key / Logs / Stop) — a click-to-run
  // entry point so users never need the command palette.
  const emptyLauncher: vscode.TreeDataProvider<vscode.TreeItem> = {
    getChildren: () => [],
    getTreeItem: (e) => e,
  };
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("x4forge.launcher", emptyLauncher),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("x4forge.openStudio", () => openStudio(context)),
    vscode.commands.registerCommand("x4forge.showLogs", () => output.show(true)),
    vscode.commands.registerCommand("x4forge.stopSidecar", () => {
      if (stopOwnedSidecar("stop command")) {
        void vscode.window.showInformationMessage("X4 Forge: backend sidecar stopped.");
      } else if (backend && !backend.owned) {
        void vscode.window.showInformationMessage(
          "X4 Forge: attached to an externally-run Forge — the extension will not stop it.",
        );
      } else {
        void vscode.window.showInformationMessage("X4 Forge: no managed sidecar is running.");
      }
    }),
  );

  // B42: mint a scoped, expiring agent key against the OWNED sidecar and hand it to the
  // user's clipboard — closes the "external agents can't discover the sidecar token" gap.
  context.subscriptions.push(
    vscode.commands.registerCommand("x4forge.createAgentKey", async () => {
      try {
        const handle = await ensureBackend(context);
        if (!handle.owned || !handle.token) {
          void vscode.window.showInformationMessage(
            "X4 Forge: attached to an externally-run Forge — create keys in its UI (AGENT API → Agent Keys tab).",
          );
          return;
        }
        const label = await vscode.window.showInputBox({
          prompt: "Key label (which agent is this for?)",
          placeHolder: "e.g. codex-agent",
          validateInput: (v) => (v.trim() ? undefined : "Label required"),
        });
        if (!label) return;
        const scope = await vscode.window.showQuickPick(
          [
            { label: "read", description: "inspect only (GET)" },
            { label: "write", description: "edit / compile / validate / package — no deploys, no spend" },
            { label: "deploy", description: "full API power" },
          ],
          { placeHolder: "Key scope" },
        );
        if (!scope) return;
        const ttl = await vscode.window.showQuickPick(
          [
            { label: "1h", description: "expires in 1 hour" },
            { label: "24h", description: "expires in 24 hours" },
            { label: "7d", description: "expires in 7 days" },
            { label: "30d", description: "expires in 30 days" },
            { label: "never", description: "never expires (revoke manually)" },
          ],
          { placeHolder: "Key lifetime" },
        );
        if (!ttl) return;
        const res = await fetch(`${handle.baseUrl}/api/agent/keys`, {
          method: "POST",
          headers: { Authorization: `Bearer ${handle.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ label: label.trim(), scope: scope.label, ttl: ttl.label }),
        });
        const data = (await res.json()) as { token?: string; error?: string };
        if (!res.ok || !data.token) throw new Error(data.error || `HTTP ${res.status}`);
        await vscode.env.clipboard.writeText(data.token);
        log(`agent key created: label="${label.trim()}" scope=${scope.label} ttl=${ttl.label}`);
        log(`  endpoint: ${handle.baseUrl}/api  ·  header: Authorization: Bearer <key on your clipboard>`);
        void vscode.window
          .showInformationMessage(
            `X4 Forge: key "${label.trim()}" (${scope.label}, ${ttl.label}) copied to clipboard — it will not be shown again. Endpoint: ${handle.baseUrl}`,
            "Show Logs",
          )
          .then((pick) => pick === "Show Logs" && output.show(true));
      } catch (err) {
        showBackendError(`Could not create agent key: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),
  );

  // Opt-in convenience (x4forge.autoOpen): open the studio once the workspace loads.
  // Only ever runs in trusted workspaces — the manifest disables the extension
  // entirely when untrusted, so activate() is not called there.
  if (cfg().autoOpen) {
    log("x4forge.autoOpen is set — opening the studio");
    void openStudio(context);
  }
}

export function deactivate(): void {
  stopOwnedSidecar("extension deactivate");
}
