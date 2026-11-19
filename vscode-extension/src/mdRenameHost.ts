import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import * as vscode from "vscode";
import { MAX_MD_DEFINITION_SOURCE, planMdRename, type MdRenameEdit } from "./langNav";

const PREVIEW_SCHEME = "x4forge-md-rename";
const keyOf = (file: string) => process.platform === "win32" ? file.toLowerCase() : file;
const stamp = (info: fs.BigIntStats) => [info.dev, info.ino, info.size, info.mtimeNs, info.ctimeNs].join(":");

interface DiskInput { file: string; text: string; identity: string; }
interface EditorInput { document: vscode.TextDocument; version: number; text: string; }

function physical(file: string): fs.BigIntStats {
  const info = fs.lstatSync(file, { bigint: true });
  if (info.isSymbolicLink() || keyOf(fs.realpathSync.native(file)) !== keyOf(file)) {
    throw new Error(`Rename requires a physical mod path. Review ${file}.`);
  }
  return info;
}

function captureDisk(root: string, directory: string, fileLimit: number) {
  const rootInfo = physical(root);
  const directoryInfo = physical(directory);
  if (!rootInfo.isDirectory() || !directoryInfo.isDirectory()) throw new Error("Select an unpacked Mission Director mod.");
  const manifestInfo = physical(path.join(root, "content.xml"));
  if (!manifestInfo.isFile() || manifestInfo.nlink !== 1n) throw new Error("Rename needs a regular mod content.xml file.");
  if (fs.readdirSync(root).some(name => /^extensions$|\.(cat|dat)$/i.test(name))) {
    throw new Error("This mod has dependency overlays or packed files. Forge cannot review their Mission Director references yet.");
  }
  const files = new Map<string, DiskInput>();
  let remaining = 4 * MAX_MD_DEFINITION_SOURCE;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() || entry.isSymbolicLink()) throw new Error(`Review the nested or linked path md/${entry.name} before renaming.`);
    if (!/\.xml$/i.test(entry.name)) continue;
    const file = path.join(directory, entry.name);
    const key = keyOf(file);
    const before = physical(file);
    if (!before.isFile() || before.nlink !== 1n) throw new Error(`Rename requires a regular, single-link file. Review md/${entry.name}.`);
    if (files.size >= fileLimit || files.has(key) || before.size > MAX_MD_DEFINITION_SOURCE || before.size > remaining) {
      throw new Error(`Forge cannot completely review the MD inventory at md/${entry.name}.`);
    }
    const fd = fs.openSync(file, "r");
    try {
      const identity = stamp(before);
      if (identity !== stamp(fs.fstatSync(fd, { bigint: true }))) throw changedInput();
      // Read at most the observed size plus one byte to detect an in-place expansion.
      const bytes = Buffer.alloc(Number(before.size) + 1);
      let length = 0;
      while (length < bytes.length) {
        const count = fs.readSync(fd, bytes, length, bytes.length - length, null);
        if (count === 0) break;
        length += count;
      }
      if (length !== Number(before.size) || identity !== stamp(physical(file))) throw changedInput();
      const content = bytes.subarray(0, length);
      const text = new TextDecoder("utf-8", { fatal: true }).decode(content);
      files.set(key, { file, text, identity: `${identity}:${createHash("sha256").update(content).digest("hex")}` });
      remaining -= length;
    } finally {
      fs.closeSync(fd);
    }
  }
  const directories = [stamp(rootInfo), stamp(directoryInfo), stamp(manifestInfo)].join("|");
  if (directories !== [stamp(physical(root)), stamp(physical(directory)), stamp(physical(path.join(root, "content.xml")))].join("|")) {
    throw changedInput();
  }
  return { files, directories };
}

function captureEditors(directory: string, files: ReadonlyMap<string, DiskInput>): Map<string, EditorInput> {
  const editors = new Map<string, EditorInput>();
  let remaining = 4 * MAX_MD_DEFINITION_SOURCE;
  for (const document of vscode.workspace.textDocuments) {
    if (document.isClosed || (document.uri.scheme !== "file" && document.uri.scheme !== "untitled")) continue;
    const relative = path.relative(directory, document.uri.fsPath);
    if (!/\.xml$/i.test(relative) || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) continue;
    const key = keyOf(document.uri.fsPath);
    const disk = files.get(key);
    if (document.uri.scheme !== "file" || !disk || editors.has(key)) throw changedInput();
    const text = document.getText();
    const bytes = Buffer.byteLength(text);
    if (bytes > MAX_MD_DEFINITION_SOURCE || bytes > remaining) throw new Error("Open MD documents exceed the rename review limit.");
    if (!document.isDirty && text !== disk.text) throw changedInput();
    remaining -= bytes;
    editors.set(key, { document, text, version: document.version });
  }
  return editors;
}

function changedInput(): Error {
  return new Error("A reviewed file, editor buffer or MD folder changed. Run Rename Mission Director Symbol again.");
}

function recheck(
  root: string, directory: string, limit: number,
  baseline: ReturnType<typeof captureDisk>, editors: ReadonlyMap<string, EditorInput>,
): void {
  const current = captureDisk(root, directory, limit);
  if (current.directories !== baseline.directories || current.files.size !== baseline.files.size
    || [...current.files].some(([key, input]) => input.identity !== baseline.files.get(key)?.identity)) throw changedInput();
  const open = captureEditors(directory, current.files);
  if (open.size !== editors.size) throw changedInput();
  for (const [key, before] of editors) {
    const after = open.get(key);
    if (after?.document !== before.document || after.version !== before.version || after.text !== before.text) throw changedInput();
  }
}

/** Review a fixed set of replacements, then hand one text-only transaction to the host. */
export function registerMdRenameCommand(
  context: vscode.ExtensionContext, modRootFor: (file: string) => string | null, fileLimit: number,
  begin: () => (outcome: "ok" | "cancelled" | "error") => void,
): void {
  let review: { uri: vscode.Uri; text: string } | undefined;
  let active = false;
  let nextReview = 0;
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(PREVIEW_SCHEME, {
      provideTextDocumentContent: uri => review?.uri.toString() === uri.toString() ? review.text : "",
    }),
    vscode.commands.registerCommand("x4forge.renameMdSymbol", async () => {
      if (active) {
        void vscode.window.showInformationMessage("Finish the current Mission Director rename review first.");
        return;
      }
      active = true;
      const finish = begin();
      let outcome: "ok" | "cancelled" | "error" = "cancelled";
      try {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.scheme !== "file") throw new Error("Open an authored Mission Director XML file first.");
        const original = editor.document;
        const root = modRootFor(original.uri.fsPath);
        if (!root) throw new Error("Open the unpacked mod folder in this workspace first.");
        const directory = path.join(root, "md");
        if (keyOf(path.dirname(original.uri.fsPath)) !== keyOf(directory) || !/\.xml$/i.test(original.uri.fsPath)) {
          throw new Error("Open an XML file in the mod's md folder first.");
        }
        const cursor = original.offsetAt(editor.selection.active);
        const version = original.version;
        const name = await vscode.window.showInputBox({ prompt: "New cue or library name", title: "Rename Mission Director Symbol" });
        if (name === undefined) return;
        if (original.isClosed || version !== original.version) throw changedInput();

        const disk = captureDisk(root, directory, fileLimit);
        const editors = captureEditors(directory, disk.files);
        const sources = [...disk.files].map(([key, input]) => ({ file: key, text: editors.get(key)?.text ?? input.text }));
        const result = planMdRename(sources, keyOf(original.uri.fsPath), cursor, name);
        if ("reason" in result) throw new Error(result.reason);

        const targets = new Map<string, MdRenameEdit[]>();
        for (const edit of result.edits) {
          const edits = targets.get(edit.file) ?? [];
          edits.push(edit);
          targets.set(edit.file, edits);
        }
        for (const key of targets.keys()) {
          if (editors.has(key)) continue;
          const input = disk.files.get(key)!;
          const document = await vscode.workspace.openTextDocument(vscode.Uri.file(input.file));
          if (document.isClosed || document.isDirty || document.getText() !== input.text) throw changedInput();
          editors.set(key, { document, version: document.version, text: input.text });
        }
        recheck(root, directory, fileLimit, disk, editors);

        const edits = new vscode.WorkspaceEdit();
        // Keep versioned ranges intact if a reviewed file is the active editor
        // at apply time. The host minimizes unannotated active-editor edits.
        const metadata = { label: "Reviewed Mission Director rename", needsConfirmation: false };
        const expected = new Map<string, string>();
        const lines: string[] = [];
        for (const [key, replacements] of targets) {
          const { document, text } = editors.get(key)!;
          let after = text;
          const relative = path.relative(root, document.uri.fsPath);
          const fileLines: string[] = [];
          for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
            const start = document.positionAt(replacement.start);
            const end = document.positionAt(replacement.end);
            edits.replace(document.uri, new vscode.Range(start, end), replacement.after, metadata);
            after = after.slice(0, replacement.start) + replacement.after + after.slice(replacement.end);
            fileLines.unshift(`${relative}:${start.line + 1}:${start.character + 1}–${end.character + 1}  ${replacement.before} → ${replacement.after}`);
          }
          lines.push(...fileLines);
          expected.set(key, after);
        }
        // Open siblings also determine the bindings reviewed in this preview.
        // An empty edit gives each existing model a version fence without
        // changing its text, dirty state or undo history.
        for (const [key, { document }] of editors) {
          if (targets.has(key)) continue;
          const start = new vscode.Position(0, 0);
          edits.replace(document.uri, new vscode.Range(start, start), "", metadata);
        }
        const title = `Rename ${result.kind} ${result.script}.${result.oldName} to ${result.newName}`;
        review = {
          uri: vscode.Uri.from({ scheme: PREVIEW_SCHEME, path: "/Mission Director Rename.txt", query: String(++nextReview) }),
          text: `${title}\n\nReviewed unpacked MD files in ${root}\n${lines.length} replacements in ${targets.size} files\n\n${lines.join("\n")}\n`,
        };
        await vscode.window.showTextDocument(review.uri, { preview: true, viewColumn: vscode.ViewColumn.Beside });
        const answer = await vscode.window.showInformationMessage(title, "Apply Rename", "Cancel");
        if (answer !== "Apply Rename") return;

        // The public API stamps loaded target versions when called. Keep this
        // final check and the call in one extension-host turn.
        recheck(root, directory, fileLimit, disk, editors);
        if (!await vscode.workspace.applyEdit(edits)) throw changedInput();
        for (const [key, text] of expected) {
          const document = editors.get(key)!.document;
          if (document.isClosed || document.getText() !== text) {
            throw new Error("The editor applied the rename, but the buffers changed before Forge could verify them.");
          }
        }
        outcome = "ok";
        await vscode.window.showTextDocument(original, { viewColumn: editor.viewColumn });
        vscode.window.setStatusBarMessage(`Renamed ${result.oldName} in ${targets.size} files. Use Undo to revert.`, 6000);
      } catch (error) {
        outcome = "error";
        void vscode.window.showWarningMessage(error instanceof Error ? error.message : String(error));
      } finally {
        review = undefined;
        active = false;
        finish(outcome);
      }
    }),
  );
}
