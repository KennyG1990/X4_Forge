import { normalizeX4UiSourcePath, readX4MenuLuaPaths } from './x4UiSourceBundle';

export const LUA_BOOT_MANIFEST = 'forge-lua-boot.json';
const MAX_TRACKED = 128;
const MAX_PATH_LENGTH = 240;
const LUA_PATH = /^(?:[a-z0-9_-][a-z0-9_.-]*\/)+[a-z0-9_-][a-z0-9_.-]*\.lua$/i;
const MARKER = /^(?:\[=ERROR=\][ \t]+(?:\d+(?::\d+)*(?:\.\d+)?[ \t]+)?)?\[FORGE-LUA-BOOT\][ \t]+mod=([a-z0-9_.-]{1,128})[ \t]+run=([a-z0-9_-]{1,80})[ \t]+(?:phase=(begin|complete)|file=(\S{1,240}))[ \t]*\r?$/i;

const pathKey = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;

export interface ValidLuaBootManifest {
  status: 'valid';
  registered: number;
  files: string[];
}

export type LuaBootManifestResult = ValidLuaBootManifest | { status: 'invalid-manifest'; detail: string };

export function readLuaBootManifest(manifestText: string, uiXml: string): LuaBootManifestResult {
  const invalid = (detail: string): LuaBootManifestResult => ({ status: 'invalid-manifest', detail });
  let decoded: unknown;
  try {
    decoded = JSON.parse(manifestText.replace(/^\uFEFF/, ''));
  } catch {
    return invalid('The boot manifest is not valid JSON.');
  }
  const invalidShape = 'Use version 1 and one to 128 contained Lua paths.';
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded) || Object.keys(decoded).length !== 2) {
    return invalid(invalidShape);
  }
  const { version, files } = decoded as Record<string, unknown>;
  if (version !== 1 || !Array.isArray(files) || !files.length || files.length > MAX_TRACKED) {
    return invalid(invalidShape);
  }
  const registeredPaths = readX4MenuLuaPaths(uiXml, true);
  if (!registeredPaths) return invalid('The installed ui.xml registration could not be parsed.');
  const registered = new Set([...registeredPaths].map(pathKey));
  const tracked = new Map<string, string>();
  for (const file of files) {
    if (typeof file !== 'string' || file.length > MAX_PATH_LENGTH || !LUA_PATH.test(file)
      || normalizeX4UiSourcePath(file).key !== file) return invalid(invalidShape);
    const key = pathKey(file);
    if (!registered.has(key) || tracked.has(key)) {
      return invalid('Every tracked Lua path must be unique and registered in installed ui.xml.');
    }
    tracked.set(key, file);
  }
  return { status: 'valid', registered: registered.size, files: [...tracked.values()] };
}

export interface LuaBootRunState {
  run: string | null;
  completed: boolean;
  observed: Set<string>;
}

export function createLuaBootLogFold(modId: string, files: readonly string[]) {
  const owner = modId.toLowerCase();
  const tracked = new Set(files.map(pathKey));
  const initial = (): LuaBootRunState => ({ run: null, completed: false, observed: new Set() });
  return {
    initial,
    copy: (state: LuaBootRunState): LuaBootRunState => ({ ...state, observed: new Set(state.observed) }),
    line(state: LuaBootRunState, line: string, _offset: number): LuaBootRunState | undefined {
      const match = MARKER.exec(line);
      if (!match || match[0] !== line || match[1].toLowerCase() !== owner) return;
      const [, , run, phase, file] = match;
      if (phase?.toLowerCase() === 'begin') return { ...initial(), run };
      if (state.run !== run || state.completed) return;
      if (phase?.toLowerCase() === 'complete') state.completed = true;
      else if (file && tracked.has(pathKey(file))) state.observed.add(pathKey(file));
    },
    gap: (_state: LuaBootRunState): LuaBootRunState => initial(),
  };
}

export interface LuaBootRunSummary {
  status: 'complete' | 'awaiting-completion' | 'window-unavailable';
  run: string | null;
  registered: number;
  tracked: number;
  observed: number;
  missing: number | null;
  files: Array<{ path: string; state: 'observed' | 'missing' | 'unconfirmed' }>;
}

export function summarizeLuaBootRun(manifest: ValidLuaBootManifest, state: LuaBootRunState): LuaBootRunSummary {
  const { registered, files } = manifest;
  const { run, completed, observed } = state;
  return {
    status: completed ? 'complete' : run ? 'awaiting-completion' : 'window-unavailable',
    run,
    registered,
    tracked: files.length,
    observed: observed.size,
    missing: completed ? files.length - observed.size : null,
    files: files.map(path => ({ path,
      state: observed.has(pathKey(path)) ? 'observed' : completed ? 'missing' : 'unconfirmed' })),
  };
}
