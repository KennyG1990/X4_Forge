/** Tests the real registered provider and mutation order with a controlled IDE adapter. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import * as vm from "node:vm";
import ts from "typescript";
import type * as vscode from "vscode";
import { validationSubjectSourceHash } from "../../shared/projectValidationInput";
import { classifyPath } from "../../shared/projectFileKind";
import type { PropertyCorrectionAccess, PropertyCorrectionValidation } from "./propertyCorrectionHost";

const target = path.join(__dirname, "propertyCorrectionHost.ts");
const controller = ts.transpileModule(fs.readFileSync(target, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const localRequire = createRequire(target);
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const modId = "forge_property_qa";
const name = "md/Test.xml";
const source = '<mdscript name="Test"><cues><cue name="Start"><actions><debug_text text="player.ship.hulll + player.ship.hulll"/></actions></cue></cues></mdscript>';
const manifest = `<content id="${modId}" name="Property QA" version="1"/>`;
const first = source.indexOf("hulll");
const second = source.indexOf("hulll", first + 1);
const authority = {
  targetGameVersion: "9.00", ruleId: "x4.scriptproperty.unknown", ruleVersion: "1.0.0",
  ruleHash: hash("reviewed rule"), vocabularyHash: hash("ordered contributors"),
};
const workspaceId = `ws_${"a".repeat(24)}`;

class Position {
  readonly line = 0;
  constructor(readonly character: number) {}
  isEqual(other: Position) { return this.line === other.line && this.character === other.character; }
}
class Range {
  constructor(readonly start: Position, readonly end: Position) {}
}
class WorkspaceEdit {
  change?: { uri: unknown; range: Range; replacement: string };
  replace(uri: unknown, range: Range, replacement: string) {
    assert.equal(this.change, undefined);
    this.change = { uri, range, replacement };
  }
}
class CodeAction {
  constructor(readonly title: string) {}
}

function asHost<T>(value: unknown): T { return value as T; }

function reply(project: Parameters<PropertyCorrectionAccess["validate"]>[0], vocabularyHash: string = authority.vocabularyHash) {
  const sourceHash = validationSubjectSourceHash(project.files.map(file => ({ ...file, kind: classifyPath(file.path) })));
  const text = project.files.find(file => file.path === name)!.content;
  const findings = [...text.matchAll(/hulll/g)].map(({ index }) => ({
    code: "scriptproperty.unknown", filePath: name, chain: "player.ship.hulll", segment: "hulll",
    severity: "warning", line: 1, column: index + 1,
    correction: {
      start: index, end: index + 5, expectedText: "hulll", replacement: "hull",
      datatype: "ship", declarationOwner: "ship", sourceSha256: hash(text),
    },
  }));
  return asHost<PropertyCorrectionValidation>({
    sourceHash, modId, ok: false, evidence: { coverage: { complete: false } },
    correctionWorkspace: { id: workspaceId, head: hash("selected canvas").slice(0, 16), version: 1 },
    schema: { mdAvailable: true, aiscriptAvailable: false },
    scriptProperties: { available: true, correctionAuthority: { ...authority, vocabularyHash }, findings },
  });
}

async function run() {
  const parent = fs.realpathSync.native(os.tmpdir());
  const scratch = fs.mkdtempSync(path.join(parent, "forge-property-editor-"));
  const root = path.join(scratch, modId);
  const targetFile = path.join(root, name);
  const manifestFile = path.join(root, "content.xml");
  const checkPath = path.join(root, "forge.rules.json");
  try {
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(targetFile, source);
    fs.writeFileSync(manifestFile, manifest);
    fs.writeFileSync(checkPath, '{"version":1,"rules":[]}');
    let text = source;
    const uri = { fsPath: targetFile, scheme: "file", toString: () => targetFile };
    const document = {
      uri, version: 1, isClosed: false, isDirty: false, positionAt: (offset: number) => new Position(offset),
      getText: () => text,
    };
    const writeBuffer = (content: string) => {
      text = content;
      document.isDirty = true;
      document.version++;
    };
    const store = new Map<string, unknown>();
    const warnings: string[] = [];
    const status: string[] = [];
    const checks: string[] = [];
    let changeAuthorityDuringReview = false;
    let changedAuthority = false;
    let changeSiblingDuringReview = false;
    let changeWorkspaceDuringReview = false;
    let changedWorkspace = false;
    let failTerminalReceipt = false;
    let terminalFailures = 0;
    let selection = "Apply Quick Fix";
    let applyCount = 0;
    let requestCount = 0;
    const disposable = { dispose() {} };
    let provider: vscode.CodeActionProvider | undefined;
    let invoke: (...args: unknown[]) => Promise<void>;
    const fake = {
      Range, WorkspaceEdit, CodeAction, CodeActionKind: { QuickFix: "quickfix" },
      languages: {
        registerCodeActionsProvider: (_selector: unknown, registered: vscode.CodeActionProvider) => {
          provider = registered;
          return disposable;
        },
      },
      commands: {
        registerCommand: (_command: string, registered: typeof invoke) => {
          invoke = registered;
          return disposable;
        },
      },
      window: {
        activeTextEditor: { document },
        showInformationMessage: async (title: string, options: { modal: boolean; detail: string }) => {
          assert.match(title, /Change hulll to hull/);
          assert(options.modal);
          assert.match(options.detail, /x4\.scriptproperty\.unknown@1\.0\.0/);
          if (changeAuthorityDuringReview) changedAuthority = true;
          if (changeSiblingDuringReview) fs.writeFileSync(manifestFile, manifest + "\n");
          if (changeWorkspaceDuringReview) changedWorkspace = true;
          return selection;
        },
        showWarningMessage: (message: string) => warnings.push(message),
        setStatusBarMessage: (message: string) => status.push(message),
      },
      workspace: {
        isTrusted: true, textDocuments: [document],
        applyEdit: async (edit: WorkspaceEdit) => {
          assert(edit.change);
          assert.equal(edit.change.uri, uri);
          const saved = JSON.stringify([...store.values()]);
          assert.match(saved, /prepared/);
          const { start, end } = edit.change.range;
          writeBuffer(text.slice(0, start.character) + edit.change.replacement + text.slice(end.character));
          applyCount++;
          return true;
        },
      },
    };
    const exports = {};
    vm.runInThisContext(`(function(require, exports) {${controller}\n})`)(
      (specifier: string) => specifier === "vscode" ? fake : localRequire(specifier), exports,
    );
    const { registerPropertyCorrection } = asHost<typeof import("./propertyCorrectionHost")>(exports);
    const context = asHost<vscode.ExtensionContext>({
      globalState: {
        get: (k: string) => store.get(k),
        update: async (k: string, value: unknown) => {
          const entries = value as { receipt: { status: string } }[];
          if (failTerminalReceipt && entries.at(-1)?.receipt.status === "committed") {
            failTerminalReceipt = false;
            terminalFailures++;
            throw new Error("Controlled terminal journal failure");
          }
          store.set(k, value);
        },
      },
      subscriptions: [],
    });
    const access: PropertyCorrectionAccess = {
      workspaceId, isCurrent: () => true,
      validate: async project => {
        requestCount++;
        assert(project.files.some(file => file.path === "forge.rules.json"));
        const result = reply(project, changedAuthority ? hash("replacement vocabulary") : authority.vocabularyHash);
        if (changedWorkspace) result.correctionWorkspace!.version++;
        return result;
      },
    };
    const registered = registerPropertyCorrection(context, 2000, () => root, () => () => undefined);
    const docs = asHost<vscode.TextDocument>(document);
    const fixture = { id: modId, name: modId, files: [{ path: name, content: source }, { path: "content.xml", content: manifest }] };
    const ranges = registered.remember(root, docs, name, source, reply(fixture), access, () => true);
    assert.equal(ranges.size, 2);
    assert(provider);
    const actions = async (offset: number, owner = "x4forge") => {
      const range = ranges.get(`0:${offset}`)!;
      return asHost<vscode.CodeAction[]>(await provider!.provideCodeActions(
        docs, range, asHost<vscode.CodeActionContext>({ diagnostics: [{ source: owner, range, code: "scriptproperty.unknown" }] }),
        asHost<vscode.CancellationToken>({ isCancellationRequested: false }),
      ));
    };
    assert.equal((await actions(first, "other")).length, 0);
    const [stale] = await actions(second);
    registered.remember(root, docs, name, source, reply(fixture), access, () => true);
    await invoke!(...stale.command!.arguments!);
    assert.equal(requestCount, 0);
    const unrelated = reply(fixture);
    unrelated.correctionWorkspace!.id = `ws_${"b".repeat(24)}`;
    registered.remember(root, docs, name, source, unrelated, access, () => true);
    assert.equal((await actions(second)).length, 0);
    registered.remember(root, docs, name, source, reply(fixture), access, () => true);
    checks.push("withholds stale actions and another workspace's authority");
    const [action] = await actions(second);
    assert(action.command?.arguments);
    assert.equal(action.command.arguments[2], second);
    checks.push("ties the Quick Fix to the exact second spelling");
    selection = "Cancel";
    await invoke!(...action.command.arguments);
    assert.equal(applyCount, 0);
    assert.equal(store.size, 0);
    checks.push("cancelled preview neither edits nor allocates a prepared receipt");
    selection = "Apply Quick Fix";
    changeAuthorityDuringReview = true;
    await invoke!(...action.command.arguments);
    assert.equal(applyCount, 0);
    assert.match(warnings.at(-1)!, /rule evidence/);
    changeAuthorityDuringReview = changedAuthority = false;
    checks.push("rechecks fresh vocabulary after preview and before applying");
    changeSiblingDuringReview = true;
    await invoke!(...action.command.arguments);
    assert.equal(applyCount, 0);
    assert.match(warnings.at(-1)!, /changed/);
    fs.writeFileSync(manifestFile, manifest);
    changeSiblingDuringReview = false;
    checks.push("refuses changed sibling bytes");
    changeWorkspaceDuringReview = true;
    await invoke!(...action.command.arguments);
    assert.equal(applyCount, 0);
    assert.match(warnings.at(-1)!, /rule evidence/);
    changeWorkspaceDuringReview = changedWorkspace = false;
    checks.push("refuses a workspace revision change during review");
    await invoke!(...action.command.arguments);
    assert.equal(applyCount, 1);
    assert.equal(text, source.slice(0, second) + "hull" + source.slice(second + 5));
    assert.equal(fs.readFileSync(targetFile, "utf8"), source);
    assert.match(status.at(-1)!, /reports blocking errors/);
    const serialized = JSON.stringify([...store.values()]);
    assert.match(serialized, /committed/);
    assert.match(serialized, new RegExp(hash(text)));
    assert.equal((await actions(first)).length, 0);
    assert.equal(requestCount, 10);
    checks.push("applies one buffer edit with a prepared receipt and honest post-edit project facts");
    const next = { ...fixture, files: [{ path: name, content: text }, { path: "content.xml", content: manifest }] };
    registered.remember(root, docs, name, text, reply(next), access, () => true);
    const [last] = await actions(first);
    assert(last.command?.arguments);
    failTerminalReceipt = true;
    await invoke!(...last.command.arguments);
    assert.equal(terminalFailures, 1);
    assert.equal(applyCount, 2);
    assert.match(warnings.at(-1)!, /Forge verified the edit/);
    assert.doesNotMatch(text, /hulll/);
    assert.doesNotMatch(JSON.stringify([...store.values()]), /EDIT_EFFECT_UNVERIFIED/);
    assert.equal(requestCount, 13);
    checks.push("retries exact verified receipt facts after terminal persistence failure");
    console.log(JSON.stringify({ pass: true, checks }));
  } finally {
    assert.equal(path.dirname(fs.realpathSync.native(scratch)), parent);
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

void run().catch(error => { console.error(error); process.exitCode = 1; });
