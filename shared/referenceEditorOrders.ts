export interface EditorOrderFile {
  path: string;
  content: string;
}

export const MAX_EDITOR_ORDER_BYTES = 4 * 1024 * 1024;
export const MAX_EDITOR_ORDER_FILES = 2000;

/** Accept direct AI XML sources only. Paths are identities for supplied text. */
export function parseEditorOrderFiles(input: unknown): EditorOrderFile[] | undefined {
  if (!Array.isArray(input) || input.length > MAX_EDITOR_ORDER_FILES) return undefined;
  const files: EditorOrderFile[] = [];
  const seen = new Set<string>();
  let remaining = MAX_EDITOR_ORDER_BYTES;
  for (const file of input) {
    if (!file || typeof file.path !== "string" || typeof file.content !== "string") return undefined;
    const path = file.path.replace(/\\/g, "/");
    if (path.length > 1024 || !/^aiscripts\/[^/:]+\.xml$/i.test(path)
      || [...path].some(character => character.charCodeAt(0) < 32)) return undefined;
    const key = path.toLowerCase();
    remaining -= Buffer.byteLength(file.content, "utf8");
    if (remaining < 0 || seen.has(key)) return undefined;
    seen.add(key);
    files.push({ path, content: file.content });
  }
  return files;
}
