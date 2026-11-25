import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEV_RELOAD_SENTINEL_RELPATH,
  createDevReloadWatcher,
  parseDevReloadSignal,
  type DevReloadSignal,
} from "../vscode-extension/src/devReloadTrigger";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(30);
  }
  throw new Error(`Condition did not become true within ${timeoutMs}ms`);
}

async function main(): Promise<void> {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "x4forge-dev-reload-"));
  let passed = 0;

  try {
    // 1. Empty forgeRoot -> inactive (zero watcher in packaged production mode)
    {
      let forgeRoot = "";
      const received: DevReloadSignal[] = [];
      const watcher = createDevReloadWatcher({
        getForgeRoot: () => forgeRoot,
        onReloadRequested: async (signal) => {
          received.push(signal);
        },
        debounceMs: 35,
        statIntervalMs: 100,
      });
      assert.equal(watcher.getState().active, false);
      assert.equal(watcher.getState().watchedRoot, null);
      watcher.dispose();
      assert.equal(received.length, 0);
      console.log("[1/6] empty forgeRoot stays inactive: PASS");
      passed++;
    }

    // 2. Pre-existing sentinel on startup does NOT replay a spurious restart
    {
      const repoDir = path.join(tmpRoot, "repo-preexisting");
      const sentinelPath = path.join(repoDir, DEV_RELOAD_SENTINEL_RELPATH);
      fs.mkdirSync(path.dirname(sentinelPath), { recursive: true });
      fs.writeFileSync(
        sentinelPath,
        JSON.stringify({ reloadId: "boot-stale", requestedAt: "2026-11-24T00:00:00Z" }),
        "utf8",
      );

      const received: DevReloadSignal[] = [];
      const watcher = createDevReloadWatcher({
        getForgeRoot: () => repoDir,
        onReloadRequested: async (signal) => {
          received.push(signal);
        },
        debounceMs: 35,
        statIntervalMs: 100,
      });
      assert.equal(watcher.getState().active, true);
      await sleep(220);
      assert.equal(received.length, 0, "Pre-existing sentinel must not fire on startup");
      watcher.dispose();
      console.log("[2/6] startup pre-existing sentinel ignored: PASS");
      passed++;
    }

    // 3. Five consecutive reloads across sentinel directory deletion+recreation (exceeding RESTART_MAX=3)
    {
      const repoDir = path.join(tmpRoot, "repo-burst");
      const sentinelPath = path.join(repoDir, DEV_RELOAD_SENTINEL_RELPATH);
      const sentinelDir = path.dirname(sentinelPath);
      fs.mkdirSync(sentinelDir, { recursive: true });

      const received: DevReloadSignal[] = [];
      const watcher = createDevReloadWatcher({
        getForgeRoot: () => repoDir,
        onReloadRequested: async (signal) => {
          received.push(signal);
        },
        debounceMs: 30,
        statIntervalMs: 100,
      });

      for (let i = 1; i <= 5; i++) {
        // Simulate clean test-results/ wipe and recreation
        fs.rmSync(sentinelDir, { recursive: true, force: true });
        fs.mkdirSync(sentinelDir, { recursive: true });
        fs.writeFileSync(
          sentinelPath,
          JSON.stringify({
            reloadId: `reload-${i}`,
            requestedAt: `2026-11-24T21:00:0${i}Z`,
            reason: `build #${i}`,
            head: "74c1a6b",
          }),
          "utf8",
        );
        await waitFor(() => received.some((item) => item.reloadId === `reload-${i}`));
      }

      assert.equal(received.length, 5);
      assert.deepEqual(
        received.map((item) => item.reloadId),
        ["reload-1", "reload-2", "reload-3", "reload-4", "reload-5"],
      );
      assert.equal(watcher.getState().reloadCount, 5);
      assert.equal(watcher.getState().lastReloadId, "reload-5");
      watcher.dispose();
      console.log("[3/6] 5x consecutive reloads across sentinel directory recreation: PASS");
      passed++;
    }

    // 4. Overlapping sentinel update during in-flight restart serializes without overlap
    {
      const repoDir = path.join(tmpRoot, "repo-serialize");
      const sentinelPath = path.join(repoDir, DEV_RELOAD_SENTINEL_RELPATH);
      fs.mkdirSync(path.dirname(sentinelPath), { recursive: true });

      let activeConcurrency = 0;
      let maxConcurrency = 0;
      const received: string[] = [];
      let releaseFirst!: () => void;
      const firstGate = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });

      const watcher = createDevReloadWatcher({
        getForgeRoot: () => repoDir,
        onReloadRequested: async (signal) => {
          activeConcurrency++;
          maxConcurrency = Math.max(maxConcurrency, activeConcurrency);
          received.push(signal.reloadId);
          if (signal.reloadId === "first") {
            await firstGate;
          }
          activeConcurrency--;
        },
        debounceMs: 25,
        statIntervalMs: 100,
      });

      fs.writeFileSync(sentinelPath, JSON.stringify({ reloadId: "first" }), "utf8");
      await waitFor(() => received.includes("first"));

      // Write two updates while "first" is still in flight; latest ("third") must run once after "first" finishes.
      fs.writeFileSync(sentinelPath, JSON.stringify({ reloadId: "second" }), "utf8");
      await sleep(50);
      fs.writeFileSync(sentinelPath, JSON.stringify({ reloadId: "third" }), "utf8");
      await watcher.triggerCheckNow();

      releaseFirst();
      await waitFor(() => received.includes("third"));

      assert.equal(maxConcurrency, 1, "Reloads must never overlap concurrently");
      assert.equal(received[0], "first");
      assert.equal(received[received.length - 1], "third");
      watcher.dispose();
      console.log("[4/6] serialized overlapping reload queue: PASS");
      passed++;
    }

    // 5. Negative paths: malformed JSON, array, blank, oversized, and non-directory forgeRoot
    {
      assert.equal(parseDevReloadSignal("", "/tmp/.forge-dev-reload"), null);
      assert.equal(parseDevReloadSignal("   ", "/tmp/.forge-dev-reload"), null);
      assert.equal(parseDevReloadSignal("{broken", "/tmp/.forge-dev-reload"), null);
      assert.equal(parseDevReloadSignal("[1,2,3]", "/tmp/.forge-dev-reload"), null);
      assert.equal(parseDevReloadSignal("x".repeat(5000), "/tmp/.forge-dev-reload"), null);

      const repoDir = path.join(tmpRoot, "repo-negative");
      const sentinelPath = path.join(repoDir, DEV_RELOAD_SENTINEL_RELPATH);
      fs.mkdirSync(path.dirname(sentinelPath), { recursive: true });
      const logs: string[] = [];
      const received: DevReloadSignal[] = [];

      let currentRoot = path.join(tmpRoot, "does-not-exist");
      const watcher = createDevReloadWatcher({
        getForgeRoot: () => currentRoot,
        onReloadRequested: async (signal) => {
          received.push(signal);
        },
        log: (msg) => logs.push(msg),
        debounceMs: 25,
        statIntervalMs: 100,
      });
      assert.equal(watcher.getState().active, false);

      currentRoot = repoDir;
      watcher.refreshConfiguration();
      assert.equal(watcher.getState().active, true);

      fs.writeFileSync(sentinelPath, "{not-valid-json", "utf8");
      await watcher.triggerCheckNow();
      assert.equal(received.length, 0);
      assert.ok(logs.some((line) => line.includes("sentinel ignored")));
      watcher.dispose();
      console.log("[5/6] negative-path malformed/missing inputs refused: PASS");
      passed++;
    }

    // 6. Manifest wiring: x4forge.restartSidecar present in commands + viewsWelcome
    {
      const scriptDir = path.dirname(fileURLToPath(import.meta.url));
      const pkgPath = path.resolve(scriptDir, "..", "vscode-extension", "package.json");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
        contributes?: {
          commands?: Array<{ command?: string; title?: string }>;
          viewsWelcome?: Array<{ contents?: string }>;
        };
      };
      const cmd = (pkg.contributes?.commands || []).find((c) => c.command === "x4forge.restartSidecar");
      assert.ok(cmd, "x4forge.restartSidecar must be declared in contributes.commands");
      assert.equal(cmd.title, "X4 Forge: Restart Local Backend");
      const welcome = pkg.contributes?.viewsWelcome?.[0]?.contents || "";
      assert.ok(welcome.includes("(command:x4forge.restartSidecar)"), "viewsWelcome must expose Restart Local Backend");
      console.log("[6/6] extension manifest restart command contract: PASS");
      passed++;
    }

    console.log(`[extension-dev-reload] OK (${passed}/6 passed)`);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

void main().catch((err) => {
  console.error("[extension-dev-reload] FAIL:", err);
  process.exit(1);
});
