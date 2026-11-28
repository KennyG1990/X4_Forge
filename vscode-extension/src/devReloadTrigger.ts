import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const DEV_RELOAD_SENTINEL_DIRNAME = "test-results";
export const DEV_RELOAD_SENTINEL_FILENAME = ".forge-dev-reload";
export const DEV_RELOAD_SENTINEL_RELPATH = path.join(DEV_RELOAD_SENTINEL_DIRNAME, DEV_RELOAD_SENTINEL_FILENAME);
const MAX_SENTINEL_BYTES = 4_096;

export interface DevReloadSignal {
  reloadId: string;
  fingerprint: string;
  requestedAt: string | null;
  reason: string;
  head: string | null;
  recoverIfStopped: boolean;
  sentinelPath: string;
}

export interface DevReloadWatcherState {
  active: boolean;
  watchedRoot: string | null;
  watchedDistDir: string | null;
  inFlight: boolean;
  reloadCount: number;
  lastReloadId: string | null;
}

export interface DevReloadWatcherOptions {
  getForgeRoot: () => string;
  onReloadRequested: (signal: DevReloadSignal) => Promise<void>;
  log?: (message: string) => void;
  debounceMs?: number;
  statIntervalMs?: number;
}

export interface DevReloadWatcher {
  refreshConfiguration(): void;
  triggerCheckNow(): Promise<void>;
  getState(): DevReloadWatcherState;
  dispose(): void;
}

function sanitizeReloadId(candidate: unknown, fallback: string): string {
  if (typeof candidate !== "string") return fallback;
  const trimmed = candidate.trim();
  if (!trimmed) return fallback;
  const cleaned = trimmed.replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 96);
  return cleaned || fallback;
}

export function parseDevReloadSignal(raw: string, sentinelPath: string): DevReloadSignal | null {
  if (typeof raw !== "string") return null;
  if (Buffer.byteLength(raw, "utf8") > MAX_SENTINEL_BYTES) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const fingerprint = crypto.createHash("sha256").update(trimmed, "utf8").digest("hex");
  const shortHash = fingerprint.slice(0, 12);

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown> | null;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      const reloadId = sanitizeReloadId(parsed.reloadId ?? parsed.nonce ?? parsed.requestedAt, shortHash);
      const requestedAt = typeof parsed.requestedAt === "string" && parsed.requestedAt.trim()
        ? parsed.requestedAt.trim().slice(0, 64)
        : null;
      const reason = typeof parsed.reason === "string" && parsed.reason.trim()
        ? parsed.reason.trim().slice(0, 120)
        : "forgeRoot live-reload sentinel";
      const rawHead = parsed.head ?? parsed.commit;
      const head = typeof rawHead === "string" && /^[a-f0-9]{7,40}$/i.test(rawHead.trim())
        ? rawHead.trim()
        : null;
      const recoverIfStopped = parsed.recoverIfStopped === true;
      return { reloadId, fingerprint, requestedAt, reason, head, recoverIfStopped, sentinelPath };
    } catch {
      return null;
    }
  }

  if (trimmed.includes("\n") || trimmed.includes("\r")) return null;
  return {
    reloadId: sanitizeReloadId(trimmed, shortHash),
    fingerprint,
    requestedAt: null,
    reason: "forgeRoot live-reload sentinel",
    head: null,
    recoverIfStopped: false,
    sentinelPath,
  };
}

function readSentinelSnapshot(sentinelPath: string): { fingerprint: string; raw: string } | null {
  try {
    const stat = fs.statSync(sentinelPath);
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_SENTINEL_BYTES) return null;
    const raw = fs.readFileSync(sentinelPath, "utf8");
    if (!raw.trim()) return null;
    const digest = crypto.createHash("sha256").update(raw.trim(), "utf8").digest("hex");
    return {
      fingerprint: `${stat.mtimeMs}:${stat.size}:${digest}`,
      raw,
    };
  } catch {
    return null;
  }
}

export function createDevReloadWatcher(options: DevReloadWatcherOptions): DevReloadWatcher {
  const debounceMs = Math.max(25, options.debounceMs ?? 250);
  const statIntervalMs = Math.max(100, options.statIntervalMs ?? 750);
  const log = options.log ?? (() => {});

  let disposed = false;
  let activeRoot: string | null = null;
  let watchedDistDir: string | null = null;
  let dirWatcher: fs.FSWatcher | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let statTimer: ReturnType<typeof setInterval> | null = null;
  let lastSeenFingerprint: string | null = null;
  let lastHandledFingerprint: string | null = null;
  let inFlight = false;
  let pendingSignal: { fingerprint: string; signal: DevReloadSignal } | null = null;
  let reloadCount = 0;
  let lastReloadId: string | null = null;

  function closeDirWatcher(): void {
    if (dirWatcher) {
      try { dirWatcher.close(); } catch { /* ignore */ }
      dirWatcher = null;
    }
    watchedDistDir = null;
  }

  function clearTimers(): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (statTimer) {
      clearInterval(statTimer);
      statTimer = null;
    }
  }

  function stopActiveWatch(): void {
    clearTimers();
    closeDirWatcher();
    activeRoot = null;
    lastSeenFingerprint = null;
    lastHandledFingerprint = null;
    pendingSignal = null;
  }

  function scheduleCheck(): void {
    if (disposed || !activeRoot) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void evaluateSentinel();
    }, debounceMs);
    debounceTimer.unref?.();
  }

  function ensureDistDirectoryWatch(distDir: string): void {
    if (disposed || !activeRoot) return;
    if (dirWatcher && watchedDistDir === distDir && fs.existsSync(distDir)) return;
    closeDirWatcher();
    if (!fs.existsSync(distDir)) return;
    try {
      const watcher = fs.watch(distDir, { persistent: false }, (_eventType, filename) => {
        if (disposed) return;
        if (filename && String(filename).toLowerCase() !== DEV_RELOAD_SENTINEL_FILENAME) return;
        scheduleCheck();
      });
      watcher.on("error", () => {
        closeDirWatcher();
      });
      watcher.unref?.();
      dirWatcher = watcher;
      watchedDistDir = distDir;
    } catch {
      closeDirWatcher();
    }
  }

  async function drainQueue(): Promise<void> {
    if (inFlight || disposed) return;
    inFlight = true;
    try {
      while (!disposed && pendingSignal) {
        const next = pendingSignal;
        pendingSignal = null;
        if (next.fingerprint === lastHandledFingerprint) continue;
        lastHandledFingerprint = next.fingerprint;
        try {
          await options.onReloadRequested(next.signal);
          reloadCount++;
          lastReloadId = next.signal.reloadId;
        } catch (err) {
          log(`reload handler failed (${next.signal.reloadId}): ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } finally {
      inFlight = false;
    }
  }

  async function evaluateSentinel(): Promise<void> {
    if (disposed || !activeRoot) return;
    const sentinelDir = path.join(activeRoot, DEV_RELOAD_SENTINEL_DIRNAME);
    ensureDistDirectoryWatch(sentinelDir);
    const sentinelPath = path.join(activeRoot, DEV_RELOAD_SENTINEL_RELPATH);
    const snapshot = readSentinelSnapshot(sentinelPath);
    if (!snapshot) return;
    if (snapshot.fingerprint === lastSeenFingerprint) return;
    lastSeenFingerprint = snapshot.fingerprint;

    const signal = parseDevReloadSignal(snapshot.raw, sentinelPath);
    if (!signal) {
      log(`sentinel ignored (invalid payload): ${sentinelPath}`);
      return;
    }
    pendingSignal = { fingerprint: snapshot.fingerprint, signal };
    await drainQueue();
  }

  function refreshConfiguration(): void {
    if (disposed) return;
    const rawRoot = String(options.getForgeRoot() || "").trim();
    if (!rawRoot) {
      if (activeRoot) {
        log("watcher disabled (x4forge.forgeRoot cleared)");
        stopActiveWatch();
      }
      return;
    }

    const resolvedRoot = path.resolve(rawRoot);
    let rootStat: fs.Stats | null = null;
    try {
      rootStat = fs.statSync(resolvedRoot);
    } catch {
      rootStat = null;
    }
    if (!rootStat?.isDirectory()) {
      if (activeRoot) stopActiveWatch();
      log(`watcher inactive (x4forge.forgeRoot is not a directory): ${resolvedRoot}`);
      return;
    }

    if (activeRoot === resolvedRoot) {
      ensureDistDirectoryWatch(path.join(resolvedRoot, DEV_RELOAD_SENTINEL_DIRNAME));
      return;
    }

    stopActiveWatch();
    activeRoot = resolvedRoot;

    const sentinelPath = path.join(resolvedRoot, DEV_RELOAD_SENTINEL_RELPATH);
    const initial = readSentinelSnapshot(sentinelPath);
    lastSeenFingerprint = initial?.fingerprint ?? null;
    lastHandledFingerprint = initial?.fingerprint ?? null;

    ensureDistDirectoryWatch(path.join(resolvedRoot, DEV_RELOAD_SENTINEL_DIRNAME));
    statTimer = setInterval(() => {
      if (disposed || !activeRoot) return;
      ensureDistDirectoryWatch(path.join(activeRoot, DEV_RELOAD_SENTINEL_DIRNAME));
      const current = readSentinelSnapshot(path.join(activeRoot, DEV_RELOAD_SENTINEL_RELPATH));
      if (current && current.fingerprint !== lastSeenFingerprint) {
        scheduleCheck();
      }
    }, statIntervalMs);
    statTimer.unref?.();

    log(`watcher active on ${sentinelPath}`);
  }

  refreshConfiguration();

  return {
    refreshConfiguration,
    triggerCheckNow: evaluateSentinel,
    getState: () => ({
      active: !disposed && activeRoot !== null,
      watchedRoot: disposed ? null : activeRoot,
      watchedDistDir: disposed ? null : watchedDistDir,
      inFlight,
      reloadCount,
      lastReloadId,
    }),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      stopActiveWatch();
    },
  };
}
