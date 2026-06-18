import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();

const watchedFiles = [
  {
    label: "server.ts",
    env: "X4_GUARD_SERVER_TS",
    relPath: "server.ts",
    minLines: 5100,
    minBytes: 240000,
  },
  {
    label: "src/lib/mdSemantics.ts",
    env: "X4_GUARD_MD_SEMANTICS_TS",
    relPath: "src/lib/mdSemantics.ts",
    minLines: 530,
    minBytes: 30000,
  },
];

function resolveGuardPath(spec) {
  const override = process.env[spec.env];
  if (!override) return path.join(root, spec.relPath);
  return path.isAbsolute(override) ? override : path.join(root, override);
}

function lineCount(text) {
  if (text.length === 0) return 0;
  return text.split(/\r\n|\r|\n/).length;
}

function runTypecheck() {
  console.log("[precommit] npm run typecheck");
  const result = spawnSync("npm run typecheck", {
    cwd: root,
    shell: true,
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`typecheck failed with exit ${result.status ?? "unknown"}`);
  }
}

function checkLargeFiles() {
  if (process.env.X4_ALLOW_SIZE_GUARD_BYPASS === "1") {
    console.warn("[precommit] X4_ALLOW_SIZE_GUARD_BYPASS=1 set; skipping large-file sanity checks.");
    return;
  }

  for (const spec of watchedFiles) {
    const filePath = resolveGuardPath(spec);
    if (!fs.existsSync(filePath)) {
      throw new Error(`${spec.label} missing at ${filePath}`);
    }
    const text = fs.readFileSync(filePath, "utf8");
    const lines = lineCount(text);
    const bytes = Buffer.byteLength(text, "utf8");
    console.log(`[precommit] ${spec.label}: ${lines} lines, ${bytes} bytes`);
    if (lines < spec.minLines || bytes < spec.minBytes) {
      throw new Error(
        `${spec.label} looks suspiciously truncated: ${lines} lines / ${bytes} bytes; expected at least ${spec.minLines} lines / ${spec.minBytes} bytes. ` +
          "If this is intentional, rerun with X4_ALLOW_SIZE_GUARD_BYPASS=1 or commit with --no-verify."
      );
    }
  }
}

try {
  runTypecheck();
  checkLargeFiles();
  console.log("[precommit] OK");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[precommit] BLOCKED: ${message}`);
  process.exit(1);
}
