/**
 * stage-app.mjs — stage the built Forge product into the extension as `app/`.
 *
 * Inputs: the REPO's `npm run build` output (../dist: vite bundle + server.cjs).
 * Output: vscode-extension/app/ = { dist/  (bundle, NO sourcemaps),
 *                                   package.json (pruned runtime deps),
 *                                   package-lock.json (reviewed runtime graph),
 *                                   node_modules/ (npm ci --omit=dev) }.
 *
 * The sidecar spawns `node dist/server.cjs` with cwd = app/, which is exactly how the
 * production server resolves its static bundle (express.static(cwd/dist)).
 *
 * Deliberate exclusions (secrets / dev-only / machine paths):
 *  - *.map            → sourcemaps embed the full server source + local paths.
 *  - .env, .studio-api-token, .studio-state, data/ → never staged; asserted absent.
 *
 * Pruned dependency list = what dist/server.cjs actually requires at runtime
 * (esbuild --packages=external keeps ALL bare imports external):
 *  vite (top-level import in server.ts; prod branch never calls it but the require runs),
 *  express, dotenv, better-sqlite3 (native), @xmldom/xmldom, fast-xml-parser, luaparse,
 *  xpath, @google/genai. React/tailwind/etc. are already inside the vite bundle.
 * The staged app is boot-proven before packaging; a missing dep fails loudly there.
 */
import { execFileSync, execSync } from "node:child_process";
import assert from "node:assert/strict";
import console from "node:console";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXT_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = path.dirname(EXT_ROOT);
const APP = path.join(EXT_ROOT, "app");
const APP_WORK = ".forge-stage-app";
const LOCK_DIR = path.join(EXT_ROOT, "runtime-locks");
const RUNTIME_LIMITS = Object.freeze({ entries: 10_000, bytes: 128 * 1024 * 1024 });
const CLIENT_BUNDLE_IDENTITY_RE = /["']App version["']\s*:\s*["']([^"']+)["']\s*,\s*["']?Build["']?\s*:\s*["']([^"']+)["']/;
const FULL_HISTORY_BUILD_RE = /^build (\d+) · ([0-9a-f]{7,40}) · (\d{4}-\d{2}-\d{2})(?: · uncommitted)?$/;
const MIN_FULL_HISTORY_COMMIT_COUNT = 800;

export function inspectClientBundleVersion(jsPayloads, expectedVersion) {
  const normalizedExpected = String(expectedVersion || "").trim();
  if (!/^\d+\.\d+\.\d+$/.test(normalizedExpected)) {
    throw new Error(`[stage-app] vscode-extension/package.json has invalid semver version "${normalizedExpected}".`);
  }
  let matched = null;
  for (const payload of jsPayloads) {
    const text = Buffer.isBuffer(payload) ? payload.toString("utf8") : String(payload || "");
    const m = CLIENT_BUNDLE_IDENTITY_RE.exec(text);
    if (m) {
      matched = { appVersion: m[1], appBuild: m[2] };
      break;
    }
  }
  if (!matched) {
    throw new Error('[stage-app] dist/assets/ client bundle is missing embedded "App version" / "Build" metadata. Run "npm run build" in the repo root.');
  }
  if (matched.appVersion !== normalizedExpected) {
    throw new Error(
      `[stage-app] Client bundle version mismatch: vscode-extension/package.json is "${normalizedExpected}", ` +
      `but dist/assets/ baked "${matched.appVersion}". Re-run "npm run build" in the repo root after bumping vscode-extension/package.json.`,
    );
  }
  if (matched.appBuild.startsWith("shallow-checkout")) {
    throw new Error(
      `[stage-app] Refusing to stage client bundle built from a shallow Git checkout ("${matched.appBuild}"). ` +
      'Run "git fetch --unshallow" and rebuild.',
    );
  }
  const buildMatch = FULL_HISTORY_BUILD_RE.exec(matched.appBuild);
  const buildCount = buildMatch ? Number(buildMatch[1]) : NaN;
  if (!buildMatch || !Number.isFinite(buildCount) || buildCount < MIN_FULL_HISTORY_COMMIT_COUNT) {
    throw new Error(
      `[stage-app] Refusing to stage client bundle with incomplete or non-canonical Git build provenance ("${matched.appBuild}"). ` +
      'Ensure full Git history is present and run "npm run build" in the repo root.',
    );
  }
  return { appVersion: matched.appVersion, appBuild: matched.appBuild, buildCount };
}

function parseArguments(args) {
  if (args.length === 0) return {};
  if (args.length === 1 && args[0] === "--selftest") return { selftest: true };
  if (args.length === 1 && args[0] === "--refresh-runtime-locks") return { refreshRuntimeLocks: true };
  if (args.length === 2 && args[0] === "--runtime-from" && path.isAbsolute(args[1])) {
    return { runtimeFrom: path.resolve(args[1]) };
  }
  throw new Error("Usage: stage-app.mjs [--runtime-from <absolute physical app directory> | --refresh-runtime-locks | --selftest]");
}

function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function canonical(value) { return process.platform === "win32" ? value.toLowerCase() : value; }
function contains(owner, candidate) {
  const relative = path.relative(owner, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}
function sameDependencies(actual, expected) {
  const sorted = value => JSON.stringify(Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b)));
  return sorted(actual) === sorted(expected);
}

function runtimeLockPath(platform) {
  return path.join(LOCK_DIR, platform === "win32" ? "windows.json" : "portable.json");
}

function readRuntimeLock(file, manifest) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.nlink !== 1 || canonical(fs.realpathSync(file)) !== canonical(file)) {
    throw new Error("A physical sidecar runtime lock is required. Run stage-app --refresh-runtime-locks.");
  }
  const bytes = fs.readFileSync(file);
  const lock = JSON.parse(bytes);
  const lockRoot = lock.packages?.[""];
  if (lock.lockfileVersion !== 3 || lock.name !== manifest.name || lock.version !== manifest.version
    || lockRoot?.name !== manifest.name || lockRoot?.version !== manifest.version
    || !sameDependencies(lockRoot.dependencies, manifest.dependencies)) {
    throw new Error("Sidecar runtime lock does not match the staging manifest. Run stage-app --refresh-runtime-locks.");
  }
  for (const name of Object.keys(manifest.dependencies)) {
    const item = lock.packages["node_modules/" + name];
    if (!item?.version || !item.integrity || !item.resolved || item.link) {
      throw new Error("Sidecar runtime lock has no pinned package for " + name + ".");
    }
  }
  return bytes;
}

function npmRunner(environment = process.env) {
  const cli = environment.npm_execpath;
  if (!cli || path.basename(cli).toLowerCase() !== "npm-cli.js") {
    // Direct stage-app calls and non-npm launchers keep using npm from PATH.
    return (args, options) => execSync(["npm", ...args].join(" "), options);
  }
  if (!path.isAbsolute(cli) || !fs.statSync(cli, { throwIfNoEntry: false })?.isFile()) {
    throw new Error("Cannot use npm lifecycle CLI. Run stage-app with a working npm installation.");
  }

  // Windows npm.cmd may select its own sibling Node. Use the staging runtime
  // for npm itself and for Node commands in its dependency lifecycle scripts.
  const env = { ...environment };
  const pathKeys = process.platform === "win32"
    ? Object.keys(env).filter(key => key.toUpperCase() === "PATH").sort()
    : ["PATH"];
  // Match Node's first-key precedence and pass only one Windows PATH spelling.
  const inheritedPath = env[pathKeys[0] ?? "PATH"];
  for (const key of pathKeys) delete env[key];
  env.PATH = [path.dirname(process.execPath), inheritedPath].filter(Boolean).join(path.delimiter);
  return (args, options) => execFileSync(process.execPath, [cli, ...args], { ...options, env });
}

function refreshRuntimeLocks() {
  const runNpm = npmRunner();
  if (fs.existsSync(LOCK_DIR) && canonical(fs.realpathSync(LOCK_DIR)) !== canonical(LOCK_DIR)) {
    throw new Error("Runtime lock directory uses an alias");
  }
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  const temporary = fs.mkdtempSync(path.join(temporaryRoot, "forge-runtime-lock-refresh-"));
  const locks = [];
  try {
    for (const platform of ["win32", "linux"]) {
      const destination = runtimeLockPath(platform);
      const prior = fs.lstatSync(destination, { throwIfNoEntry: false });
      if (prior && (!prior.isFile() || prior.nlink !== 1 || canonical(fs.realpathSync(destination)) !== canonical(destination))) {
        throw new Error("Runtime lock destination must be a physical file: " + destination);
      }
      const location = path.join(temporary, platform);
      fs.mkdirSync(location);
      const manifest = runtimeManifest(platform);
      fs.writeFileSync(path.join(location, "package.json"), JSON.stringify(manifest, null, 2));
      runNpm([
        "install", "--package-lock-only", "--omit=dev", "--ignore-scripts",
        "--no-audit", "--no-fund", "--fetch-retries=0", "--fetch-timeout=8000",
      ], { cwd: location, stdio: "inherit", timeout: 45000 });
      assert.equal(fs.existsSync(path.join(location, "node_modules")), false);
      locks.push([destination, readRuntimeLock(path.join(location, "package-lock.json"), manifest)]);
    }
    fs.mkdirSync(LOCK_DIR, { recursive: true });
    for (const [file, bytes] of locks) {
      fs.writeFileSync(file, bytes);
      console.log("[stage-app] refreshed " + path.basename(file) + " sha256=" + digest(bytes));
    }
  } finally {
    assert.equal(path.dirname(fs.realpathSync(temporary)), temporaryRoot);
    assert.equal(fs.lstatSync(temporary).isSymbolicLink(), false);
    fs.rmSync(temporary, { recursive: true });
  }
}

// Snapshot only the supplied runtime, not its old product bundle or mutable state.
// Reuse is an explicit local input; qualification still requires the staged probe.
function inspectRuntimeSource(source, expectedDependencies, target = APP, limits = RUNTIME_LIMITS) {
  if (!Number.isInteger(limits.entries) || limits.entries < 1 || limits.entries > RUNTIME_LIMITS.entries
    || !Number.isInteger(limits.bytes) || limits.bytes < 1 || limits.bytes > RUNTIME_LIMITS.bytes) throw new Error("Invalid runtime source limits");
  const root = path.resolve(source);
  target = path.resolve(target);
  if (contains(root, target) || contains(target, root)) throw new Error("Runtime source overlaps the staging target");
  if (canonical(fs.realpathSync(root)) !== canonical(root)) throw new Error("Runtime source uses an alias");
  const entries = [];
  let bytes = 0;
  function visit(relative) {
    const file = path.join(root, relative);
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()) || (stat.isFile() && stat.nlink !== 1)) {
      throw new Error(`Runtime source has a linked or special entry: ${relative}`);
    }
    bytes += stat.isFile() ? stat.size : 0;
    if (entries.length >= limits.entries || bytes > limits.bytes) throw new Error("Runtime source exceeds byte/entry limit (maximum 128 MiB/10000 entries)");
    entries.push({ relative, directory: stat.isDirectory(), bytes: stat.isFile() ? stat.size : 0,
      sha256: stat.isFile() ? digest(fs.readFileSync(file)) : null });
    if (stat.isDirectory()) for (const name of fs.readdirSync(file).sort()) visit(path.join(relative, name));
  }
  const rootStat = fs.lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("Runtime source must be a physical directory");
  if (!fs.lstatSync(path.join(root, "node_modules")).isDirectory()) throw new Error("Runtime node_modules must be a directory");
  for (const relative of ["package.json", "package-lock.json", "node_modules"]) visit(relative);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  if (pkg.name !== "x4-forge-sidecar-app" || !sameDependencies(pkg.dependencies, expectedDependencies)
    || !sameDependencies(lock.packages?.[""]?.dependencies, expectedDependencies)) {
    throw new Error("Runtime source dependency specifications/lock do not match the current product");
  }
  return { root, entries, bytes, expectedDependencies, target, limits, sha256: digest(JSON.stringify(entries)) };
}

function copyRuntimeSource(snapshot, target) {
  if (path.resolve(target) !== snapshot.target) throw new Error("Runtime copy target changed");
  const before = inspectRuntimeSource(snapshot.root, snapshot.expectedDependencies, snapshot.target, snapshot.limits);
  if (before.sha256 !== snapshot.sha256) throw new Error("Runtime source changed before copy");
  for (const entry of snapshot.entries) {
    if (entry.relative === "package.json") continue; // Keep the freshly generated runtime manifest.
    const destination = path.join(target, entry.relative);
    if (entry.directory) fs.mkdirSync(destination, { recursive: true });
    else {
      fs.copyFileSync(path.join(snapshot.root, entry.relative), destination);
      if (digest(fs.readFileSync(destination)) !== entry.sha256) throw new Error(`Runtime copy mismatch: ${entry.relative}`);
    }
  }
  const after = inspectRuntimeSource(snapshot.root, snapshot.expectedDependencies, snapshot.target, snapshot.limits);
  if (after.sha256 !== snapshot.sha256) throw new Error("Runtime source changed during copy");
  console.log(`[stage-app] reused runtime files=${snapshot.entries.filter(entry => !entry.directory).length} bytes=${snapshot.bytes} sha256=${snapshot.sha256}`);
}

function physicalApp(target, required = false) {
  const stat = fs.lstatSync(target, { bigint: true, throwIfNoEntry: false });
  if ((!stat && required) || (stat && (!stat.isDirectory() || stat.isSymbolicLink()
    || canonical(fs.realpathSync(target)) !== canonical(target)))) {
    throw new Error("Staging target must be a physical, unaliased directory.");
  }
  return stat;
}

function replaceStagedApp(target, prepare, rename = fs.renameSync, remove = fs.rmSync) {
  const work = path.join(path.dirname(target), APP_WORK);
  const incumbent = physicalApp(target);
  try { fs.mkdirSync(work); }
  catch (error) {
    if (error.code === "EEXIST") throw new Error("A staging operation or interrupted stage already owns " + work, { cause: error });
    throw error;
  }
  const owner = physicalApp(work, true);
  const candidate = path.join(work, "candidate");
  const previous = path.join(work, "previous");
  const ensureOwned = () => {
    const current = physicalApp(work, true);
    if (current.dev !== owner.dev || current.ino !== owner.ino) throw new Error("Staging directory ownership changed.");
  };
  const clean = () => {
    ensureOwned();
    remove(work, { recursive: true });
  };
  let preserveWork = false;
  try {
    prepare(candidate);
    ensureOwned();
    physicalApp(candidate, true);
    const existing = physicalApp(target);
    if (Boolean(existing) !== Boolean(incumbent) || (existing && (existing.dev !== incumbent.dev || existing.ino !== incumbent.ino))) {
      throw new Error("Staging target identity changed during preparation.");
    }
    if (existing) rename(target, previous);
    try {
      rename(candidate, target);
    } catch (error) {
      if (existing) {
        try {
          ensureOwned();
          if (physicalApp(target)) throw new Error("Staging target became occupied before rollback.");
          rename(previous, target);
        } catch (rollbackError) {
          preserveWork = true;
          throw new AggregateError([error, rollbackError], "Cannot restore the previous staged app. Its recovery path is " + previous);
        }
      }
      throw error;
    }
  } catch (error) {
    if (!preserveWork) {
      try { clean(); }
      catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Staging failed and could not retire its owned work directory.");
      }
    }
    throw error;
  }
  // A cleanup error after promotion must never undo a verified replacement.
  clean();
}

function runtimeSelftest() {
  const fixture = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "forge-stage-runtime-")));
  assert.equal(path.dirname(fixture), fs.realpathSync(os.tmpdir()));
  const source = path.join(fixture, "source"), target = path.join(fixture, "target");
  const deps = { "fixture-runtime": "1.2.3" };
  fs.mkdirSync(path.join(source, "node_modules", "fixture-runtime"), { recursive: true });
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, "preserve.txt"), "unchanged before rejected input");
  fs.writeFileSync(path.join(source, "package.json"), JSON.stringify({ name: "x4-forge-sidecar-app", dependencies: deps }));
  const lock = JSON.stringify({ lockfileVersion: 3, packages: { "": { dependencies: deps } } });
  const lockPath = path.join(source, "package-lock.json");
  const modulePath = path.join(source, "node_modules", "fixture-runtime", "index.js");
  fs.writeFileSync(lockPath, lock);
  fs.writeFileSync(modulePath, "/* exact qualified fixture bytes */");
  try {
    assert.deepEqual(parseArguments([]), {});
    assert.deepEqual(parseArguments(["--refresh-runtime-locks"]), { refreshRuntimeLocks: true });
    const npmFixtureDir = path.join(fixture, "npm CLI with spaces");
    fs.mkdirSync(npmFixtureDir);
    const npmCli = path.join(npmFixtureDir, "npm-cli.js");
    fs.writeFileSync(npmCli, "console.log(JSON.stringify([process.execPath, process.cwd(), process.env.PATH, ...process.argv.slice(2)]));");
    const npmEnv = process.platform === "win32"
      ? { ...process.env, npm_execpath: npmCli, Path: fixture, PATH: target }
      : { ...process.env, npm_execpath: npmCli, PATH: target };
    // Keep Path before PATH in insertion order to exercise Windows child-env deduplication.
    const runNpm = npmRunner(process.platform === "win32" ? { Path: fixture, ...npmEnv } : npmEnv);
    assert.deepEqual(
      JSON.parse(runNpm(["ci", "--omit=dev"], { cwd: target, encoding: "utf8" })),
      [process.execPath, target, [path.dirname(process.execPath), target].join(path.delimiter), "ci", "--omit=dev"],
    );
    assert.throws(() => npmRunner({ npm_execpath: "npm-cli.js" }), /Cannot use npm lifecycle CLI/);
    assert.throws(
      () => npmRunner({ npm_execpath: path.join(fixture, "missing", "npm-cli.js") }),
      /Cannot use npm lifecycle CLI/,
    );
    const windows = runtimeManifest("win32");
    const portable = runtimeManifest("linux");
    const { koffi, ...common } = windows.dependencies;
    assert.ok(koffi);
    assert.deepEqual(common, portable.dependencies);
    assert.equal(runtimeLockPath("darwin"), runtimeLockPath("linux"));
    assert.notEqual(runtimeLockPath("win32"), runtimeLockPath("linux"));
    const reviewed = readRuntimeLock(runtimeLockPath("win32"), windows);
    readRuntimeLock(runtimeLockPath("linux"), portable);
    assert.throws(() => readRuntimeLock(runtimeLockPath("win32"), portable), /does not match/);
    assert.throws(() => readRuntimeLock(path.join(fixture, "absent-lock.json"), windows), /physical sidecar runtime lock/);
    const invalidLock = JSON.parse(reviewed);
    delete invalidLock.packages["node_modules/koffi"].integrity;
    const invalidFile = path.join(fixture, "invalid-lock.json");
    fs.writeFileSync(invalidFile, JSON.stringify(invalidLock));
    assert.throws(() => readRuntimeLock(invalidFile, windows), /no pinned package for koffi/);
    invalidLock.packages[""].dependencies.koffi = "0.0.0";
    fs.writeFileSync(invalidFile, JSON.stringify(invalidLock));
    assert.throws(() => readRuntimeLock(invalidFile, windows), /does not match/);
    const lockAlias = path.join(fixture, "lock-alias");
    fs.symlinkSync(LOCK_DIR, lockAlias, "junction");
    assert.throws(() => readRuntimeLock(path.join(lockAlias, "windows.json"), windows), /physical sidecar runtime lock/);
    fs.unlinkSync(lockAlias);
    fs.writeFileSync(invalidFile, reviewed);
    const lockHardlink = path.join(fixture, "hardlinked-lock.json");
    fs.linkSync(invalidFile, lockHardlink);
    assert.throws(() => readRuntimeLock(lockHardlink, windows), /physical sidecar runtime lock/);
    fs.unlinkSync(lockHardlink);
    assert.deepEqual(parseArguments(["--runtime-from", source]), { runtimeFrom: source });
    for (const args of [["--runtime-from"], ["--runtime-from", "relative"], ["--unknown"], ["--selftest", source], ["--refresh-runtime-locks", source]]) {
      assert.throws(() => parseArguments(args), /Usage:/);
    }
    const accepted = inspectRuntimeSource(source, deps, target);
    copyRuntimeSource(accepted, target);
    assert.equal(fs.readFileSync(path.join(target, "package-lock.json"), "utf8"), lock);
    assert.equal(fs.readFileSync(path.join(target, "node_modules/fixture-runtime/index.js"), "utf8"), "/* exact qualified fixture bytes */");
    assert.throws(() => inspectRuntimeSource(source, { ...deps, missing: "2" }, target), /dependency specifications/);
    assert.throws(() => inspectRuntimeSource(source, deps, target, { entries: 1, bytes: RUNTIME_LIMITS.bytes }), /entry limit/);
    assert.throws(() => inspectRuntimeSource(source, deps, target, { entries: RUNTIME_LIMITS.entries, bytes: 1 }), /byte\/entry limit/);
    assert.throws(() => inspectRuntimeSource(source, deps, target, { entries: 10001, bytes: RUNTIME_LIMITS.bytes }), /Invalid runtime source limits/);
    assert.throws(() => inspectRuntimeSource(source, deps, source), /overlaps/);
    assert.throws(() => inspectRuntimeSource(source, deps, path.join(source, "nested")), /overlaps/);
    const alias = path.join(fixture, "alias"); fs.symlinkSync(source, alias, "junction");
    assert.throws(() => inspectRuntimeSource(alias, deps, target), /alias/);
    fs.unlinkSync(alias);
    fs.unlinkSync(lockPath);
    assert.throws(() => inspectRuntimeSource(source, deps, target), /ENOENT/);
    fs.writeFileSync(lockPath, lock);
    const foreign = path.join(fixture, "foreign"); fs.mkdirSync(foreign);
    const link = path.join(source, "node_modules", "foreign");
    fs.symlinkSync(foreign, link, "junction");
    assert.throws(() => inspectRuntimeSource(source, deps, target), /linked/);
    fs.unlinkSync(link);
    const hardlink = path.join(source, "node_modules", "hardlink");
    fs.linkSync(modulePath, hardlink);
    assert.throws(() => inspectRuntimeSource(source, deps, target), /linked/);
    fs.unlinkSync(hardlink);
    fs.writeFileSync(modulePath, "changed source");
    assert.throws(() => copyRuntimeSource(accepted, target), /changed before copy/);
    fs.writeFileSync(modulePath, "/* exact qualified fixture bytes */");
    const stable = inspectRuntimeSource(source, deps, target);
    const originalCopy = fs.copyFileSync;
    try {
      fs.copyFileSync = (from, to) => {
        originalCopy(from, to);
        if (path.basename(from) === "index.js") fs.writeFileSync(modulePath, "changed during copy");
      };
      assert.throws(() => copyRuntimeSource(stable, target), /changed during copy/);
    } finally { fs.copyFileSync = originalCopy; }
    assert.equal(fs.readFileSync(path.join(target, "preserve.txt"), "utf8"), "unchanged before rejected input");
    const app = path.join(fixture, "app"), work = path.join(fixture, APP_WORK);
    const sentinel = path.join(app, "ready.txt");
    fs.mkdirSync(app);
    fs.writeFileSync(sentinel, "previous");
    const prepare = candidate => {
      fs.mkdirSync(candidate);
      fs.writeFileSync(path.join(candidate, "ready.txt"), "candidate");
    };
    assert.throws(() => replaceStagedApp(app, candidate => {
      prepare(candidate);
      throw new Error("failed preparation");
    }), /failed preparation/);
    assert.equal(fs.readFileSync(sentinel, "utf8"), "previous");
    assert.equal(fs.existsSync(work), false);
    fs.mkdirSync(work);
    assert.throws(() => replaceStagedApp(app, () => assert.fail("concurrent stage ran")), /already owns/);
    fs.rmdirSync(work);
    const handoff = path.join(fixture, "other-app");
    assert.throws(() => replaceStagedApp(app, candidate => {
      prepare(candidate);
      fs.renameSync(app, handoff);
      fs.mkdirSync(app);
      fs.writeFileSync(sentinel, "other owner");
    }), /identity changed/);
    assert.equal(fs.readFileSync(sentinel, "utf8"), "other owner");
    assert.equal(fs.existsSync(work), false);
    fs.rmSync(app, { recursive: true });
    fs.renameSync(handoff, app);
    assert.throws(() => replaceStagedApp(app, prepare, (from, to) => {
      if (from === app) throw new Error("locked incumbent");
      fs.renameSync(from, to);
    }), /locked incumbent/);
    assert.equal(fs.readFileSync(sentinel, "utf8"), "previous");
    assert.equal(fs.existsSync(work), false);
    assert.throws(() => replaceStagedApp(app, prepare, (from, to) => {
      if (path.basename(from) === "candidate") throw new Error("promotion refused");
      fs.renameSync(from, to);
    }), /promotion refused/);
    assert.equal(fs.readFileSync(sentinel, "utf8"), "previous");
    assert.equal(fs.existsSync(work), false);
    assert.throws(() => replaceStagedApp(app, prepare, fs.renameSync, () => {
      throw new Error("locked cleanup");
    }), /locked cleanup/);
    assert.equal(fs.readFileSync(sentinel, "utf8"), "candidate");
    assert.equal(fs.readFileSync(path.join(work, "previous", "ready.txt"), "utf8"), "previous");
    fs.rmSync(work, { recursive: true });
    assert.throws(() => replaceStagedApp(app, prepare, (from, to) => {
      if (from !== app) throw new Error("rename refused");
      fs.renameSync(from, to);
    }), /Cannot restore the previous staged app/);
    assert.equal(fs.existsSync(app), false);
    assert.equal(fs.readFileSync(path.join(work, "previous", "ready.txt"), "utf8"), "candidate");
    fs.renameSync(path.join(work, "previous"), app);
    fs.rmSync(work, { recursive: true });
    replaceStagedApp(app, prepare);
    assert.equal(fs.readFileSync(sentinel, "utf8"), "candidate");
    assert.equal(fs.existsSync(work), false);
    const validBundle = 'const ctx={"App version":"0.0.99",Build:"build 866 · f39a326 · 2026-11-25",Platform:"Win32"};';
    assert.deepEqual(inspectClientBundleVersion([validBundle], "0.0.99"), {
      appVersion: "0.0.99",
      appBuild: "build 866 · f39a326 · 2026-11-25",
      buildCount: 866,
    });
    assert.throws(
      () => inspectClientBundleVersion(['const ctx={"App version":"0.0.98",Build:"build 866 · f39a326 · 2026-11-25"};'], "0.0.99"),
      /Client bundle version mismatch/,
    );
    assert.throws(
      () => inspectClientBundleVersion(['const ctx={"App version":"1.0.20",Build:"commit ea9f169 · 2026-11-23"};'], "0.0.99"),
      /Client bundle version mismatch/,
    );
    assert.throws(
      () => inspectClientBundleVersion(['const ctx={"App version":"0.0.99",Build:"shallow-checkout · f39a326 · 2026-11-25"};'], "0.0.99"),
      /shallow Git checkout/,
    );
    assert.throws(
      () => inspectClientBundleVersion(['const ctx={"App version":"0.0.99",Build:"build 20 · f39a326 · 2026-11-25"};'], "0.0.99"),
      /incomplete or non-canonical Git build provenance/,
    );
    console.log("[stage-app selftest] PASS: npm runtime/locks/arguments/Dev exact-copy/alias/link/drift/staged app preparation/rollback/cleanup/version-gate");
  } finally {
    assert.equal(path.dirname(fixture), fs.realpathSync(os.tmpdir()));
    assert.equal(fs.lstatSync(fixture).isSymbolicLink(), false);
    fs.rmSync(fixture, { recursive: true });
  }
}

const RUNTIME_DEPS = [
  "vite",
  "express",
  "dotenv",
  "better-sqlite3",
  "@xmldom/xmldom",
  "fast-xml-parser",
  "luaparse",
  "xpath",
  "@google/genai",
];

function runtimeManifest(platform) {
  const repoPkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
  const dependencies = {};
  for (const name of RUNTIME_DEPS) {
    const version = repoPkg.dependencies?.[name] || repoPkg.devDependencies?.[name];
    if (!version) throw new Error('[stage-app] runtime dependency "' + name + '" not found in repo package.json');
    dependencies[name] = version;
  }
  if (platform === "win32") {
    const extensionPkg = JSON.parse(fs.readFileSync(path.join(EXT_ROOT, "package.json"), "utf8"));
    dependencies.koffi = extensionPkg.devDependencies?.koffi;
    if (!dependencies.koffi) throw new Error("Windows sidecar Job binding is not pinned.");
  }
  return {
    name: "x4-forge-sidecar-app",
    private: true,
    version: String(repoPkg.version || "0.0.0"),
    description: "Staged X4 Forge product (vite bundle + server.cjs) for the VS Code extension sidecar.",
    dependencies,
  };
}

const options = parseArguments(process.argv.slice(2));
if (options.selftest) { runtimeSelftest(); process.exit(0); }
if (canonical(fs.realpathSync(EXT_ROOT)) !== canonical(EXT_ROOT)) throw new Error("Extension staging root uses an alias");
if (options.refreshRuntimeLocks) { refreshRuntimeLocks(); process.exit(0); }

const repoDist = path.join(REPO_ROOT, "dist");
const allowedRootFiles = ["index.html", "favicon.svg", "server.cjs", "canonical-md-worker.cjs"];
for (const name of allowedRootFiles) {
  const file = path.join(repoDist, name);
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink() || !stat.size || canonical(fs.realpathSync(file)) !== canonical(file)) {
    console.error(`[stage-app] required physical repo build artifact missing or empty: ${name}. Run npm run build in the repo root first.`);
    process.exit(1);
  }
}

const assetsDir = path.join(repoDist, "assets");
const assetsStat = fs.lstatSync(assetsDir, { throwIfNoEntry: false });
if (!assetsStat?.isDirectory() || assetsStat.isSymbolicLink() || canonical(fs.realpathSync(assetsDir)) !== canonical(assetsDir)) {
  console.error("[stage-app] required physical repo build artifact missing or invalid: assets/");
  process.exit(1);
}

// Copy only declared production artifacts, excluding sourcemaps. A recursive copy of
// repoDist previously admitted Vite-copied validation fixtures and real mod content.
let copied = 0, skippedMaps = 0;
function copyDir(from, to) {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(dst, { recursive: true });
      copyDir(src, dst);
    } else if (entry.name.endsWith(".map")) {
      skippedMaps++;
    } else {
      fs.copyFileSync(src, dst);
      copied++;
    }
  }
}
const allowedRootEntries = new Set([...allowedRootFiles, "assets", "server.cjs.map"]);
const unexpectedEntries = fs.readdirSync(repoDist).filter((name) => !allowedRootEntries.has(name));
if (unexpectedEntries.length > 0) {
  console.error(`[stage-app] unexpected repo build artifact(s); refusing to package: ${unexpectedEntries.join(", ")}`);
  process.exit(1);
}
// Validate the chosen input before touching a previously staged product.
const extensionVersion = String(JSON.parse(fs.readFileSync(path.join(EXT_ROOT, "package.json"), "utf8")).version || "").trim();
const clientBundlePayloads = fs.readdirSync(assetsDir)
  .filter(name => name.endsWith(".js") && !name.endsWith(".map"))
  .map(name => fs.readFileSync(path.join(assetsDir, name), "utf8"));
const verifiedBundleIdentity = inspectClientBundleVersion(clientBundlePayloads, extensionVersion);
console.log(`[stage-app] verified client bundle v${verifiedBundleIdentity.appVersion} (${verifiedBundleIdentity.appBuild})`);
const manifest = runtimeManifest(process.platform);
const deps = manifest.dependencies;
const work = path.join(EXT_ROOT, APP_WORK);
if (options.runtimeFrom && [APP, work].some(target => contains(target, options.runtimeFrom) || contains(options.runtimeFrom, target))) {
  throw new Error("Runtime source overlaps the staging target");
}
const suppliedRuntime = options.runtimeFrom ? inspectRuntimeSource(options.runtimeFrom, deps, path.join(work, "candidate")) : null;
const runtimeLock = suppliedRuntime ? null : readRuntimeLock(runtimeLockPath(process.platform), manifest);
const runNpm = suppliedRuntime ? null : npmRunner();

replaceStagedApp(APP, stagedApp => {
  const stagedDist = path.join(stagedApp, "dist");
  fs.mkdirSync(stagedDist, { recursive: true });
  for (const name of allowedRootFiles) {
    fs.copyFileSync(path.join(repoDist, name), path.join(stagedDist, name));
    copied++;
  }
  fs.mkdirSync(path.join(stagedDist, "assets"));
  copyDir(assetsDir, path.join(stagedDist, "assets"));
  if (fs.existsSync(path.join(repoDist, "server.cjs.map"))) skippedMaps++;
  fs.writeFileSync(path.join(stagedApp, "package.json"), JSON.stringify(manifest, null, 2));
  console.log("[stage-app] copied " + copied + " bundle files (" + skippedMaps + " sourcemaps excluded)");

  if (suppliedRuntime) {
    copyRuntimeSource(suppliedRuntime, stagedApp);
  } else {
    const lockFile = path.join(stagedApp, "package-lock.json");
    fs.writeFileSync(lockFile, runtimeLock);
    runNpm(["ci", "--omit=dev", "--no-audit", "--no-fund"], { cwd: stagedApp, stdio: "inherit" });
    if (!readRuntimeLock(lockFile, manifest).equals(runtimeLock)) {
      throw new Error("Staged sidecar runtime lock changed during npm ci.");
    }
    console.log("[stage-app] installed reviewed runtime sha256=" + digest(runtimeLock));
  }

  const modules = path.join(stagedApp, "node_modules");
  let vendorMaps = 0;
  function stripMaps(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) stripMaps(file);
      else if (entry.name.endsWith(".map")) { fs.rmSync(file); vendorMaps++; }
    }
  }
  stripMaps(modules);
  console.log("[stage-app] stripped " + vendorMaps + " vendor sourcemaps from node_modules");

  // Close native module handles in a child before moving the candidate on Windows.
  if (process.platform === "win32") {
    const binding = path.join(modules, "koffi", "index.cjs");
    execFileSync(process.execPath, ["-e",
      'if (require(process.argv[1]).version !== process.argv[2]) throw new Error("Unexpected staged Windows Job binding version.");',
      binding, deps.koffi], { cwd: stagedApp, stdio: "inherit", windowsHide: true, timeout: 10_000 });
  }

  const sqliteDir = path.join(modules, "better-sqlite3");
  const nativeCandidates = [path.join(sqliteDir, "build", "Release", "better_sqlite3.node"), path.join(sqliteDir, "prebuilds")];
  if (!nativeCandidates.some(file => fs.existsSync(file))) {
    throw new Error("[stage-app] better-sqlite3 native binding not found in staged node_modules — sidecar would crash at boot.");
  }
  for (const forbidden of [".env", ".studio-api-token", ".studio-state", "data", "debuglog.txt"]) {
    if (fs.existsSync(path.join(stagedApp, forbidden)) || fs.existsSync(path.join(stagedDist, forbidden))) {
      throw new Error("[stage-app] forbidden file staged: " + forbidden);
    }
  }
});
console.log("[stage-app] OK — app/ staged (bundle + pruned runtime node_modules; native binding present; no secrets).");
