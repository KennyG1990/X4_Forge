import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { validationSubjectSourceHash } from "../../shared/projectValidationInput";
import { classifyPath } from "../../shared/projectFileKind";
import { createPropertyCorrectionJournal, type PropertyCorrectionReceiptOutcome } from "./propertyCorrectionReceipt";

const code = "scriptproperty.unknown";
const command = "x4forge.applyPropertyCorrection";
const maxSourceBytes = 4 * 1024 * 1024;
const maxEntries = 20_000;
const hashPattern = /^[a-f0-9]{64}$/;
const workspaceHeadPattern = /^[a-f0-9]{16}$/;
const word = /^[A-Za-z_][A-Za-z0-9_]*$/;
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const fileKey = (value: string) => process.platform === "win32" ? value.toLowerCase() : value;
const changed = () => new Error("The mod files, editor buffers or Forge workspace changed. Review the current Quick Fix again.");

interface Authority {
  targetGameVersion: string;
  ruleId: string;
  ruleVersion: string;
  ruleHash: string;
  vocabularyHash: string;
}
interface Correction {
  start: number;
  end: number;
  expectedText: string;
  replacement: string;
  datatype: string;
  declarationOwner: string;
  sourceSha256: string;
}
interface Properties {
  available: boolean;
  correctionAuthority?: Authority;
  findings: { code: string; filePath?: string; line: number; column?: number; correction?: Correction }[];
}
export interface PropertyCorrectionValidation {
  ok?: boolean;
  modId?: string | null;
  sourceHash?: string;
  evidence?: { coverage?: { complete?: boolean } };
  scriptProperties?: Properties;
  correctionWorkspace?: CorrectionWorkspace;
  schema?: { mdAvailable: boolean; aiscriptAvailable: boolean };
}
interface ValidationFile { path: string; content: string }
export interface PropertyCorrectionAccess {
  workspaceId: string;
  isCurrent(): boolean;
  validate(project: { id: string; name: string; files: ValidationFile[] }): Promise<PropertyCorrectionValidation>;
}
interface CorrectionWorkspace { id: string; head: string; version: number }
interface Candidate {
  relativePath: string;
  correction: Correction;
  authority: Authority;
  workspace: CorrectionWorkspace;
}
interface Offer {
  root: string;
  document: vscode.TextDocument;
  version: number;
  generation: number;
  access: PropertyCorrectionAccess;
  isCurrent(): boolean;
  candidates: Candidate[];
}
interface DiskFile { path: string; content: string; identity: string; bytes: number }
interface BufferFile { document: vscode.TextDocument; version: number; content: string }

function within(root: string, file: string): string | undefined {
  const relative = path.relative(root, file);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return undefined;
  return relative.split(path.sep).join("/");
}

function inspected(file: string): fs.BigIntStats {
  const info = fs.lstatSync(file, { bigint: true });
  if (info.isSymbolicLink() || fileKey(fs.realpathSync.native(file)) !== fileKey(file)) throw new Error("Property fixes require a physical mod folder and regular source files.");
  return info;
}

const stamp = (stat: fs.BigIntStats) => [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":");

function readDiskFile(file: string, relative: string, remaining: number): DiskFile {
  const original = inspected(file);
  if (!original.isFile() || original.nlink !== 1n || original.size > remaining) throw new Error("Forge cannot completely inspect the mod within the Quick Fix source limits.");
  const fd = fs.openSync(file, "r");
  try {
    const before = stamp(original);
    if (stamp(fs.fstatSync(fd, { bigint: true })) !== before) throw changed();
    const buffer = Buffer.alloc(Number(original.size) + 1);
    let length = 0;
    while (length < buffer.length) {
      const count = fs.readSync(fd, buffer, length, buffer.length - length, null);
      if (!count) break;
      length += count;
    }
    if (length !== Number(original.size) || stamp(inspected(file)) !== before) throw changed();
    const bytes = buffer.subarray(0, length);
    return {
      path: relative,
      content: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      identity: `${before}:${sha(bytes)}`,
      bytes: length,
    };
  } finally {
    fs.closeSync(fd);
  }
}

function isSource(relative: string): boolean {
  return /\.(xml|lua)$/i.test(relative) || /^forge\.(rules|checks)\.json$/i.test(relative);
}

function capture(root: string, fileLimit: number) {
  const disk = new Map<string, DiskFile>();
  const directories = new Map<string, string>();
  const open = new Map<string, BufferFile>();
  let remaining = maxSourceBytes;
  let entryCount = 0;
  const pending = [root];
  for (const directory of pending) {
    const original = inspected(directory);
    if (!original.isDirectory()) throw changed();
    directories.set(directory, stamp(original));
    const entries = fs.opendirSync(directory);
    try {
      for (let entry = entries.readSync(); entry; entry = entries.readSync()) {
        if (++entryCount > maxEntries) throw new Error("The mod inventory exceeds the Quick Fix scan limit.");
        const file = path.join(directory, entry.name);
        const relative = within(root, file)!;
        if (entry.name.startsWith(".") || entry.name.toLowerCase() === "node_modules") continue;
        if (relative.toLowerCase() === "extensions" || /\.(cat|dat)$/i.test(relative)) {
          throw new Error("Forge cannot review packed sources or dependency overlays for this Quick Fix.");
        }
        if (entry.isDirectory()) {
          pending.push(file);
          continue;
        }
        if (entry.isSymbolicLink()) throw new Error("Forge cannot completely inspect a mod containing linked sources.");
        if (!isSource(relative)) continue;
        const key = relative.toLowerCase();
        if (disk.has(key) || disk.size >= fileLimit) throw new Error("Forge cannot identify every source file uniquely within the Quick Fix limit.");
        const observed = readDiskFile(file, relative, remaining);
        remaining -= observed.bytes;
        disk.set(key, observed);
      }
    } finally {
      entries.closeSync();
    }
  }
  for (const [directory, identity] of directories) {
    if (stamp(inspected(directory)) !== identity) throw changed();
  }
  if (!disk.has("content.xml")) throw new Error("Open an unpacked mod with a physical content.xml.");
  remaining = maxSourceBytes;
  for (const document of vscode.workspace.textDocuments) {
    if (document.isClosed || document.uri.scheme !== "file") continue;
    const relative = within(root, document.uri.fsPath);
    if (!relative || !isSource(relative)) continue;
    const key = relative.toLowerCase();
    const file = disk.get(key);
    if (!file || fileKey(relative) !== fileKey(file.path) || open.has(key)) throw changed();
    const content = document.getText();
    remaining -= Buffer.byteLength(content);
    if (remaining < 0 || (!document.isDirty && content !== file.content)) throw changed();
    open.set(key, { document, version: document.version, content });
  }
  const files = [...disk.entries()].map(([key, file]) => ({ path: file.path, content: open.get(key)?.content ?? file.content }));
  if (files.reduce((bytes, file) => bytes + Buffer.byteLength(file.content), 0) > maxSourceBytes) {
    throw new Error("The mod's combined editor source exceeds the Quick Fix limit.");
  }
  const id = path.basename(root);
  return { disk, directories, open, project: { id, name: id, files } };
}

function verifyCapture(
  root: string, fileLimit: number, baseline: ReturnType<typeof capture>,
  edited?: { key: string; content: string; version: number },
): ReturnType<typeof capture> {
  const current = capture(root, fileLimit);
  if (current.disk.size !== baseline.disk.size || current.open.size !== baseline.open.size
    || current.directories.size !== baseline.directories.size
    || [...current.directories].some(([file, identity]) => baseline.directories.get(file) !== identity)
    || [...current.disk].some(([key, file]) => baseline.disk.get(key)?.identity !== file.identity)
    || [...current.open].some(([key, file]) => {
      const before = baseline.open.get(key);
      return before?.document !== file.document || (edited?.key === key
        ? file.content !== edited.content || file.version !== edited.version
        : before.version !== file.version || before.content !== file.content);
    })) throw changed();
  return current;
}

function canonicalAuthority(authority: Authority | undefined): string | undefined {
  if (authority?.targetGameVersion !== "9.00" || authority.ruleId !== "x4.scriptproperty.unknown"
    || typeof authority.ruleVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(authority.ruleVersion)
    || !hashPattern.test(authority.ruleHash) || !hashPattern.test(authority.vocabularyHash)) return undefined;
  return JSON.stringify([authority.targetGameVersion, authority.ruleId, authority.ruleVersion, authority.ruleHash, authority.vocabularyHash]);
}

function canonicalCorrection(correction: Correction): string {
  return JSON.stringify([correction.start, correction.end, correction.expectedText, correction.replacement,
    correction.datatype, correction.declarationOwner, correction.sourceSha256]);
}

function validRange(correction: Correction, source: string): boolean {
  return Number.isSafeInteger(correction.start) && correction.start >= 0
    && Number.isSafeInteger(correction.end) && correction.end > correction.start && correction.end <= source.length
    && word.test(correction.expectedText) && word.test(correction.replacement)
    && correction.expectedText !== correction.replacement
    && source.slice(correction.start, correction.end) === correction.expectedText;
}

async function validated(
  access: PropertyCorrectionAccess, project: ReturnType<typeof capture>["project"], candidate: Candidate,
) {
  const expectedHash = validationSubjectSourceHash(project.files.map(file => ({ ...file, kind: classifyPath(file.path) })));
  const actual = await access.validate(project);
  const domainAvailable = classifyPath(candidate.relativePath) === "md"
    ? actual.schema?.mdAvailable : actual.schema?.aiscriptAvailable;
  if (!access.isCurrent() || !actual.modId || actual.sourceHash !== expectedHash
    || typeof actual.ok !== "boolean" || typeof actual.evidence?.coverage?.complete !== "boolean"
    || actual.scriptProperties?.available !== true || !Array.isArray(actual.scriptProperties.findings)
    || canonicalAuthority(actual.scriptProperties.correctionAuthority) !== canonicalAuthority(candidate.authority)
    || actual.correctionWorkspace?.id !== candidate.workspace.id || actual.correctionWorkspace.head !== candidate.workspace.head
    || actual.correctionWorkspace.version !== candidate.workspace.version
    || domainAvailable !== true) {
    throw new Error("Forge could not re-establish the authored source and rule evidence for this Quick Fix.");
  }
  return { complete: actual.evidence.coverage.complete, ok: actual.ok, sourceHash: actual.sourceHash, findings: actual.scriptProperties.findings };
}

export function registerPropertyCorrection(
  context: vscode.ExtensionContext, fileLimit: number, modRootFor: (file: string) => string | null,
  begin: () => (outcome: "ok" | "cancelled" | "error") => void,
) {
  const offers = new WeakMap<vscode.TextDocument, Offer>();
  const journal = createPropertyCorrectionJournal(context.globalState);
  let generation = 0;
  let active = false;

  const currentOffer = (offer: Offer) => vscode.workspace.isTrusted && !offer.document.isClosed
    && offer.document.version === offer.version && modRootFor(offer.document.uri.fsPath) === offer.root
    && offer.access.isCurrent() && offer.isCurrent();
  const selector = { scheme: "file", language: "xml" };
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(selector, {
      provideCodeActions(document, _range, actionContext, token) {
        const offer = offers.get(document);
        if (!offer || token.isCancellationRequested || !currentOffer(offer)) return [];
        return offer.candidates.flatMap(candidate => {
          const start = document.positionAt(candidate.correction.start);
          const end = document.positionAt(candidate.correction.end);
          const diagnostic = actionContext.diagnostics.find(item => item.source === "x4forge" && item.code === code
            && item.range.start.isEqual(start) && item.range.end.isEqual(end));
          if (!diagnostic) return [];
          const title = `Change ${candidate.correction.expectedText} to ${candidate.correction.replacement}`;
          const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
          action.diagnostics = [diagnostic];
          action.command = { command, title, arguments: [document.uri.toString(), offer.generation, candidate.correction.start] };
          return [action];
        });
      },
    }, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
    vscode.commands.registerCommand(command, async (uri: string, offerGeneration: number, startOffset: number) => {
      const document = vscode.window.activeTextEditor?.document;
      const offer = document && offers.get(document);
      if (active || !offer || offer.document.uri.toString() !== uri || offer.generation !== offerGeneration) return;
      const matches = offer.candidates.filter(candidate => candidate.correction.start === startOffset);
      if (matches.length !== 1) return;
      const [candidate] = matches;
      active = true;
      const finish = begin();
      let outcome: "ok" | "cancelled" | "error" = "cancelled";
      let settle: Awaited<ReturnType<typeof journal.prepare>>["finish"] | undefined;
      let editRequested = false;
      let observedHash: string | undefined;
      let verifiedReceipt: Extract<PropertyCorrectionReceiptOutcome, { kind: "applied" }> | undefined;
      try {
        const { access, document, root } = offer;
        const { authority, correction, relativePath } = candidate;
        const checkEditor = () => {
          if (!currentOffer(offer) || vscode.window.activeTextEditor?.document !== document) throw changed();
        };
        checkEditor();
        const baseline = capture(root, fileLimit);
        const key = relativePath.toLowerCase();
        const input = baseline.open.get(key);
        if (input?.document !== document || baseline.disk.get(key)?.path !== relativePath
          || sha(input.content) !== correction.sourceSha256 || !validRange(correction, input.content)) throw changed();
        const confirmSource = async () => {
          const result = await validated(access, baseline.project, candidate);
          if (result.findings.filter(finding => finding.filePath === relativePath && finding.code === code
            && finding.correction && canonicalCorrection(finding.correction) === canonicalCorrection(correction)).length !== 1) throw changed();
          checkEditor();
          verifyCapture(root, fileLimit, baseline);
        };
        await confirmSource();
        const start = document.positionAt(correction.start);
        const end = document.positionAt(correction.end);
        const approved = await vscode.window.showInformationMessage(
          `Change ${correction.expectedText} to ${correction.replacement}?`,
          { modal: true, detail: `${relativePath} · line ${start.line + 1}, columns ${start.character + 1}–${end.character}\n${authority.ruleId}@${authority.ruleVersion} · X4 ${authority.targetGameVersion} ScriptProperties\nTyped as ${correction.datatype}, declared by ${correction.declarationOwner}. Applies one edit to the editor buffer. Use Undo to revert.` },
          "Apply Quick Fix",
        );
        if (approved !== "Apply Quick Fix") return;
        checkEditor();
        const receipt = await journal.prepare({
          workspaceId: access.workspaceId, relativePath, beforeHash: correction.sourceSha256,
          correctionHash: sha(canonicalCorrection(correction)), vocabularyHash: authority.vocabularyHash, ruleHash: authority.ruleHash,
        });
        settle = receipt.finish;
        await confirmSource();
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, new vscode.Range(start, end), correction.replacement,
          { label: "Reviewed X4 property correction", needsConfirmation: false });
        const expectedText = input.content.slice(0, correction.start) + correction.replacement + input.content.slice(correction.end);
        editRequested = true;
        if (!await vscode.workspace.applyEdit(edit)) {
          editRequested = false;
          throw changed();
        }
        if (!document.isClosed) observedHash = sha(document.getText());
        if (!access.isCurrent() || observedHash !== sha(expectedText) || document.version <= input.version) throw changed();
        const edited = { key, content: expectedText, version: document.version };
        const after = verifyCapture(root, fileLimit, baseline, edited);
        const verified = await validated(access, after.project, candidate);
        if (!access.isCurrent() || verified.findings.some(finding => finding.filePath === relativePath && finding.code === code
          && finding.line === start.line + 1 && finding.column === start.character + 1)) throw changed();
        verifyCapture(root, fileLimit, baseline, edited);
        verifiedReceipt = { kind: "applied", afterHash: observedHash, project: {
          ok: verified.ok, complete: verified.complete, sourceHash: verified.sourceHash,
        } };
        await settle(verifiedReceipt);
        outcome = "ok";
        const validation = verified.ok
          ? verified.complete ? "Project check found no blocking errors." : "Project check has coverage gaps."
          : "Project check reports blocking errors.";
        vscode.window.setStatusBarMessage(`Corrected ${correction.expectedText} to ${correction.replacement}. ${validation} Use Undo to revert.`, 6000);
      } catch (error) {
        outcome = "error";
        let message = error instanceof Error ? error.message : String(error);
        if (settle) {
          try {
            await settle(verifiedReceipt ?? (editRequested
              ? { kind: "uncertain", code: "EDIT_EFFECT_UNVERIFIED", afterHash: observedHash }
              : { kind: "refused", code: "REVIEW_INPUT_CHANGED" }));
          } catch (journalError) {
            message += ` Receipt could not be updated. ${journalError instanceof Error ? journalError.message : String(journalError)}`;
          }
        }
        if (verifiedReceipt) message = `Forge verified the edit. The first receipt write failed. ${message}`;
        if (editRequested) message += " Inspect the edited buffer and use Undo if needed.";
        void vscode.window.showWarningMessage(message);
      } finally {
        active = false;
        finish(outcome);
      }
    }),
  );

  return {
    remember(
      root: string, document: vscode.TextDocument, relativePath: string, source: string,
      result: PropertyCorrectionValidation, access: PropertyCorrectionAccess | undefined, isCurrent: () => boolean,
    ): ReadonlyMap<string, vscode.Range> {
      offers.delete(document);
      const ranges = new Map<string, vscode.Range>();
      const { scriptProperties: properties, correctionWorkspace: workspace } = result;
      const authority = properties?.correctionAuthority;
      if (!authority || !canonicalAuthority(authority) || !access || !workspace || workspace.id !== access.workspaceId
        || !workspaceHeadPattern.test(workspace.head) || !Number.isSafeInteger(workspace.version) || document.getText() !== source
        || !/^(md|aiscripts)\/.+\.xml$/i.test(relativePath)) return ranges;
      const sourceHash = sha(source);
      const candidates = (properties?.findings ?? []).flatMap(finding => {
        const correction = finding.correction;
        if (finding.filePath !== relativePath || finding.code !== code || !correction
          || correction.sourceSha256 !== sourceHash || !validRange(correction, source)) return [];
        const start = document.positionAt(correction.start);
        const end = document.positionAt(correction.end);
        if (finding.line !== start.line + 1 || finding.column !== start.character + 1 || start.line !== end.line) return [];
        ranges.set(`${start.line}:${start.character}`, new vscode.Range(start, end));
        return [{ correction, relativePath, authority, workspace }];
      });
      if (candidates.length) offers.set(document, { root, document, version: document.version, generation: ++generation, access, isCurrent, candidates });
      return ranges;
    },
  };
}
