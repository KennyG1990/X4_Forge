import fs from "node:fs";
import console from "node:console";
import process from "node:process";
import { Buffer } from "node:buffer";
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

// B32 (2026-07-12): recurring-mistake tripwire. A JSX expression-container comment as the
// FIRST thing inside `return (` breaks the compile — shipped twice in two days (07-11
// GuidedRail, 07-12 GlobalSearch) because a banked lesson is not a recall mechanism.
// Extensible home: add future mechanical-mistake patterns to TRIPWIRES.
const TRIPWIRES = [
  {
    name: "jsx-comment-before-root",
    pattern: /return\s*\(\s*\{\s*\/\*/,
    message: "JSX comment as the first thing inside `return (` — move it above the return; it breaks the compile (banked 07-11, recurred 07-12).",
  },
];

function walkSources(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkSources(full, out);
    else if (/\.(tsx|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function checkTripwires() {
  const files = walkSources(path.join(root, "src"), []);
  const hits = [];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const trip of TRIPWIRES) {
      if (trip.pattern.test(text)) {
        hits.push(`${path.relative(root, file)}: [${trip.name}] ${trip.message}`);
      }
    }
  }
  console.log(`[precommit] tripwires: ${TRIPWIRES.length} pattern(s) over ${files.length} source files — ${hits.length} hit(s)`);
  if (hits.length > 0) {
    throw new Error(`tripwire hit(s):\n  ${hits.join("\n  ")}`);
  }
}

// B30 (2026-07-12): canon lives in three in-repo mirrors (CLAUDE.md/AGENTS.md/GEMINI.md),
// synced by hand — the exact drift class that let an agent work a full session without
// the workflow (2026-07-09). Byte-identical or the commit blocks.
const CANON_MIRRORS = ["CLAUDE.md", "AGENTS.md", "GEMINI.md"];

function checkMirrorDrift() {
  const contents = CANON_MIRRORS.map((name) => {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) throw new Error(`canon mirror missing: ${name}`);
    return { name, text: fs.readFileSync(p, "utf8") };
  });
  const drifted = contents.filter((c) => c.text !== contents[0].text).map((c) => c.name);
  console.log(`[precommit] canon mirrors: ${CANON_MIRRORS.join(" = ")} — ${drifted.length === 0 ? "identical" : "DRIFTED"}`);
  if (drifted.length > 0) {
    throw new Error(
      `canon mirror drift: ${drifted.join(", ")} differ(s) from ${contents[0].name}. ` +
        "Edit ONE canon and copy it to the other two — a decree without all mirrors updated is a future agent's landmine."
    );
  }
}

// B64-T2 (2026-07-19): the e2e verdict logic IS the gate — a broken verdict is a
// false-green (the worst failure mode). Guard it here so an edit to run-e2e.mjs can
// never silently break how PASS/FAIL is decided.
function checkE2eVerdict() {
  console.log("[precommit] e2e verdict selftest");
  for (const command of ["node scripts/run-e2e.mjs --selftest", "node scripts/e2e-runner-lifecycle.selftest.mjs", "node scripts/e2e-runner-integration.selftest.mjs"]) {
    const result = spawnSync(command, { cwd: root, shell: true, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`e2e verdict selftest failed with exit ${result.status ?? "unknown"}: ${command}`);
  }
}

function checkE2eRuntimeBootstrap() {
  console.log("[precommit] e2e runtime bootstrap selftest");
  const result = spawnSync("npm run test:e2e-runtime-bootstrap", { cwd: root, shell: true, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`e2e runtime bootstrap selftest failed with exit ${result.status ?? "unknown"}`);
}

function checkE2eViteLifecycle() {
  console.log("[precommit] e2e Vite lifecycle selftest");
  const result = spawnSync("npm run test:e2e-vite-server", { cwd: root, shell: true, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`e2e Vite lifecycle selftest failed with exit ${result.status ?? "unknown"}`);
}

function checkE2eRequestTransport() {
  console.log("[precommit] E2E API request transport selftest");
  const result = spawnSync("npm run test:e2e-request-transport", { cwd: root, shell: true, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`E2E request transport selftest failed with exit ${result.status ?? "unknown"}`);
}

function checkBackendRecovery() {
  console.log("[precommit] extension backend recovery selftest");
  const result = spawnSync("npm run test:extension-backend-recovery", { cwd: root, shell: true, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`backend recovery selftest failed with exit ${result.status ?? "unknown"}`);
}

function checkRuntimeStaging() {
  console.log("[precommit] explicit runtime staging selftest");
  const result = spawnSync(process.execPath, ["vscode-extension/scripts/stage-app.mjs", "--selftest"], { cwd: root, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`runtime staging selftest failed with exit ${result.status ?? "unknown"}`);
}

function checkStagedProbeCleanup() {
  console.log("[precommit] staged probe exact-child cleanup selftest");
  const result = spawnSync(process.execPath, ["--max-old-space-size=512", "vscode-extension/scripts/probe-staged-app.mjs", "--cleanup-selftest"], {
    cwd: root, stdio: "inherit", windowsHide: true, timeout: 30_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`staged probe cleanup selftest failed with exit ${result.status ?? "unknown"}`);
}

function checkProductCopy() {
  console.log("[precommit] shipped product-copy guard");
  const result = spawnSync("npm run test:product-copy", { cwd: root, shell: true, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`product-copy guard failed with exit ${result.status ?? "unknown"}`);
}

function checkDurableWriters() {
  console.log("[precommit] durable writer inventory");
  const result = spawnSync("node scripts/durable-writer-audit.mjs --selftest && tsx vscode-extension/src/durableWrite.ts", { cwd: root, shell: true, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`durable writer inventory failed with exit ${result.status ?? "unknown"}`);
}

function checkCapabilityContracts() {
  for (const command of ["npm run test:mcp-capabilities", "npm run test:configuration-grant", "npm run test:configuration-operations"]) {
    console.log(`[precommit] ${command}`);
    const result = spawnSync(command, { cwd: root, shell: true, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${command} failed with exit ${result.status ?? "unknown"}`);
  }
}

function checkActionReceiptCoverage() {
  console.log("[precommit] action-receipt coverage audit");
  const result = spawnSync("npm run test:action-receipt-coverage", {
    cwd: root,
    shell: true,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`action-receipt coverage audit failed with exit ${result.status ?? "unknown"}`);
  }
}

function checkNativePerformanceFoundation() {
  console.log("[precommit] bounded native performance foundation and IPC owners");
  const result = spawnSync("npm run test:native-performance", { cwd: root, shell: true, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`native performance IPC checks failed with exit ${result.status ?? "unknown"}`);
}

function checkFocusedPerformanceAndXml() {
  for (const file of [
    "src/lib/forgePerformance.selftest.ts",
    "src/server/forgePerformance.selftest.ts",
    "src/lib/webviewPerformance.selftest.ts",
    "src/components/PerformancePanel.selftest.tsx",
    "src/server/xmlReferenceMap.selftest.ts",
  ]) {
    console.log(`[precommit] focused selftest ${file}`);
    const result = spawnSync(process.execPath, ["--max-old-space-size=512", "--import", "tsx", file], {
      cwd: root,
      stdio: "inherit",
      windowsHide: true,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${file} failed with exit ${result.status ?? "unknown"}${result.signal ? ` (${result.signal})` : ""}`);
  }
}

function checkPrecommitOrchestration() {
  console.log("[precommit] injected orchestration selftest");
  const result = spawnSync(process.execPath, ["--max-old-space-size=512", "scripts/precommit-check.mjs", "--selftest"], {
    cwd: root, stdio: "inherit", windowsHide: true, timeout: 30_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`precommit orchestration selftest failed with exit ${result.status ?? "unknown"}`);
}

function createPrecommitSelftestReadFile(read, deny) {
  return (value, ...options) => {
    // Inspect only the rest-array values; never evaluate option-object properties.
    if (options.length > 1 || (options[0] !== undefined && options[0] !== "utf8" && options[0] !== "utf-8")) return deny();
    return read(value, ...options);
  };
}

/** Actual source under a dependency fence; this does not run any audited program. */
async function runPrecommitOrchestrationSelftest() {
  const [{ default: ts }, { default: vm }] = await Promise.all([import("typescript"), import("node:vm")]);
  const sourcePath = path.resolve(root, "scripts/precommit-check.mjs");
  if (path.resolve(process.argv[1] || "") !== sourcePath || fs.lstatSync(sourcePath).isSymbolicLink()) {
    throw new Error("PRECOMMIT_SELFTEST_SOURCE_INVALID");
  }
  const source = fs.readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const checks = [];
  const expect = value => { if (!value) throw new Error("PRECOMMIT_SELFTEST_ASSERTION"); };
  const writerSelftests = "node scripts/durable-writer-audit.mjs --selftest && tsx vscode-extension/src/durableWrite.ts";
  const receipt = "npm run test:action-receipt-coverage";
  const typecheck = "npm run typecheck";
  const direct = args => [process.execPath, ...args].join(" ");
  const selftestCommand = direct(["--max-old-space-size=512", "scripts/precommit-check.mjs", "--selftest"]);
  const expectedCommands = [
    selftestCommand,
    "npm run test:e2e-runtime-bootstrap",
    "node scripts/run-e2e.mjs --selftest",
    "node scripts/e2e-runner-lifecycle.selftest.mjs",
    "node scripts/e2e-runner-integration.selftest.mjs",
    "npm run test:e2e-vite-server",
    "npm run test:e2e-request-transport",
    "npm run test:extension-backend-recovery",
    direct(["vscode-extension/scripts/stage-app.mjs", "--selftest"]),
    direct(["--max-old-space-size=512", "vscode-extension/scripts/probe-staged-app.mjs", "--cleanup-selftest"]),
    "npm run test:product-copy",
    writerSelftests,
    "npm run test:mcp-capabilities",
    "npm run test:configuration-grant",
    "npm run test:configuration-operations",
    ...["src/lib/forgePerformance.selftest.ts", "src/server/forgePerformance.selftest.ts",
      "src/lib/webviewPerformance.selftest.ts", "src/components/PerformancePanel.selftest.tsx",
      "src/server/xmlReferenceMap.selftest.ts"].map(file => direct(["--max-old-space-size=512", "--import", "tsx", file])),
    "npm run test:native-performance", receipt, typecheck,
  ];
  let fakeSpawnCalls = 0, deniedEffectAttempts = 0;
  function fixture(selectFailure = () => false, failureKind = "nonzero") {
    const calls = [], logs = [];
    let exitCode = 0, escaped = false, injectedFailure = false;
    const exit = Object.freeze({ controlledExit: true });
    const forbidden = () => { deniedEffectAttempts++; throw new Error("PRECOMMIT_SELFTEST_EFFECT_DENIED"); };
    const ownedPath = (value, allowMissing = false) => {
      if (typeof value !== "string") return forbidden();
      const resolved = path.resolve(value), rel = path.relative(root, resolved);
      if (path.isAbsolute(rel) || rel.split(path.sep)[0] === "..") return forbidden();
      if (allowMissing && !fs.existsSync(resolved)) return resolved;
      const physical = fs.realpathSync.native(resolved), realRel = path.relative(fs.realpathSync.native(root), physical);
      if (path.isAbsolute(realRel) || realRel.split(path.sep)[0] === "..") return forbidden();
      return resolved;
    };
    const readOnlyFs = new Proxy({}, { get(_target, key) {
      if (key === "__esModule") return false;
      if (key === "existsSync") return value => fs.existsSync(ownedPath(value, true));
      if (key === "readFileSync") return createPrecommitSelftestReadFile(
        (value, ...args) => fs.readFileSync(ownedPath(value), ...args), forbidden);
      if (["readdirSync", "lstatSync", "statSync"].includes(key)) {
        return (value, ...args) => fs[key](ownedPath(value), ...args);
      }
      return forbidden;
    } });
    const fakeConsole = Object.fromEntries(["log", "warn", "error"].map(name => [name,
      (...values) => { logs.push({ level: name, text: values.map(String).join(" ") }); }]));
    const fakeProcess = { argv: [process.execPath, sourcePath], execPath: process.execPath,
      cwd: () => root, env: {}, exit(code) { exitCode = code; throw exit; },
      kill: forbidden, abort: forbidden };
    const fakeSpawn = (file, argsOrOptions, directOptions) => {
      fakeSpawnCalls++;
      const args = Array.isArray(argsOrOptions) ? argsOrOptions : [];
      const options = Array.isArray(argsOrOptions) ? directOptions : argsOrOptions;
      const row = { command: args.length ? [file, ...args].join(" ") : file, file, args, options };
      calls.push(row);
      if (selectFailure(row.command)) {
        injectedFailure = true;
        if (failureKind === "throw") throw new Error("PRECOMMIT_SELFTEST_SPAWN_THROW");
        if (failureKind === "error") return { status: null, error: new Error("PRECOMMIT_SELFTEST_SPAWN_ERROR") };
        return { status: 1 };
      }
      return { status: 0 };
    };
    const module = { exports: {} };
    const sandbox = {
      module, exports: module.exports, __filename: sourcePath, __dirname: path.dirname(sourcePath),
      require(id) {
        if (id === "node:fs") return readOnlyFs;
        if (id === "node:console") return fakeConsole;
        if (id === "node:process") return fakeProcess;
        if (id === "node:buffer") return { Buffer };
        if (id === "node:path") return path;
        if (id === "node:child_process") return { spawnSync: fakeSpawn, spawn: forbidden, exec: forbidden, fork: forbidden };
        return forbidden();
      },
      process: fakeProcess, console: fakeConsole, Buffer,
      setTimeout: forbidden, setInterval: forbidden, setImmediate: forbidden,
      clearTimeout: forbidden, clearInterval: forbidden, clearImmediate: forbidden,
      fetch: forbidden, WebSocket: forbidden,
    };
    try { vm.runInNewContext(compiled, sandbox, { filename: sourcePath, timeout: 3000 }); }
    catch (error) { if (error !== exit) escaped = true; }
    return { calls, logs, exitCode, escaped, injectedFailure,
      success: logs.filter(row => row.text === "[precommit] OK").length };
  }
  const check = (name, action) => {
    try { action(); checks.push({ name, pass: true }); }
    catch { checks.push({ name, pass: false }); }
  };
  const normal = fixture();
  check("default_sequence_retains_exact_distinct_gates_once", () => {
    expect(!normal.escaped && normal.exitCode === 0 && normal.success === 1);
    expect(JSON.stringify(normal.calls.map(row => row.command)) === JSON.stringify(expectedCommands));
    expect(!normal.calls.some(row => row.command === "npm run test:writers" || row.command === "npm run test:capabilities"));
  });
  check("normal_spawns_use_owned_cwd_and_fixed_regression_child", () => {
    expect(!normal.escaped && normal.exitCode === 0 && normal.success === 1);
    expect(normal.calls.every(row => row.options?.cwd === root && row.options.stdio === "inherit"));
    const regression = normal.calls[0];
    expect(regression?.command === selftestCommand && regression.options.windowsHide === true && regression.options.timeout === 30_000);
    expect(normal.calls.filter(row => row.command === selftestCommand).length === 1);
  });
  check("receipt_precedes_typecheck_and_final_success", () => {
    const commands = normal.calls.map(row => row.command);
    expect(!normal.escaped && normal.success === 1 && commands.filter(command => command === receipt).length === 1);
    expect(commands.indexOf(receipt) >= 0 && commands.indexOf(typecheck) > commands.indexOf(receipt)
      && normal.logs.at(-1)?.text === "[precommit] OK");
  });
  const blocked = (selector, kind, after) => {
    const run = fixture(selector, kind);
    expect(run.injectedFailure && !run.escaped && run.exitCode === 1 && run.success === 0);
    const index = run.calls.findIndex(row => selector(row.command));
    expect(index >= 0 && run.calls.length === index + 1);
    if (after) expect(!run.calls.some(row => row.command === after));
  };
  const writer = command => command === writerSelftests || command === "npm run test:writers";
  check("writer_selftest_nonzero_blocks_later_gates", () => blocked(writer, "nonzero", receipt));
  check("writer_selftest_spawn_error_blocks_later_gates", () => blocked(writer, "error", receipt));
  check("writer_selftest_spawn_throw_blocks_later_gates", () => blocked(writer, "throw", receipt));
  check("receipt_nonzero_prevents_typecheck_and_success", () => blocked(command => command === receipt, "nonzero", typecheck));
  check("receipt_spawn_error_prevents_typecheck_and_success", () => blocked(command => command === receipt, "error", typecheck));
  check("receipt_spawn_throw_prevents_typecheck_and_success", () => blocked(command => command === receipt, "throw", typecheck));
  check("mcp_failure_preserves_original_nonzero_guard", () => blocked(command => command === "npm run test:mcp-capabilities", "nonzero", receipt));
  check("configuration_grant_failure_preserves_original_nonzero_guard", () => blocked(command => command === "npm run test:configuration-grant", "nonzero", receipt));
  check("configuration_operations_failure_preserves_original_nonzero_guard", () => blocked(command => command === "npm run test:configuration-operations", "nonzero", receipt));
  check("native_failure_preserves_original_nonzero_guard", () => blocked(command => command === "npm run test:native-performance", "nonzero", receipt));
  const lifecycleSelftest = command => command === "node scripts/e2e-runner-lifecycle.selftest.mjs";
  check("lifecycle_nonzero_blocks_later_gates", () => blocked(lifecycleSelftest, "nonzero", writerSelftests));
  check("lifecycle_spawn_error_blocks_later_gates", () => blocked(lifecycleSelftest, "error", writerSelftests));
  check("lifecycle_spawn_throw_blocks_later_gates", () => blocked(lifecycleSelftest, "throw", writerSelftests));
  const runnerIntegrationSelftest = command => command === "node scripts/e2e-runner-integration.selftest.mjs";
  check("runner_integration_nonzero_blocks_later_gates", () => blocked(runnerIntegrationSelftest, "nonzero", writerSelftests));
  check("runner_integration_spawn_error_blocks_later_gates", () => blocked(runnerIntegrationSelftest, "error", writerSelftests));
  check("runner_integration_spawn_throw_blocks_later_gates", () => blocked(runnerIntegrationSelftest, "throw", writerSelftests));
  check("typecheck_failure_prevents_final_success", () => blocked(command => command === typecheck, "nonzero"));
  check("regression_child_failure_blocks_default_execution", () => blocked(command => command === selftestCommand, "nonzero", writerSelftests));
  check("injected_runs_attempt_no_unowned_effects", () => expect(deniedEffectAttempts === 0 && fakeSpawnCalls > 0));
  // Unsafe option probes use inert delegates only; none can reach the filesystem.
  check("read_file_write_capable_options_are_denied_before_delegate", () => {
    for (const flag of ["w", "w+", "wx", "wx+", "a", "a+", "ax", "ax+", "r+"]) {
      let delegated = 0, denied = 0, threw = false;
      const reader = createPrecommitSelftestReadFile(() => { delegated++; return "inert bytes"; },
        () => { denied++; throw new Error("INERT_READ_DENIED"); });
      try { reader("inert-owned-file", { encoding: "utf8", flag }); } catch { threw = true; }
      expect(threw && denied === 1 && delegated === 0);
    }
  });
  check("read_file_option_getters_are_denied_without_evaluation", () => {
    for (const property of ["encoding", "flag"]) {
      let delegated = 0, denied = 0, getterReads = 0, threw = false;
      const options = Object.defineProperty({}, property, { get() { getterReads++; return property === "flag" ? "w+" : "utf8"; } });
      const reader = createPrecommitSelftestReadFile(() => { delegated++; return "inert bytes"; },
        () => { denied++; throw new Error("INERT_READ_DENIED"); });
      try { reader("inert-owned-file", options); } catch { threw = true; }
      expect(threw && denied === 1 && delegated === 0 && getterReads === 0);
    }
  });
  check("read_file_existing_safe_signatures_reach_inert_delegate", () => {
    for (const options of [[], [undefined], ["utf8"], ["utf-8"]]) {
      let denied = 0;
      const calls = [];
      const reader = createPrecommitSelftestReadFile((...args) => { calls.push(args); return "inert bytes"; },
        () => { denied++; throw new Error("INERT_READ_DENIED"); });
      expect(reader("inert-owned-file", ...options) === "inert bytes" && denied === 0 && calls.length === 1);
      expect(calls[0][0] === "inert-owned-file" && calls[0].length === options.length + 1);
      expect(options.length === 0 || calls[0][1] === options[0]);
    }
  });
  check("read_file_other_signatures_are_denied_without_coercion", () => {
    let coercions = 0;
    const coercible = { toString() { coercions++; return "utf8"; } };
    for (const options of [["base64"], ["utf16le"], ["UTF8"], [null], [0], [true], [{}], [coercible], ["utf8", "extra"]]) {
      let delegated = 0, denied = 0, threw = false;
      const reader = createPrecommitSelftestReadFile(() => { delegated++; return "inert bytes"; },
        () => { denied++; throw new Error("INERT_READ_DENIED"); });
      try { reader("inert-owned-file", ...options); } catch { threw = true; }
      expect(threw && denied === 1 && delegated === 0 && coercions === 0);
    }
  });
  const passed = checks.filter(row => row.pass).length;
  return { pass: passed === checks.length, passed, total: checks.length, checks,
    injectedOrchestrationOnly: true, actualAuditOrRuntimeProof: false, fakeSpawnCalls, deniedEffectAttempts,
    realProcessLaunches: 0, realProcessSignals: 0, filesystemMutations: 0, realTimers: 0 };
}

if (process.argv.includes("--selftest")) {
  if (process.argv.length !== 3 || process.argv[2] !== "--selftest") {
    console.error("[precommit selftest] invalid arguments");
    process.exitCode = 1;
  } else void runPrecommitOrchestrationSelftest().then(result => {
    console.log(JSON.stringify(result));
    if (!result.pass) process.exitCode = 1;
  }).catch(() => { console.error("[precommit selftest] failed"); process.exitCode = 1; });
} else try {
  checkPrecommitOrchestration();
  checkTripwires();
  checkMirrorDrift();
  checkE2eRuntimeBootstrap();
  checkE2eVerdict();
  checkE2eViteLifecycle();
  checkE2eRequestTransport();
  checkBackendRecovery();
  checkRuntimeStaging();
  checkStagedProbeCleanup();
  checkProductCopy();
  checkDurableWriters();
  checkCapabilityContracts();
  checkFocusedPerformanceAndXml();
  checkNativePerformanceFoundation();
  checkActionReceiptCoverage();
  runTypecheck();
  checkLargeFiles();
  console.log("[precommit] OK");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[precommit] BLOCKED: ${message}`);
  process.exit(1);
}
