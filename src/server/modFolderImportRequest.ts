import path from 'node:path';

export type ModFolderImportRequest = { path: string; root?: 'workspace' | 'filesystem' };
export type ModFolderImportRequestResult =
  | { ok: true; value: ModFolderImportRequest }
  | { ok: false; code: 'IMPORT_INPUT_INVALID'; error: string };

/** Validate before root resolution: coercion must never select a different mod. */
export function parseModFolderImportRequest(input: unknown): ModFolderImportRequestResult {
  const invalid = (error: string): ModFolderImportRequestResult => ({ ok: false, code: 'IMPORT_INPUT_INVALID', error });
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return invalid('Import requires a JSON object: {"root":"workspace","path":"mod_folder"}.');
  }
  const body = input as Record<string, unknown>;
  if (Object.keys(body).some(key => key !== 'root' && key !== 'path')) {
    return invalid('Import accepts only root and path. Use {"root":"workspace","path":"mod_folder"}; workspace identity is supplied in the request headers.');
  }
  if (typeof body.path !== 'string' || !body.path.trim() || body.path.length > 4096
    || [...body.path].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
    return invalid('Import path must be a nonempty relative folder string of at most 4096 characters, without control characters.');
  }
  const relativePath = body.path.trim();
  if (path.posix.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)
    || /^[a-z]:/i.test(relativePath) || relativePath.split(/[\\/]/).includes('..')) {
    return invalid('Import path must stay inside the selected project root; absolute, drive-relative and parent traversal paths are not accepted.');
  }
  if (!Object.prototype.hasOwnProperty.call(body, 'root')) return { ok: true, value: { path: relativePath } };
  if (typeof body.root !== 'string') return invalid('Import root must be "workspace" or "filesystem", or omitted.');
  const root = body.root.trim().toLowerCase();
  if (root !== 'workspace' && root !== 'filesystem') return invalid('Import root must be "workspace" or "filesystem", or omitted.');
  return { ok: true, value: { path: relativePath, root } };
}
