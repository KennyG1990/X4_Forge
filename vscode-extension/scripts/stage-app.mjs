/**
 * stage-app.mjs — stage the built Forge product into the extension as `app/`.
 *
 * Inputs: the REPO's `npm run build` output (../dist: vite bundle + server.cjs).
 * Output: vscode-extension/app/ = { dist/  (bundle, NO sourcemaps),
 *                                   package.json (pruned runtime deps),
 *                                   node_modules/ (npm install --omit=dev) }.
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
import { execSync } from "node:child_process";
import assert from "node:assert/strict";
import console from "node:console";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXT_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = path.dirname(EXT_ROOT);
const APP = path.join(EXT_ROOT, "app");
const RUNTIME_LIMITS = Object.freeze({ entries: 10_000, bytes: 128 * 1024 * 1024 });

function parseArguments(args) {
  if (args.length === 0) return {};
  if (args.length === 1 && args[0] === "--selftest") return { selftest: true };
  if (args.length === 2 && args[0] === "--runtime-from" && path.isAbsolute(args[1])) {
    return { runtimeFrom: path.resolve(args[1]) };
  }
  throw new Error("Usage: stage-app.mjs [--runtime-from <absolute physical app directory> | --selftest]");
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
    assert.deepEqual(parseArguments(["--runtime-from", source]), { runtimeFrom: source });
    for (const args of [["--runtime-from"], ["--runtime-from", "relative"], ["--unknown"], ["--selftest", source]]) {
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
    console.log("[stage-app selftest] PASS: arguments/exact-copy/lock/dependencies/alias/missing/link/hardlink/drift/refusal");
  } finally {
    assert.equal(path.dirname(fixture), fs.realpathSync(os.tmpdir()));
    assert.equal(fs.lstatSync(fixture).isSymbolicLink(), false);
    fs.rmSync(fixture, { recursive: true });
  }
}

const options = parseArguments(process.argv.slice(2));
if (options.selftest) { runtimeSelftest(); process.exit(0); }

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

const repoDist = path.join(REPO_ROOT, "dist");
if (!fs.existsSync(path.join(repoDist, "server.cjs")) || !fs.existsSync(path.join(repoDist, "index.html"))) {
  console.error(`[stage-app] repo build output missing at ${repoDist} — run \`npm run build\` in the repo root first.`);
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
const allowedRootFiles = ["index.html", "favicon.svg", "server.cjs"];
const allowedRootEntries = new Set([...allowedRootFiles, "assets", "server.cjs.map"]);
const unexpectedEntries = fs.readdirSync(repoDist).filter((name) => !allowedRootEntries.has(name));
if (unexpectedEntries.length > 0) {
  console.error(`[stage-app] unexpected repo build artifact(s); refusing to package: ${unexpectedEntries.join(", ")}`);
  process.exit(1);
}
// Validate supplied input before touching a previously staged product.
const repoPkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
const deps = {};
for (const name of RUNTIME_DEPS) {
  const version = repoPkg.dependencies?.[name] || repoPkg.devDependencies?.[name];
  if (!version) throw new Error(`[stage-app] runtime dep "${name}" not found in repo package.json`);
  deps[name] = version;
}
if (process.platform === "win32") {
  const extensionPkg = JSON.parse(fs.readFileSync(path.join(EXT_ROOT, "package.json"), "utf8"));
  deps.koffi = extensionPkg.devDependencies.koffi;
  if (!deps.koffi) throw new Error("Windows sidecar Job binding is not pinned.");
}
const suppliedRuntime = options.runtimeFrom ? inspectRuntimeSource(options.runtimeFrom, deps) : null;
if (canonical(fs.realpathSync(EXT_ROOT)) !== canonical(EXT_ROOT)) throw new Error("Extension staging root uses an alias");
if (fs.existsSync(APP) && (!fs.lstatSync(APP).isDirectory() || fs.lstatSync(APP).isSymbolicLink() || canonical(fs.realpathSync(APP)) !== canonical(APP))) {
  throw new Error("Staging target must be physical and unaliased");
}
fs.rmSync(APP, { recursive: true, force: true });
fs.mkdirSync(path.join(APP, "dist"), { recursive: true });
for (const name of allowedRootFiles) {
  const src = path.join(repoDist, name);
  if (!fs.existsSync(src)) {
    console.error(`[stage-app] required repo build artifact missing: ${name}`);
    process.exit(1);
  }
  fs.copyFileSync(src, path.join(APP, "dist", name));
  copied++;
}
const assetsDir = path.join(repoDist, "assets");
if (!fs.existsSync(assetsDir)) {
  console.error("[stage-app] required repo build artifact missing: assets/");
  process.exit(1);
}
fs.mkdirSync(path.join(APP, "dist", "assets"), { recursive: true });
copyDir(assetsDir, path.join(APP, "dist", "assets"));
if (fs.existsSync(path.join(repoDist, "server.cjs.map"))) skippedMaps++;

// Pruned runtime package.json with versions pinned from the repo's manifest.
fs.writeFileSync(
  path.join(APP, "package.json"),
  JSON.stringify(
    {
      name: "x4-forge-sidecar-app",
      private: true,
      version: String(repoPkg.version || "0.0.0"),
      description: "Staged X4 Forge product (vite bundle + server.cjs) for the VS Code extension sidecar.",
      dependencies: deps,
    },
    null,
    2,
  ),
);

console.log(`[stage-app] copied ${copied} bundle files (${skippedMaps} sourcemaps excluded)`);
if (suppliedRuntime) copyRuntimeSource(suppliedRuntime, APP);
else execSync("npm install --omit=dev --no-audit --no-fund", { cwd: APP, stdio: "inherit" });

// Strip vendor sourcemaps (npm packages ship their own *.map dev artifacts —
// dead weight in the VSIX; .vscodeignore's !app/** include would re-admit them).
let vendorMaps = 0;
function stripMaps(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) stripMaps(p);
    else if (entry.name.endsWith(".map")) { fs.rmSync(p); vendorMaps++; }
  }
}
stripMaps(path.join(APP, "node_modules"));
console.log(`[stage-app] stripped ${vendorMaps} vendor sourcemaps from node_modules`);

// Assert the Windows package can load its own native sidecar containment binding.
if (process.platform === "win32") {
  const require = createRequire(import.meta.url);
  const binding = require(path.join(APP, "node_modules", "koffi", "index.cjs"));
  if (binding.version !== deps.koffi) throw new Error("Unexpected staged Windows Job binding version.");
}

// Assertions: native module present; no secrets / dev-only files staged.
const sqliteDir = path.join(APP, "node_modules", "better-sqlite3");
const nativeCandidates = [
  path.join(sqliteDir, "build", "Release", "better_sqlite3.node"),
  path.join(sqliteDir, "prebuilds"),
];
if (!nativeCandidates.some((p) => fs.existsSync(p))) {
  console.error("[stage-app] better-sqlite3 native binding not found in staged node_modules — sidecar would crash at boot.");
  process.exit(1);
}
for (const forbidden of [".env", ".studio-api-token", ".studio-state", "data", "debuglog.txt"]) {
  if (fs.existsSync(path.join(APP, forbidden)) || fs.existsSync(path.join(APP, "dist", forbidden))) {
    console.error(`[stage-app] forbidden file staged: ${forbidden}`);
    process.exit(1);
  }
}
console.log("[stage-app] OK — app/ staged (bundle + pruned runtime node_modules; native binding present; no secrets).");
