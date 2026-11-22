import * as fs from "node:fs";
import type { FileHandle } from "node:fs/promises";
import * as path from "node:path";
import { createHash } from "node:crypto";
import * as vscode from "vscode";
import {
  readAiScriptNavigationDocument, resolveAiScriptDefinition, resolveAiScriptReferences, type AiScriptLocation,
} from "./aiScriptNavigation";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_REFERENCES = 2_048;
const fileKey = (file: string) => process.platform === "win32" ? file.toLowerCase() : file;
const openFlags = fs.constants.O_RDONLY
  | (process.platform === "win32" ? 0 : fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);

interface EditorInput {
  document: vscode.TextDocument;
  version: number;
}

interface DiskInput {
  file: string;
  stamp: fs.BigIntStats;
  digest?: string;
}

export function sameStamp(before: fs.BigIntStats, after: fs.BigIntStats): boolean {
  return before.dev === after.dev && before.ino === after.ino && before.mode === after.mode
    && before.nlink === after.nlink && before.size === after.size
    && before.mtimeNs === after.mtimeNs && before.ctimeNs === after.ctimeNs;
}

export async function physicalStamp(file: string): Promise<fs.BigIntStats> {
  const stamp = await fs.promises.lstat(file, { bigint: true });
  if (stamp.isSymbolicLink() || fileKey(await fs.promises.realpath(file)) !== fileKey(file)) {
    throw new Error("AI script navigation requires a physical path.");
  }
  return stamp;
}

function captureEditors(directory: string, names: ReadonlyMap<string, string>, caller: vscode.TextDocument) {
  const inputs = new Map<string, EditorInput>();
  for (const document of new Set([...vscode.workspace.textDocuments, caller])) {
    if (document.isClosed || document.uri.scheme !== "file") continue;
    const relative = path.relative(directory, document.uri.fsPath);
    if (path.dirname(relative) !== ".") continue;
    const key = fileKey(relative);
    if (!names.has(key)) continue;
    if (inputs.has(key)) throw new Error("Two open buffers claim the same AI script.");
    inputs.set(key, { document, version: document.version });
  }
  return inputs;
}

export async function withDiskInput<T>(input: DiskInput, read: (handle: FileHandle) => Promise<T>): Promise<T> {
  const handle = await fs.promises.open(input.file, openFlags);
  try {
    if (!sameStamp(input.stamp, await handle.stat({ bigint: true }))) throw new Error("Observed source changed.");
    const value = await read(handle);
    if (!sameStamp(input.stamp, await handle.stat({ bigint: true }))) throw new Error("Observed source changed.");
    return value;
  } finally {
    await handle.close();
  }
}

export async function readDiskInput(input: DiskInput, range?: { offset: number; size: number }): Promise<Buffer> {
  const total = Number(input.stamp.size);
  const offset = range?.offset ?? 0;
  const expected = range?.size ?? total;
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(expected) || expected < 0
    || BigInt(offset) + BigInt(expected) > input.stamp.size) throw new Error('Observed file range is invalid.');
  return withDiskInput(input, async handle => {
    const buffer = Buffer.alloc(expected + (range ? 0 : 1));
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, offset + length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length !== expected) throw new Error("Observed source changed.");
    return buffer.subarray(0, length);
  });
}

/** Resolve against one physical authored mod using the current versions of its open buffers. */
export async function provideAuthoredAiScriptDefinition(
  root: string, caller: vscode.TextDocument, offset: number, token: vscode.CancellationToken, fileLimit: number,
): Promise<AiScriptLocation | undefined> {
  const locations = await readAuthoredAiScriptLocations(root, caller, offset, token, fileLimit, 'definition');
  return locations?.[0];
}

export function provideAuthoredAiScriptReferences(
  root: string, caller: vscode.TextDocument, offset: number, token: vscode.CancellationToken, fileLimit: number,
  includeDeclaration: boolean,
): Promise<AiScriptLocation[] | undefined> {
  return readAuthoredAiScriptLocations(root, caller, offset, token, fileLimit, { includeDeclaration });
}

async function readAuthoredAiScriptLocations(
  root: string, caller: vscode.TextDocument, offset: number, token: vscode.CancellationToken, fileLimit: number,
  mode: 'definition' | { includeDeclaration: boolean },
): Promise<AiScriptLocation[] | undefined> {
  if (token.isCancellationRequested || caller.isClosed || caller.uri.scheme !== "file") return undefined;
  const resolvedRoot = path.resolve(root);
  const directory = path.join(resolvedRoot, "aiscripts");
  const relative = path.relative(directory, caller.uri.fsPath);
  if (path.dirname(relative) !== "." || !/\.xml$/i.test(relative)) return undefined;

  const callerKey = fileKey(relative);
  const callerVersion = caller.version;
  const callerText = caller.getText();
  const callerPath = `aiscripts/${relative}`;
  if (Buffer.byteLength(callerText) > MAX_FILE_BYTES) return undefined;
  const initial = readAiScriptNavigationDocument(callerPath, callerText, offset);
  const selectedName = mode !== 'definition' && initial.selectedDeclaration ? initial.name : initial.callee;
  if (!selectedName) return undefined;

  try {
    const rootStamp = await physicalStamp(resolvedRoot);
    const directoryStamp = await physicalStamp(directory);
    if (!rootStamp.isDirectory() || !directoryStamp.isDirectory()) return undefined;
    const entries = await fs.promises.readdir(directory, { withFileTypes: true });
    const names = new Map<string, string>();
    for (const entry of entries) {
      if (!/\.xml$/i.test(entry.name)) continue;
      const key = fileKey(entry.name);
      if (!entry.isFile() || names.has(key) || names.size >= fileLimit) return undefined;
      names.set(key, entry.name);
    }
    if (!names.has(callerKey)) return undefined;
    const targetFilename = `${selectedName}.xml`;
    // A declaration or editor buffer cannot stand in for the exact physical filename.
    if (names.get(fileKey(targetFilename)) !== targetFilename) return undefined;
    const editors = captureEditors(directory, names, caller);
    if (editors.get(callerKey)?.version !== callerVersion) return undefined;

    const decoder = new TextDecoder("utf-8", { fatal: true });
    const inputs: DiskInput[] = [];
    const scripts: ReturnType<typeof readAiScriptNavigationDocument>[] = [];
    const absoluteByRelative = new Map<string, string>();
    let origin = initial;
    let remaining = MAX_TOTAL_BYTES;
    let remainingReferences = MAX_REFERENCES;

    for (const [key, name] of names) {
      if (token.isCancellationRequested) return undefined;
      const file = path.join(directory, name);
      const stamp = await physicalStamp(file);
      if (!stamp.isFile() || stamp.nlink !== 1n || stamp.size > MAX_FILE_BYTES) return undefined;
      const input: DiskInput = { file, stamp };
      inputs.push(input);
      const editor = editors.get(key);
      if (editor && (editor.document.isClosed || editor.document.version !== editor.version)) return undefined;
      const openText = key === callerKey ? callerText : editor?.document.getText();
      const usesDisk = !editor?.document.isDirty;
      const size = Math.max(usesDisk ? Number(stamp.size) : 0, Buffer.byteLength(openText ?? ""));
      if (size > MAX_FILE_BYTES || size > remaining) return undefined;
      remaining -= size;

      let text = openText;
      if (usesDisk) {
        const bytes = await readDiskInput(input);
        input.digest = createHash("sha256").update(bytes).digest("hex");
        text = decoder.decode(bytes);
        if (openText !== undefined && openText !== text) return undefined;
      }
      if (text === undefined) return undefined;
      const scriptPath = `aiscripts/${name}`;
      absoluteByRelative.set(scriptPath, file);
      const isCaller = key === callerKey;
      const referenceQuery = mode === 'definition' ? undefined : { name: selectedName, limit: remainingReferences };
      const script = isCaller && scriptPath === callerPath && !referenceQuery ? initial
        : readAiScriptNavigationDocument(scriptPath, text, isCaller ? offset : undefined, referenceQuery);
      if (referenceQuery) {
        if (!script.references) return undefined;
        remainingReferences -= script.references.length;
      }
      if (isCaller) origin = script;
      scripts.push(script);
    }

    const definition = mode === 'definition' ? resolveAiScriptDefinition(origin, scripts) : undefined;
    const locations = mode === 'definition' ? definition && [definition]
      : resolveAiScriptReferences(origin, scripts, mode.includeDeclaration);
    if (!locations || token.isCancellationRequested) return undefined;
    const results: AiScriptLocation[] = [];
    for (const location of locations) {
      const file = absoluteByRelative.get(location.file);
      if (!file) return undefined;
      results.push({ ...location, file });
    }

    // Validate every claim, including files that could have become a duplicate while awaiting a read.
    for (const input of inputs) {
      if (token.isCancellationRequested || !sameStamp(input.stamp, await physicalStamp(input.file))) return undefined;
      if (input.digest && createHash("sha256").update(await readDiskInput(input)).digest("hex") !== input.digest) {
        return undefined;
      }
    }
    const currentEntries = await fs.promises.readdir(directory, { withFileTypes: true });
    const currentNames = currentEntries.filter(entry => /\.xml$/i.test(entry.name));
    if (currentNames.length !== names.size || currentNames.some(entry => !entry.isFile()
      || names.get(fileKey(entry.name)) !== entry.name)) return undefined;
    if (token.isCancellationRequested || fileKey(fs.realpathSync.native(directory)) !== fileKey(directory)
      || !sameStamp(rootStamp, fs.lstatSync(resolvedRoot, { bigint: true }))
      || !sameStamp(directoryStamp, fs.lstatSync(directory, { bigint: true }))
      || inputs.some(input => !sameStamp(input.stamp, fs.lstatSync(input.file, { bigint: true })))) return undefined;

    const currentEditors = captureEditors(directory, names, caller);
    if (currentEditors.size !== editors.size || [...editors].some(([key, before]) => {
      const after = currentEditors.get(key);
      return after?.document !== before.document || after.version !== before.version;
    }) || caller.version !== callerVersion || caller.isClosed || token.isCancellationRequested) return undefined;
    return results;
  } catch {
    return undefined;
  }
}
