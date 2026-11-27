#!/usr/bin/env node
/** Inspect the final VSIX bytes without relying on runner-specific ZIP tooling. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const EXT_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 250 * 1024 * 1024;
const MAX_ENTRY_BYTES = 100 * 1024 * 1024;
const MAX_ENTRIES = 10_000;
const REQUIRED = [
  'extension/package.json',
  'extension/out/extension.js',
  'extension/out/sidecar-supervisor.js',
  'extension/out/mcp-bootstrap.js',
  'extension/app/package.json',
  'extension/app/dist/index.html',
  'extension/app/dist/server.cjs',
  'extension/app/dist/canonical-md-worker.cjs',
  'extension/app/dist/x4validate.cjs',
];
const CHANGELOG_ENTRY = /^extension\/changelog\.md$/i;
const NATIVE_SQLITE = /^extension\/app\/node_modules\/better-sqlite3\/(?:build\/Release\/better_sqlite3\.node|prebuilds\/[^/]+\/better_sqlite3\.node)$/i;
const INTENTIONAL_GITHUB_REF_LINK_RE = /\[(?:([\w.-]+\/[\w.-]+))?#(\d+)\]\(https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/(?:issues|pull)\/(\d+)\)/g;
const AMBIGUOUS_HASH_NUMBER_RE = /(?:[\w.-]+\/[\w.-]+)?(?<!\\)#(\d+)\b/g;
const EMBEDDED_AGENT_KEY_RE = /\bx4fk_[0-9a-f]{64}\b/i;
const CLIENT_ASSET_JS_ENTRY = /^extension\/app\/dist\/assets\/[^/]+\.js$/i;
const CLIENT_BUNDLE_IDENTITY_RE = /["']App version["']\s*:\s*["']([^"']+)["']\s*,\s*["']?Build["']?\s*:\s*["']([^"']+)["']/;
const RELEASE_FULL_HISTORY_BUILD_RE = /^build (\d+) · ([0-9a-f]{7,40}) · (\d{4}-\d{2}-\d{2})$/;
const MIN_FULL_HISTORY_COMMIT_COUNT = 800;

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  return value >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function findEndOfCentralDirectory(bytes) {
  const minimum = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minimum; offset--) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error('VSIX end-of-central-directory record is missing.');
}

export function readVsixEntries(bytes) {
  if (!Buffer.isBuffer(bytes)) throw new Error('VSIX input must be a Buffer.');
  if (bytes.length === 0 || bytes.length > MAX_ARCHIVE_BYTES) throw new Error(`VSIX archive size ${bytes.length} is outside the 1-${MAX_ARCHIVE_BYTES} byte limit.`);
  const eocd = findEndOfCentralDirectory(bytes);
  const disk = bytes.readUInt16LE(eocd + 4);
  const centralDisk = bytes.readUInt16LE(eocd + 6);
  const diskEntries = bytes.readUInt16LE(eocd + 8);
  const entryCount = bytes.readUInt16LE(eocd + 10);
  const centralSize = bytes.readUInt32LE(eocd + 12);
  const centralOffset = bytes.readUInt32LE(eocd + 16);
  const commentLength = bytes.readUInt16LE(eocd + 20);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== entryCount) throw new Error('Multi-disk VSIX archives are not supported.');
  if (entryCount === 0 || entryCount === 0xffff || entryCount > MAX_ENTRIES) throw new Error(`VSIX entry count ${entryCount} is invalid or exceeds ${MAX_ENTRIES}.`);
  if (eocd + 22 + commentLength !== bytes.length) throw new Error('VSIX trailing bytes/comment length are inconsistent.');
  if (centralOffset === 0xffffffff || centralSize === 0xffffffff || centralOffset + centralSize > eocd) throw new Error('ZIP64 or out-of-bounds central directory is not supported.');

  const entries = [];
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index++) {
    if (offset + 46 > eocd || bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error(`Invalid central-directory entry ${index}.`);
    const flags = bytes.readUInt16LE(offset + 8);
    const method = bytes.readUInt16LE(offset + 10);
    const expectedCrc = bytes.readUInt32LE(offset + 16);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const entryCommentLength = bytes.readUInt16LE(offset + 32);
    const localOffset = bytes.readUInt32LE(offset + 42);
    const next = offset + 46 + nameLength + extraLength + entryCommentLength;
    if (next > eocd || localOffset === 0xffffffff || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) throw new Error(`ZIP64 or truncated metadata at entry ${index}.`);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    entries.push({ name, flags, method, expectedCrc, compressedSize, uncompressedSize, localOffset });
    offset = next;
  }
  if (offset !== centralOffset + centralSize) throw new Error('Central-directory size does not match parsed entries.');
  return entries;
}

function entryFailure(entry) {
  const { name } = entry;
  if (!name || name.includes('\0') || name.includes('\\') || name.startsWith('/') || /^[a-z]:/i.test(name)) return 'unsafe absolute, empty, NUL, or backslash entry name';
  if (name.split('/').some(segment => segment === '..')) return 'path traversal entry';
  if (/\.map$/i.test(name)) return 'sourcemap';
  if (/(?:^|\/)\.env(?:\.[^/]*)?$/i.test(name) || /(?:^|\/)\.studio-api-token$/i.test(name)) return 'secret-bearing filename';
  if (/^extension\/app\/(?:data|\.studio-state)(?:\/|$)/i.test(name)) return 'runtime state';
  if (/^extension\/app\/(?:config\.json|debuglog\.txt)$/i.test(name)) return 'runtime configuration/log';
  return null;
}

export function findEmbeddedMachinePath(bytes, roots) {
  const text = Buffer.isBuffer(bytes) ? bytes.toString('utf8').toLowerCase() : String(bytes).toLowerCase();
  for (const root of roots) {
    const value = String(root || '').trim();
    if (value.length < 4) continue;
    const variants = new Set([value, value.replaceAll('\\', '/'), value.replaceAll('/', '\\')]);
    for (const variant of variants) if (text.includes(variant.toLowerCase())) return value;
  }
  return null;
}

function buildMachinePathPolicy() {
  const cwd = path.resolve(process.cwd());
  const repo = path.basename(cwd).toLowerCase() === 'vscode-extension' ? path.dirname(cwd) : cwd;
  const allEntries = [...new Set([cwd, repo, process.env.GITHUB_WORKSPACE, process.env.X4_REFERENCE_ROOT].filter(Boolean))];
  const firstPartyOnly = [...new Set([os.homedir()].filter(root => root && !allEntries.includes(root)))];
  return { allEntries, firstPartyOnly };
}

export function findForbiddenEmbeddedMachinePath(entryName, bytes, policy) {
  const alwaysForbidden = findEmbeddedMachinePath(bytes, policy.allEntries);
  if (alwaysForbidden) return alwaysForbidden;
  const isVendoredDependency = /^extension\/app\/node_modules(?:\/|$)/i.test(entryName);
  return isVendoredDependency ? null : findEmbeddedMachinePath(bytes, policy.firstPartyOnly);
}

export function inspectEntryMetadata(entries, archiveSize) {
  const errors = [];
  const names = new Map();
  let unpackedBytes = 0;
  if (archiveSize <= 0 || archiveSize > MAX_ARCHIVE_BYTES) errors.push(`archive size exceeds ${MAX_ARCHIVE_BYTES} bytes`);
  if (entries.length === 0 || entries.length > MAX_ENTRIES) errors.push(`entry count is outside 1-${MAX_ENTRIES}`);
  for (const entry of entries) {
    const reason = entryFailure(entry);
    if (reason) errors.push(`${entry.name || '<empty>'}: ${reason}`);
    const normalized = entry.name.toLowerCase();
    names.set(normalized, (names.get(normalized) || 0) + 1);
    if (entry.uncompressedSize > MAX_ENTRY_BYTES) errors.push(`${entry.name}: entry exceeds ${MAX_ENTRY_BYTES} bytes`);
    unpackedBytes += entry.uncompressedSize;
  }
  for (const [name, count] of names) if (count > 1) errors.push(`${name}: duplicate entry (${count})`);
  if (unpackedBytes > MAX_UNPACKED_BYTES) errors.push(`unpacked size ${unpackedBytes} exceeds ${MAX_UNPACKED_BYTES} bytes`);
  for (const required of REQUIRED) {
    const entry = entries.find(candidate => candidate.name === required);
    if (!entry) errors.push(`${required}: required entry missing`);
    else if (entry.uncompressedSize <= 0) errors.push(`${required}: required entry is empty`);
  }
  if (!entries.some(entry => CHANGELOG_ENTRY.test(entry.name) && entry.uncompressedSize > 0)) {
    errors.push('extension/changelog.md: required entry missing or empty');
  }
  if (!entries.some(entry => NATIVE_SQLITE.test(entry.name) && entry.uncompressedSize > 0)) errors.push('better-sqlite3 native binding is missing or empty');
  return { pass: errors.length === 0, errors, entryCount: entries.length, unpackedBytes };
}

export function inspectPackagedChangelog(changelogInput, expectedSourceInput) {
  const text = (Buffer.isBuffer(changelogInput) ? changelogInput.toString('utf8') : String(changelogInput || '')).replace(/\r\n?/g, '\n');
  const errors = [];
  if (!text.startsWith("# What's New in X4 Forge Studio\n")) {
    errors.push('extension/changelog.md: missing generated Forge changelog header');
  }
  const masked = text.replace(
    INTENTIONAL_GITHUB_REF_LINK_RE,
    (match, labelRepo, labelNum, urlRepo, urlNum) => {
      if (labelNum !== urlNum) return match;
      if (labelRepo && labelRepo.toLowerCase() !== urlRepo.toLowerCase()) return match;
      return ' '.repeat(match.length);
    },
  );
  const ambiguous = [...masked.matchAll(AMBIGUOUS_HASH_NUMBER_RE)].map(match => match[0]);
  if (ambiguous.length > 0) {
    errors.push(`extension/changelog.md: unescaped bare #NN reference(s): ${ambiguous.slice(0, 8).join(', ')}`);
  }
  for (const line of text.split('\n')) {
    if (/\broadmap\b/i.test(line) && /\[#\d+\]\(https?:\/\//i.test(line)) {
      errors.push(`extension/changelog.md: historical roadmap number rewritten into false issue link: ${line.trim()}`);
    }
  }
  if (expectedSourceInput !== undefined && expectedSourceInput !== null) {
    const expected = (Buffer.isBuffer(expectedSourceInput) ? expectedSourceInput.toString('utf8') : String(expectedSourceInput)).replace(/\r\n?/g, '\n');
    if (text !== expected) {
      errors.push('extension/changelog.md: packaged changelog diverges from source CHANGELOG.md (unexpected VSCE link/content rewrite)');
    }
  }
  return { pass: errors.length === 0, errors };
}

function extractEntry(bytes, entry) {
  if (entry.flags & 0x1) throw new Error(`${entry.name}: encrypted entries are forbidden.`);
  if (entry.localOffset + 30 > bytes.length || bytes.readUInt32LE(entry.localOffset) !== 0x04034b50) throw new Error(`${entry.name}: invalid local header.`);
  const nameLength = bytes.readUInt16LE(entry.localOffset + 26);
  const extraLength = bytes.readUInt16LE(entry.localOffset + 28);
  const dataOffset = entry.localOffset + 30 + nameLength + extraLength;
  const dataEnd = dataOffset + entry.compressedSize;
  if (dataEnd > bytes.length) throw new Error(`${entry.name}: compressed payload is out of bounds.`);
  const compressed = bytes.subarray(dataOffset, dataEnd);
  let output;
  if (entry.method === 0) output = Buffer.from(compressed);
  else if (entry.method === 8) output = zlib.inflateRawSync(compressed, { maxOutputLength: MAX_ENTRY_BYTES });
  else throw new Error(`${entry.name}: unsupported ZIP compression method ${entry.method}.`);
  if (output.length !== entry.uncompressedSize) throw new Error(`${entry.name}: unpacked size mismatch.`);
  if (crc32(output) !== entry.expectedCrc) throw new Error(`${entry.name}: CRC-32 mismatch.`);
  return output;
}

export function findForbiddenEmbeddedSecret(entryName, bytes) {
  if (/^extension\/app\/node_modules(?:\/|$)/i.test(entryName)) return null;
  const text = Buffer.isBuffer(bytes) ? bytes.toString('utf8') : String(bytes || '');
  const match = text.match(EMBEDDED_AGENT_KEY_RE);
  return match ? 'embedded x4fk_ agent key' : null;
}

export function inspectPackagedVersionIdentity(extensionPkgInput, clientAssetEntries) {
  const errors = [];
  let expectedVersion = '';
  try {
    const pkgText = Buffer.isBuffer(extensionPkgInput) ? extensionPkgInput.toString('utf8') : String(extensionPkgInput || '');
    const pkg = JSON.parse(pkgText);
    expectedVersion = String(pkg?.version || '').trim();
  } catch {
    errors.push('extension/package.json: invalid JSON');
    return { pass: false, errors };
  }
  if (!/^\d+\.\d+\.\d+$/.test(expectedVersion)) {
    errors.push(`extension/package.json: invalid semver version "${expectedVersion}"`);
    return { pass: false, errors };
  }
  let matched = null;
  for (const item of clientAssetEntries || []) {
    const text = Buffer.isBuffer(item.content) ? item.content.toString('utf8') : String(item.content || '');
    const m = CLIENT_BUNDLE_IDENTITY_RE.exec(text);
    if (m) {
      matched = { entryName: item.name, appVersion: m[1], appBuild: m[2] };
      break;
    }
  }
  if (!matched) {
    errors.push('extension/app/dist/assets/*.js: missing packaged client bundle or embedded App version/Build metadata');
    return { pass: false, errors };
  }
  if (matched.appVersion !== expectedVersion) {
    errors.push(
      `${matched.entryName}: client bundle version "${matched.appVersion}" does not match extension/package.json "${expectedVersion}" (re-run repo "npm run build" after bumping vscode-extension/package.json)`,
    );
  }
  if (matched.appBuild.includes('uncommitted')) {
    errors.push(`${matched.entryName}: client bundle was built from uncommitted source ("${matched.appBuild}")`);
  } else if (matched.appBuild.startsWith('shallow-checkout')) {
    errors.push(`${matched.entryName}: client bundle was built from a shallow Git checkout ("${matched.appBuild}")`);
  } else {
    const bm = RELEASE_FULL_HISTORY_BUILD_RE.exec(matched.appBuild);
    const count = bm ? Number(bm[1]) : NaN;
    if (!bm || !Number.isFinite(count) || count < MIN_FULL_HISTORY_COMMIT_COUNT) {
      errors.push(`${matched.entryName}: client bundle has invalid or shallow Git build provenance ("${matched.appBuild}")`);
    }
  }
  return { pass: errors.length === 0, errors };
}

export function inspectVsixBytes(bytes, options = {}) {
  const entries = readVsixEntries(bytes);
  const result = inspectEntryMetadata(entries, bytes.length);
  if (!result.pass) return result;
  const machinePathPolicy = buildMachinePathPolicy();
  let extensionPkgContent = null;
  const clientAssets = [];
  for (const entry of entries) {
    if (entry.name.endsWith('/')) continue;
    const content = extractEntry(bytes, entry);
    const embeddedRoot = findForbiddenEmbeddedMachinePath(entry.name, content, machinePathPolicy);
    if (embeddedRoot) result.errors.push(`${entry.name}: embedded build-machine path ${embeddedRoot}`);
    const embeddedSecret = findForbiddenEmbeddedSecret(entry.name, content);
    if (embeddedSecret) result.errors.push(`${entry.name}: ${embeddedSecret}`);
    if (entry.name === 'extension/package.json') {
      extensionPkgContent = content;
    }
    if (CLIENT_ASSET_JS_ENTRY.test(entry.name)) {
      clientAssets.push({ name: entry.name, content });
    }
    if (CHANGELOG_ENTRY.test(entry.name)) {
      const changelogCheck = inspectPackagedChangelog(content, options.expectedChangelog);
      result.errors.push(...changelogCheck.errors);
    }
  }
  const versionCheck = inspectPackagedVersionIdentity(extensionPkgContent, clientAssets);
  result.errors.push(...versionCheck.errors);
  result.pass = result.errors.length === 0;
  return result;
}

function runSelftest() {
  const entry = (name, uncompressedSize = 1) => ({ name, uncompressedSize, compressedSize: uncompressedSize });
  const valid = [
    ...REQUIRED.map(name => entry(name)),
    entry('extension/changelog.md'),
    entry('extension/app/node_modules/better-sqlite3/build/Release/better_sqlite3.node'),
  ];
  const cases = [
    ['valid_minimum_accepts', valid, true],
    ['missing_changelog_rejects', valid.filter(item => item.name !== 'extension/changelog.md'), false],
    ['missing_supervisor_rejects', valid.filter(item => item.name !== 'extension/out/sidecar-supervisor.js'), false],
    ['missing_mcp_bootstrap_rejects', valid.filter(item => item.name !== 'extension/out/mcp-bootstrap.js'), false],
    ['missing_server_rejects', valid.filter(item => item.name !== 'extension/app/dist/server.cjs'), false],
    ['missing_canonical_md_worker_rejects', valid.filter(item => item.name !== 'extension/app/dist/canonical-md-worker.cjs'), false],
    ['empty_canonical_md_worker_rejects', valid.map(item => item.name === 'extension/app/dist/canonical-md-worker.cjs' ? entry(item.name, 0) : item), false],
    ['missing_x4validate_cli_rejects', valid.filter(item => item.name !== 'extension/app/dist/x4validate.cjs'), false],
    ['empty_x4validate_cli_rejects', valid.map(item => item.name === 'extension/app/dist/x4validate.cjs' ? entry(item.name, 0) : item), false],
    ['empty_required_rejects', valid.map(item => item.name === 'extension/out/extension.js' ? entry(item.name, 0) : item), false],
    ['secret_rejects', [...valid, entry('extension/app/.env')], false],
    ['sourcemap_rejects', [...valid, entry('extension/out/extension.js.map')], false],
    ['machine_path_rejects', [...valid, entry('C:\\Users\\Moshi\\secret.txt')], false],
    ['traversal_rejects', [...valid, entry('extension/app/../escape.txt')], false],
    ['duplicate_rejects', [...valid, entry('extension/out/extension.js')], false],
    ['entry_size_rejects', [...valid, entry('extension/app/huge.bin', MAX_ENTRY_BYTES + 1)], false],
    ['archive_size_rejects', valid, false, MAX_ARCHIVE_BYTES + 1],
  ];
  let passed = 0;
  for (const [name, entries, expected, archiveSize = 1] of cases) {
    const actual = inspectEntryMetadata(entries, archiveSize).pass;
    const pass = actual === expected;
    if (pass) passed++;
    console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
  }
  const embeddedPass = findEmbeddedMachinePath(Buffer.from('source at C:\\Users\\ci\\work\\file.ts'), ['C:\\Users\\ci\\work']) === 'C:\\Users\\ci\\work'
    && findEmbeddedMachinePath(Buffer.from('example /Users/alice/project'), ['C:\\Users\\ci\\work']) === null;
  if (embeddedPass) passed++;
  console.log(`${embeddedPass ? 'PASS' : 'FAIL'} exact_embedded_machine_root_rejects_without_generic_user_path_cry_wolf`);
  const scopedPolicy = { allEntries: ['D:\\a\\X4_Forge'], firstPartyOnly: ['C:\\Users\\runneradmin'] };
  const scopedPass = findForbiddenEmbeddedMachinePath('extension/out/extension.js', Buffer.from('C:\\Users\\runneradmin\\source.ts'), scopedPolicy) === 'C:\\Users\\runneradmin'
    && findForbiddenEmbeddedMachinePath('extension/app/node_modules/vendor/native.node', Buffer.from('C:\\Users\\runneradmin\\build'), scopedPolicy) === null
    && findForbiddenEmbeddedMachinePath('extension/app/node_modules/vendor/index.js', Buffer.from('D:\\a\\X4_Forge\\secret.txt'), scopedPolicy) === 'D:\\a\\X4_Forge';
  if (scopedPass) passed++;
  console.log(`${scopedPass ? 'PASS' : 'FAIL'} vendor_home_allowed_but_first_party_home_and_workspace_rejected`);
  const cleanChangelog = "# What's New in X4 Forge Studio\n\n## 0.0.94 — 2026-11-24\n\n- Fixed [#40](https://github.com/KennyG1990/X4_Forge/issues/40) and escaped \\#63.\n";
  const vsceRewrittenFalseLink = "# What's New in X4 Forge Studio\n\n## 0.0.1 — 2026-07-08\n\n- Updates roadmap to mark [#63](https://github.com/KennyG1990/X4_Forge/issues/63) DONE.\n";
  const bareSlashResidue = "# What's New in X4 Forge Studio\n\n## 0.0.1 — 2026-07-08\n\n- Update: park [#36](https://github.com/KennyG1990/X4_Forge/issues/36)/#37\n";
  const changelogHygienePass = inspectPackagedChangelog(cleanChangelog, cleanChangelog).pass === true
    && inspectPackagedChangelog(vsceRewrittenFalseLink).pass === false
    && inspectPackagedChangelog(bareSlashResidue).pass === false
    && inspectPackagedChangelog(
      "# What's New in X4 Forge Studio\n\n## 0.0.94 — 2026-11-24\n\n- Fixed [#40](https://github.com/KennyG1990/X4_Forge/issues/40).\n",
      "# What's New in X4 Forge Studio\n\n## 0.0.94 — 2026-11-24\n\n- Fixed #40.\n",
    ).pass === false;
  if (changelogHygienePass) passed++;
  console.log(`${changelogHygienePass ? 'PASS' : 'FAIL'} changelog_false_link_and_vsce_rewrite_rejected_while_explicit_links_pass`);
  const embeddedSecretPass = findForbiddenEmbeddedSecret('extension/out/extension.js', Buffer.from(`const k = "x4fk_${'a'.repeat(64)}";`)) === 'embedded x4fk_ agent key'
    && findForbiddenEmbeddedSecret('extension/out/extension.js', Buffer.from('const placeholder = "<paste an agent key here>";')) === null;
  if (embeddedSecretPass) passed++;
  console.log(`${embeddedSecretPass ? 'PASS' : 'FAIL'} embedded_agent_key_token_rejected_in_packaged_bytes`);
  const pkg99 = JSON.stringify({ name: 'x4-forge-studio', version: '0.0.99' });
  const versionIdentityPass = inspectPackagedVersionIdentity(pkg99, [
    { name: 'extension/app/dist/assets/index-test.js', content: 'const c={"App version":"0.0.99",Build:"build 866 · f39a326 · 2026-11-25"};' },
  ]).pass === true
    && inspectPackagedVersionIdentity(pkg99, [
      { name: 'extension/app/dist/assets/index-test.js', content: 'const c={"App version":"1.0.20",Build:"commit ea9f169 · 2026-11-23"};' },
    ]).pass === false
    && inspectPackagedVersionIdentity(pkg99, [
      { name: 'extension/app/dist/assets/index-test.js', content: 'const c={"App version":"0.0.98",Build:"build 866 · f39a326 · 2026-11-25"};' },
    ]).pass === false
    && inspectPackagedVersionIdentity(pkg99, [
      { name: 'extension/app/dist/assets/index-test.js', content: 'const c={"App version":"0.0.99",Build:"shallow-checkout · f39a326 · 2026-11-25"};' },
    ]).pass === false
    && inspectPackagedVersionIdentity(pkg99, [
      { name: 'extension/app/dist/assets/index-test.js', content: 'const c={"App version":"0.0.99",Build:"build 88 · f39a326 · 2026-11-25"};' },
    ]).pass === false
    && inspectPackagedVersionIdentity(pkg99, [
      { name: 'extension/app/dist/assets/index-test.js', content: 'const c={"App version":"0.0.99",Build:"build 866 · f39a326 · 2026-11-25 · uncommitted"};' },
    ]).pass === false;
  if (versionIdentityPass) passed++;
  console.log(`${versionIdentityPass ? 'PASS' : 'FAIL'} client_bundle_version_parity_and_unshallow_provenance_enforced`);
  const total = cases.length + 5;
  console.log(`[vsix-inspector selftest] ${passed}/${total} ${passed === total ? 'PASS' : 'FAIL'}`);
  return passed === total;
}

function emitGithubError(message) {
  if (process.env.GITHUB_ACTIONS !== 'true') return;
  const escaped = String(message).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
  console.error(`::error title=VSIX inspection failed::${escaped}`);
}

if (process.argv.includes('--selftest')) {
  process.exit(runSelftest() ? 0 : 1);
}

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/inspect-vsix.mjs <package.vsix> | --selftest');
  process.exit(2);
}
try {
  const file = path.resolve(input);
  const bytes = fs.readFileSync(file);
  const sourceChangelogPath = path.join(EXT_ROOT, 'CHANGELOG.md');
  const expectedChangelog = fs.existsSync(sourceChangelogPath) ? fs.readFileSync(sourceChangelogPath, 'utf8') : undefined;
  const result = inspectVsixBytes(bytes, { expectedChangelog });
  if (!result.pass) {
    for (const error of result.errors) {
      console.error(`FAIL ${error}`);
      emitGithubError(error);
    }
    console.error(`[vsix-inspector] FAIL ${file}`);
    process.exit(1);
  }
  console.log(`[vsix-inspector] PASS ${result.entryCount} entries, ${result.unpackedBytes} unpacked bytes, ${bytes.length} archive bytes`);
  console.log(`[vsix-inspector] ${file}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  emitGithubError(message);
  console.error(`[vsix-inspector] FAIL ${message}`);
  process.exit(1);
}
