/**
 * Deterministic directory-role safety for X4 Forge.
 *
 * The installed game and unpacked corpus are protected roots. The mod workspace
 * may never overlap either tree. The filesystem role may point at deployed
 * extensions for browsing/import, but generic writes to protected roots are
 * rejected separately. Explicit Deploy is the sole live-game write path.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type DirectoryField = 'x4GamePath' | 'modWorkspacePath' | 'filesystemPath';

export interface DirectoryPathIssue {
  field: DirectoryField;
  code: 'GAME_NOT_FOUND' | 'GAME_MARKER_MISSING' | 'PROTECTED_ROOT_OVERLAP';
  message: string;
  path: string;
  protectedPath?: string;
}

export interface DirectoryRoleInput {
  x4GamePath?: string;
  x4ReferenceRoot?: string;
  modWorkspacePath?: string;
  filesystemPath?: string;
}

function existingAncestorRealpath(absolutePath: string): string {
  const tail: string[] = [];
  let cursor = absolutePath;
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) return absolutePath;
    tail.unshift(path.basename(cursor));
    cursor = parent;
  }
  try {
    const real = fs.realpathSync.native(cursor);
    return tail.length ? path.join(real, ...tail) : real;
  } catch {
    return absolutePath;
  }
}

/** Resolve separators, relative segments, trailing separators, and existing junctions. */
export function canonicalDirectoryPath(rawPath: string): string {
  const trimmed = String(rawPath || '').trim();
  if (!trimmed) return '';
  return path.normalize(existingAncestorRealpath(path.resolve(trimmed)));
}

function comparisonKey(canonical: string): string {
  return process.platform === 'win32' ? canonical.toLocaleLowerCase('en-US') : canonical;
}

/** Pure comparison of paths already normalized/validated by their owner. No
 * filesystem lookup or lexical fallback can silently become a permission check. */
export function isCanonicalSameOrDescendant(candidatePath: string, rootPath: string): boolean {
  const candidate = comparisonKey(candidatePath);
  const root = comparisonKey(rootPath);
  if (!candidate || !root) return false;
  return candidate === root || candidate.startsWith(root.endsWith(path.sep) ? root : `${root}${path.sep}`);
}

export function isSameOrDescendant(candidatePath: string, rootPath: string): boolean {
  return isCanonicalSameOrDescendant(canonicalDirectoryPath(candidatePath), canonicalDirectoryPath(rootPath));
}

export function pathsOverlap(leftPath: string, rightPath: string): boolean {
  return isSameOrDescendant(leftPath, rightPath) || isSameOrDescendant(rightPath, leftPath);
}

function requirePhysicalDirectory(raw: string | undefined, label: string): string {
  const configured = raw?.trim();
  if (!configured || !path.isAbsolute(configured) || /^(?:\\\\|\/\/)/.test(configured)) {
    throw new Error(`${label} must be an absolute local directory.`);
  }
  const directory = path.resolve(configured);
  if (!fs.lstatSync(directory, { throwIfNoEntry: false })?.isDirectory()
    || path.relative(directory, fs.realpathSync.native(directory))) {
    throw new Error(`${label} must be a physical directory.`);
  }
  return directory;
}

/** Only the launching process can opt in. Saved settings cannot select these roles. */
export function resolveDevScratchRoles(env: NodeJS.ProcessEnv = process.env) {
  if (env.X4_FORGE_DEV_SCRATCH_SETTINGS === undefined) return undefined;
  if (env.X4_FORGE_DEV_SCRATCH_SETTINGS !== '1' || env.X4_FORGE_MODE !== 'dev-build') {
    throw new Error('Forge Dev scratch settings require the explicit dev-build launch mode.');
  }
  const root = requirePhysicalDirectory(env.X4_FORGE_DEV_ROOT, 'Forge Dev lab root');
  if (root === path.parse(root).root) throw new Error('Forge Dev requires a dedicated lab directory.');
  const x4GamePath = requirePhysicalDirectory(path.join(root, 'scratch-game'), 'Forge Dev scratch game root');
  const filesystemPath = requirePhysicalDirectory(path.join(x4GamePath, 'extensions'), 'Forge Dev scratch extensions root');
  const modWorkspacePath = requirePhysicalDirectory(path.join(root, 'mods'), 'Forge Dev mod workspace');
  const builds = path.join(modWorkspacePath, '.forge-builds');
  for (const directory of [builds, path.join(builds, 'loose')]) {
    if (fs.lstatSync(directory, { throwIfNoEntry: false })) requirePhysicalDirectory(directory, 'Forge Dev deployment staging');
  }
  if (env.X4_GAME_PATH !== undefined
    && (!path.isAbsolute(env.X4_GAME_PATH) || path.relative(x4GamePath, env.X4_GAME_PATH))) {
    throw new Error('Forge Dev game override conflicts with the scratch root.');
  }
  for (let directory = x4GamePath; ; directory = path.dirname(directory)) {
    if (fs.lstatSync(path.join(directory, 'X4.exe'), { throwIfNoEntry: false })) {
      throw new Error('Forge Dev scratch target is inside an X4 installation.');
    }
    if (directory === path.dirname(directory)) break;
  }
  const x4LogPath = path.join(x4GamePath, 'debuglog.txt');
  const log = fs.lstatSync(x4LogPath, { throwIfNoEntry: false });
  if (log && (!log.isFile() || log.nlink !== 1)) throw new Error('Forge Dev log path must be a physical file.');
  return { x4GamePath, filesystemPath, modWorkspacePath, x4LogPath };
}

/** Validate the sidecar's writable roots before opening any durable state. */
export function validateDevScratchStorage(): void {
  const scratch = resolveDevScratchRoles();
  if (!scratch) return;
  const root = path.dirname(scratch.x4GamePath);
  const fields = ['X4_CONFIG_DIR', 'X4_STATE_DIR', 'X4_DATA_DIR', 'X4_SOURCE_COORDINATION_DIR', 'X4FORGE_DISCOVERY_DIR'] as const;
  for (const field of fields) {
    const configured = process.env[field];
    if (configured === undefined && (field === 'X4_SOURCE_COORDINATION_DIR' || field === 'X4FORGE_DISCOVERY_DIR')) continue;
    const directory = requirePhysicalDirectory(configured, field);
    if (!path.relative(root, directory) || !isSameOrDescendant(directory, root)
      || pathsOverlap(directory, scratch.x4GamePath) || pathsOverlap(directory, scratch.modWorkspacePath)) {
      throw new Error(`${field} must be isolated from the workspace and deploy target inside the Forge Dev lab.`);
    }
    if (field === 'X4_CONFIG_DIR') {
      const config = fs.lstatSync(path.join(directory, 'config.json'), { throwIfNoEntry: false });
      if (config && (!config.isFile() || config.nlink !== 1)) throw new Error('Forge Dev config must be a physical file.');
    }
  }
}

function protectedDirectoryRoots(input: DirectoryRoleInput): Array<{ label: string; path: string }> {
  const gamePath = String(input.x4GamePath || '').trim();
  const referenceRoot = String(input.x4ReferenceRoot || '').trim();
  return [
    ...(gamePath ? [
      { label: 'installed X4 game', path: gamePath },
      { label: 'live X4 extensions folder', path: path.join(gamePath, 'extensions') },
    ] : []),
    ...(referenceRoot ? [{ label: 'read-only unpacked X4 corpus', path: referenceRoot }] : []),
  ];
}

export function inspectGameInstall(gamePath: string): { valid: boolean; canonicalPath: string; issue?: DirectoryPathIssue } {
  const canonicalPath = canonicalDirectoryPath(gamePath);
  if (!canonicalPath) return { valid: false, canonicalPath };
  let stat: fs.Stats;
  try { stat = fs.statSync(canonicalPath); }
  catch {
    return {
      valid: false,
      canonicalPath,
      issue: { field: 'x4GamePath', code: 'GAME_NOT_FOUND', path: canonicalPath, message: `X4 game installation not found at "${canonicalPath}".` },
    };
  }
  if (!stat.isDirectory()) {
    return {
      valid: false,
      canonicalPath,
      issue: { field: 'x4GamePath', code: 'GAME_NOT_FOUND', path: canonicalPath, message: `X4 game installation must be a directory: "${canonicalPath}".` },
    };
  }
  if (!fs.existsSync(path.join(canonicalPath, 'X4.exe'))) {
    return {
      valid: false,
      canonicalPath,
      issue: {
        field: 'x4GamePath',
        code: 'GAME_MARKER_MISSING',
        path: canonicalPath,
        message: `"${canonicalPath}" is not an X4 installation root (X4.exe was not found).`,
      },
    };
  }
  return { valid: true, canonicalPath };
}

/**
 * Validate configured directory roles. Only the mod workspace is an editable
 * development root; filesystemPath intentionally represents the deployed tree.
 * Empty optional paths are allowed; a non-empty game path must be a real X4 root.
 */
export function validateDirectoryRoles(input: DirectoryRoleInput, scratchGamePath?: string): DirectoryPathIssue[] {
  const issues: DirectoryPathIssue[] = [];
  const gamePath = String(input.x4GamePath || '').trim();
  if (gamePath && (!scratchGamePath || path.relative(scratchGamePath, gamePath))) {
    const game = inspectGameInstall(gamePath);
    if (!game.valid && game.issue) issues.push(game.issue);
  }

  const protectedRoots = protectedDirectoryRoots(input);
  const editable: Array<{ field: 'modWorkspacePath'; label: string; value: string }> = [
    { field: 'modWorkspacePath', label: 'Mod Workspace Folder', value: String(input.modWorkspacePath || '').trim() },
  ];
  for (const root of editable) {
    if (!root.value) continue;
    for (const protectedRoot of protectedRoots) {
      if (!pathsOverlap(root.value, protectedRoot.path)) continue;
      const canonical = canonicalDirectoryPath(root.value);
      const protectedCanonical = canonicalDirectoryPath(protectedRoot.path);
      issues.push({
        field: root.field,
        code: 'PROTECTED_ROOT_OVERLAP',
        path: canonical,
        protectedPath: protectedCanonical,
        message: `${root.label} must be an isolated development directory. "${canonical}" overlaps the ${protectedRoot.label} at "${protectedCanonical}". Choose a separate folder such as Documents\\X4ForgeMods; use Deploy when you intentionally want to update the live game.`,
      });
      break;
    }
  }
  return issues;
}

/**
 * Validate a requested generic write against protected runtime/corpus trees.
 * This is deliberately separate from role validation: filesystemPath may validly
 * describe the live extensions root for reads without authorizing writes there.
 */
export function validateProtectedWriteTargets(
  input: DirectoryRoleInput,
  fields: Array<'modWorkspacePath' | 'filesystemPath'>,
): DirectoryPathIssue[] {
  const issues: DirectoryPathIssue[] = [];
  const protectedRoots = protectedDirectoryRoots(input);
  for (const field of fields) {
    const value = String(input[field] || '').trim();
    if (!value) continue;
    for (const protectedRoot of protectedRoots) {
      if (!pathsOverlap(value, protectedRoot.path)) continue;
      const canonical = canonicalDirectoryPath(value);
      const protectedCanonical = canonicalDirectoryPath(protectedRoot.path);
      const label = field === 'modWorkspacePath' ? 'Mod Workspace Folder' : 'Filesystem Folder';
      issues.push({
        field,
        code: 'PROTECTED_ROOT_OVERLAP',
        path: canonical,
        protectedPath: protectedCanonical,
        message: `${label} is read-only at this location. "${canonical}" overlaps the ${protectedRoot.label} at "${protectedCanonical}". Import the mod into the isolated workspace, then use validated Deploy for intentional live-game changes.`,
      });
      break;
    }
  }
  return issues;
}

export function runPathRolesSelftest() {
  const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];
  const ok = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, ...(detail ? { detail } : {}) });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'x4forge-path-roles-'));
  const game = path.join(tmp, 'X4 Foundations');
  const live = path.join(game, 'extensions');
  const corpus = path.join(tmp, 'X4 unpacked');
  const safe = path.join(tmp, 'X4ForgeMods');
  try {
    fs.mkdirSync(live, { recursive: true });
    fs.mkdirSync(corpus, { recursive: true });
    fs.mkdirSync(safe, { recursive: true });
    fs.writeFileSync(path.join(game, 'X4.exe'), '', 'utf8');
    ok('real_game_marker_accepted', inspectGameInstall(game).valid);
    ok('non_game_directory_rejected', inspectGameInstall(corpus).issue?.code === 'GAME_MARKER_MISSING');
    ok('missing_game_rejected', inspectGameInstall(path.join(tmp, 'missing')).issue?.code === 'GAME_NOT_FOUND');
    ok('safe_workspace_and_live_filesystem_accepted', validateDirectoryRoles({ x4GamePath: game, x4ReferenceRoot: corpus, modWorkspacePath: safe, filesystemPath: live }).length === 0);
    ok('live_extensions_filesystem_role_accepted', !validateDirectoryRoles({ x4GamePath: game, filesystemPath: live }).some(i => i.field === 'filesystemPath'));
    ok('live_extensions_workspace_rejected', validateDirectoryRoles({ x4GamePath: game, modWorkspacePath: live }).some(i => i.field === 'modWorkspacePath'));
    ok('game_child_workspace_rejected', validateDirectoryRoles({ x4GamePath: game, modWorkspacePath: path.join(game, 'dev') }).some(i => i.field === 'modWorkspacePath'));
    ok('game_parent_workspace_rejected', validateDirectoryRoles({ x4GamePath: game, modWorkspacePath: tmp }).some(i => i.field === 'modWorkspacePath'));
    ok('corpus_workspace_rejected', validateDirectoryRoles({ x4ReferenceRoot: corpus, modWorkspacePath: corpus }).some(i => i.field === 'modWorkspacePath'));
    ok('live_extensions_filesystem_write_rejected', validateProtectedWriteTargets({ x4GamePath: game, filesystemPath: live }, ['filesystemPath']).some(i => i.field === 'filesystemPath'));
    ok('corpus_parent_filesystem_write_rejected', validateProtectedWriteTargets({ x4ReferenceRoot: corpus, filesystemPath: tmp }, ['filesystemPath']).some(i => i.field === 'filesystemPath'));
    ok('safe_filesystem_write_accepted', validateProtectedWriteTargets({ x4GamePath: game, x4ReferenceRoot: corpus, filesystemPath: safe }, ['filesystemPath']).length === 0);
    ok('case_and_dot_segments_normalized', pathsOverlap(path.join(live, '..', 'extensions'), live));
    const linkedGame = path.join(tmp, 'linked-game');
    fs.symlinkSync(game, linkedGame, 'junction');
    ok('junction_to_game_rejected', validateDirectoryRoles({ x4GamePath: game, modWorkspacePath: linkedGame }).some(i => i.field === 'modWorkspacePath'));
    ok('junction_to_game_filesystem_write_rejected', validateProtectedWriteTargets({ x4GamePath: game, filesystemPath: linkedGame }, ['filesystemPath']).some(i => i.field === 'filesystemPath'));
    ok('empty_optional_paths_accepted', validateDirectoryRoles({}).length === 0);

    const dev = path.join(tmp, 'dev');
    const scratch = path.join(dev, 'scratch-game');
    const scratchExtensions = path.join(scratch, 'extensions');
    const mods = path.join(dev, 'mods');
    fs.mkdirSync(scratchExtensions, { recursive: true });
    fs.mkdirSync(mods);
    const env = { X4_FORGE_DEV_SCRATCH_SETTINGS: '1', X4_FORGE_MODE: 'dev-build', X4_FORGE_DEV_ROOT: dev, X4_GAME_PATH: scratch };
    const refuses = (overrides: NodeJS.ProcessEnv) => {
      try { resolveDevScratchRoles({ ...env, ...overrides }); return false; } catch { return true; }
    };
    const pins = resolveDevScratchRoles(env);
    ok('explicit_scratch_launch_pins_all_roles', pins?.x4GamePath === scratch && pins.filesystemPath === scratchExtensions
      && pins.modWorkspacePath === mods && pins.x4LogPath === path.join(scratch, 'debuglog.txt'));
    ok('legacy_dev_root_does_not_opt_in', !resolveDevScratchRoles({ ...env, X4_FORGE_DEV_SCRATCH_SETTINGS: undefined }));
    ok('other_mode_cannot_opt_in', refuses({ X4_FORGE_MODE: 'standalone' }));
    ok('conflicting_game_override_refused', refuses({ X4_GAME_PATH: game }));
    ok('scratch_does_not_require_install_marker', validateDirectoryRoles(pins!, pins?.x4GamePath).length === 0);
    ok('scratch_still_protects_extensions_from_generic_writes', validateProtectedWriteTargets(pins!, ['filesystemPath']).length === 1);
    ok('scratch_workspace_still_cannot_overlap_corpus', validateDirectoryRoles({ ...pins, x4ReferenceRoot: mods }, pins?.x4GamePath).length === 1);
    fs.writeFileSync(path.join(dev, 'X4.exe'), '');
    ok('scratch_nested_under_install_marker_refused', refuses({}));
    fs.unlinkSync(path.join(dev, 'X4.exe'));
    const linkedDev = path.join(tmp, 'linked-dev');
    fs.symlinkSync(dev, linkedDev, 'junction');
    ok('aliased_scratch_root_refused', refuses({ X4_FORGE_DEV_ROOT: linkedDev }));
    fs.symlinkSync(game, path.join(mods, '.forge-builds'), 'junction');
    ok('aliased_deploy_staging_refused', refuses({}));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const passed = checks.filter(check => check.pass).length;
  return { allPassed: passed === checks.length, pass: passed === checks.length, passed, total: checks.length, checks };
}

if (path.basename(process.argv[1] || '') === 'pathRoles.ts') {
  const result = runPathRolesSelftest();
  console.log(`path roles selftest: ${result.passed}/${result.total} allPassed=${result.allPassed}`);
  for (const check of result.checks) if (!check.pass) console.log('FAIL', check.name, check.detail || '');
  process.exit(result.allPassed ? 0 : 1);
}
