import * as path from 'node:path';
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { readWorkspaceScriptSymbols, searchWorkspaceScriptSymbols, type WorkspaceScriptSymbol } from '../../shared/workspaceScriptSymbols';
import { physicalStamp, readDiskInput, sameStamp } from './aiScriptDefinitionHost';
import { registerWorkspaceReferenceSymbols, type WorkspaceReferenceBackend } from './workspaceReferenceSymbolsHost';

const MAX_SCRIPT_BYTES = 8 * 1024 * 1024;
const MAX_WORKSPACE_BYTES = 32 * 1024 * 1024;
const MAX_SYMBOL_RESULTS = 512;
const SCRIPT_FILE = /\.xml$/i;
const WATCH_PATH = /(?:^|[\\/])(?:(?:md|aiscripts)[\\/][^\\/]+\.xml|content\.xml)$/i;
const keyFor = (file: string) => process.platform === 'win32' ? file.toLowerCase() : file;
const utf8 = new TextDecoder('utf-8', { fatal: true });

type EditorInput = { document: vscode.TextDocument; version: number };
type ScriptInput = { stamp: fs.BigIntStats; editor?: EditorInput; origin: string; symbols: WorkspaceScriptSymbol[] };

const symbolKinds = {
  script: vscode.SymbolKind.Module,
  cue: vscode.SymbolKind.Event,
  library: vscode.SymbolKind.Function,
  'interrupt-handler': vscode.SymbolKind.Event,
};

function sameEditor(before: EditorInput | undefined, after: EditorInput | undefined): boolean {
  return before?.document === after?.document && before?.version === after?.version;
}

function editorInputs(): Map<string, EditorInput> {
  return new Map(vscode.workspace.textDocuments
    .filter(document => document.uri.scheme === 'file' && !document.isClosed)
    .map(document => [keyFor(document.uri.fsPath), { document, version: document.version }]));
}

/** Reuse parsed symbols across queries and refresh only changed physical script inputs. */
export function registerWorkspaceScriptSymbols(
  context: vscode.ExtensionContext,
  modRootFor: (folder: string) => string | null,
  fileLimit: number,
  begin: () => (status: 'ok' | 'cancelled' | 'error') => void,
  referenceBackend: () => WorkspaceReferenceBackend | undefined = () => undefined,
  reportReferenceStatus: (message: string) => void = () => {},
) {
  const references = registerWorkspaceReferenceSymbols(context, referenceBackend, reportReferenceStatus);
  let generation = 0;
  let saved = new Map<string, ScriptInput>();
  let current: Promise<{ files: Map<string, ScriptInput>; symbols: WorkspaceScriptSymbol[] }> | undefined;
  const invalidate = () => { generation++; current = undefined; };
  const scriptChanged = (uri: vscode.Uri) => { if (uri.scheme === 'file' && WATCH_PATH.test(uri.fsPath)) invalidate(); };
  const watcher = vscode.workspace.createFileSystemWatcher('**/{md/*.xml,aiscripts/*.xml,content.xml}');
  context.subscriptions.push(
    watcher, watcher.onDidCreate(scriptChanged), watcher.onDidChange(scriptChanged), watcher.onDidDelete(scriptChanged),
    vscode.workspace.onDidOpenTextDocument(document => scriptChanged(document.uri)),
    vscode.workspace.onDidChangeTextDocument(event => scriptChanged(event.document.uri)),
    vscode.workspace.onDidCloseTextDocument(document => scriptChanged(document.uri)),
    vscode.workspace.onDidSaveTextDocument(document => scriptChanged(document.uri)),
    vscode.workspace.onDidChangeWorkspaceFolders(invalidate),
  );

  async function collect(revision: number) {
    const files = new Map<string, ScriptInput>();
    const open = editorInputs();
    let remaining = MAX_WORKSPACE_BYTES;
    let observedFiles = 0;
    const folders = vscode.workspace.workspaceFolders ?? [];
    for (const folder of folders) {
      if (folder.uri.scheme !== 'file') continue;
      const root = path.resolve(folder.uri.fsPath);
      if (keyFor(modRootFor(root) ?? '') !== keyFor(root)) continue;
      const rootStamp = await physicalStamp(root);
      if (!rootStamp.isDirectory()) continue;
      for (const dialect of ['md', 'aiscripts'] as const) {
        const directory = path.join(root, dialect);
        const dirStamp = await physicalStamp(directory).catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return undefined;
          throw error;
        });
        if (!dirStamp?.isDirectory()) continue;
        for await (const entry of await fs.promises.opendir(directory)) {
          if (generation !== revision) throw new Error('Workspace symbol inputs changed.');
          if (!entry.isFile() || !SCRIPT_FILE.test(entry.name)) continue;
          const file = path.join(directory, entry.name), key = keyFor(file);
          if (files.has(key) || ++observedFiles > fileLimit) throw new Error('Workspace symbol inventory exceeded its bounds.');
          const stamp = await physicalStamp(file);
          if (!stamp.isFile() || stamp.nlink !== 1n) continue;
          const editor = open.get(key);
          const openText = editor?.document.getText();
          const size = openText === undefined ? Number(stamp.size) : Buffer.byteLength(openText);
          if (size > MAX_SCRIPT_BYTES || size > remaining) throw new Error('Workspace symbol source exceeded its bounds.');
          remaining -= size;
          const prior = saved.get(key);
          if (prior && prior.origin === folder.name && sameStamp(prior.stamp, stamp) && sameEditor(prior.editor, editor)) {
            files.set(key, prior);
            continue;
          }
          let text = openText;
          if (text === undefined) {
            const bytes = await readDiskInput({ file, stamp });
            try { text = utf8.decode(bytes); } catch { continue; }
          }
          const symbols = readWorkspaceScriptSymbols(`${dialect}/${entry.name}`, text, folder.name)
            .map(symbol => ({ ...symbol, file }));
          files.set(key, { stamp, editor, origin: folder.name, symbols });
        }
        if (!sameStamp(dirStamp, await physicalStamp(directory))) throw new Error('Workspace symbol directory changed.');
      }
      if (!sameStamp(rootStamp, await physicalStamp(root))) throw new Error('Workspace symbol folder changed.');
    }
    if (generation !== revision) throw new Error('Workspace symbol inputs changed.');
    saved = files;
    return { files, symbols: [...files.values()].flatMap(file => file.symbols) };
  }

  context.subscriptions.push(vscode.languages.registerWorkspaceSymbolProvider({
    async provideWorkspaceSymbols(query, token) {
      const finish = begin();
      let status: 'ok' | 'cancelled' | 'error' = 'ok';
      const revision = generation;
      try {
        if (token.isCancellationRequested) { status = 'cancelled'; return []; }
        const pending = current ??= collect(revision);
        const inventory = await pending;
        if (token.isCancellationRequested || revision !== generation) { status = 'cancelled'; return []; }
        let cancelSubscription: vscode.Disposable | undefined;
        const cancelled = new Promise<undefined>(resolve => {
          cancelSubscription = token.onCancellationRequested?.(() => resolve(undefined));
        });
        const referenceSnapshots = await Promise.race([references.read(), cancelled]).finally(() => cancelSubscription?.dispose());
        if (!referenceSnapshots || token.isCancellationRequested || revision !== generation) { status = 'cancelled'; return []; }
        const matches = searchWorkspaceScriptSymbols([...inventory.symbols, ...referenceSnapshots.flatMap(source => source.symbols)], query)
          .slice(0, MAX_SYMBOL_RESULTS);
        const locations = new Map<string, vscode.Uri>();
        const open = editorInputs();
        for (const file of new Set(matches.map(symbol => symbol.file))) {
          if (token.isCancellationRequested || revision !== generation) { status = 'cancelled'; return []; }
          const reference = referenceSnapshots.find(snapshot => snapshot.locations.has(file));
          if (reference) {
            const uri = await references.check(reference, file);
            if (uri) locations.set(file, uri);
            continue;
          }
          const key = keyFor(file);
          const source = inventory.files.get(key);
          if (!source || !sameEditor(source.editor, open.get(key)) || !sameStamp(source.stamp, await physicalStamp(file))) {
            invalidate();
            return [];
          }
          locations.set(file, vscode.Uri.file(file));
        }
        if (token.isCancellationRequested || revision !== generation) { status = 'cancelled'; return []; }
        const qualified = query.includes('.');
        return matches.flatMap(symbol => {
          const uri = locations.get(symbol.file);
          return uri ? [new vscode.SymbolInformation(
            qualified ? symbol.qualifiedName : symbol.name, symbolKinds[symbol.kind], symbol.container,
            new vscode.Location(uri, new vscode.Range(symbol.start.line, symbol.start.column, symbol.end.line, symbol.end.column)),
          )] : [];
        });
      } catch {
        if (revision === generation) {
          status = 'error';
          invalidate();
        } else status = 'cancelled';
        return [];
      } finally { finish(status); }
    },
  }));
}
