import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  X4_SEMANTIC_TOKEN_TYPES,
  computeXmlFoldingRanges,
  computeX4DocumentSymbols,
  computeX4SemanticTokens,
  computeX4InlayHints,
  computeX4CodeLenses,
  computeFormatSignatureHelp,
  resolveLuaReadTextAtCursor,
  findTFileEntryLocation,
  completeLuaReadText,
  planX4SymbolRename,
  computeXmlQuickFixes,
  type IdeDocumentSymbol,
} from './x4IdeFeatures';

const SYMBOL_KIND_MAP: Record<IdeDocumentSymbol['kind'], vscode.SymbolKind> = {
  Module: vscode.SymbolKind.Module,
  Class: vscode.SymbolKind.Class,
  Function: vscode.SymbolKind.Function,
  Method: vscode.SymbolKind.Method,
  Property: vscode.SymbolKind.Property,
  Variable: vscode.SymbolKind.Variable,
  Constant: vscode.SymbolKind.Constant,
  Event: vscode.SymbolKind.Event,
  Key: vscode.SymbolKind.Key,
};

function toVsRange(r: { start: { line: number; character: number }; end: { line: number; character: number } }): vscode.Range {
  return new vscode.Range(
    new vscode.Position(r.start.line, r.start.character),
    new vscode.Position(r.end.line, r.end.character),
  );
}

function toVsDocSymbol(sym: IdeDocumentSymbol): vscode.DocumentSymbol {
  const out = new vscode.DocumentSymbol(
    sym.name,
    sym.detail || '',
    SYMBOL_KIND_MAP[sym.kind] ?? vscode.SymbolKind.Field,
    toVsRange(sym.range),
    toVsRange(sym.selectionRange),
  );
  out.children = sym.children.map(toVsDocSymbol);
  return out;
}

function readModTFiles(modRoot: string): {
  files: Array<{ file: string; text: string }>;
  pages: Map<string, Map<string, string>>;
} {
  const files: Array<{ file: string; text: string }> = [];
  const pages = new Map<string, Map<string, string>>();
  const tDir = path.join(modRoot, 't');
  try {
    if (!fs.existsSync(tDir)) return { files, pages };
    for (const entry of fs.readdirSync(tDir, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.xml$/i.test(entry.name)) continue;
      const full = path.join(tDir, entry.name);
      const text = fs.readFileSync(full, 'utf8');
      files.push({ file: full, text });
      const pageRe = /<page\b([^>]*?)>([\s\S]*?)<\/page>/gi;
      let pm: RegExpExecArray | null;
      while ((pm = pageRe.exec(text)) !== null) {
        const pid = /\bid\s*=\s*["'](\d+)["']/i.exec(pm[1])?.[1];
        if (!pid) continue;
        let pMap = pages.get(pid);
        if (!pMap) { pMap = new Map(); pages.set(pid, pMap); }
        const tRe = /<t\b([^>]*?)>([\s\S]*?)<\/t>/gi;
        let tm: RegExpExecArray | null;
        while ((tm = tRe.exec(pm[2])) !== null) {
          const tid = /\bid\s*=\s*["'](\d+)["']/i.exec(tm[1])?.[1];
          if (tid && !pMap.has(tid)) pMap.set(tid, tm[2].replace(/<[^>]+>/g, '').trim());
        }
      }
    }
  } catch { /* ignore unreadable t directory */ }
  return { files, pages };
}

function readSiblingMdFiles(modRoot: string, openDocs: readonly vscode.TextDocument[]): Array<{ file: string; text: string }> {
  const out: Array<{ file: string; text: string }> = [];
  const mdDir = path.join(modRoot, 'md');
  const openMap = new Map<string, string>();
  for (const d of openDocs) {
    if (!d.isClosed && d.uri.scheme === 'file') openMap.set(d.uri.fsPath.toLowerCase(), d.getText());
  }
  try {
    if (!fs.existsSync(mdDir)) return out;
    for (const entry of fs.readdirSync(mdDir, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.xml$/i.test(entry.name)) continue;
      const full = path.join(mdDir, entry.name);
      const text = openMap.get(full.toLowerCase()) ?? fs.readFileSync(full, 'utf8');
      out.push({ file: full, text });
    }
  } catch { /* ignore unreadable md directory */ }
  return out;
}

export function registerX4IdeFeaturesHost(
  context: vscode.ExtensionContext,
  modRootFor: (fsPath: string) => string | null,
): void {
  const xmlSelector: vscode.DocumentSelector = [
    { scheme: 'file', pattern: '**/*.xml' },
    { scheme: 'x4forge-node', language: 'xml' },
  ];
  const luaSelector: vscode.DocumentSelector = [
    { scheme: 'file', language: 'lua' },
    { scheme: 'file', pattern: '**/*.{lua,xpl}' },
  ];

  const semanticLegend = new vscode.SemanticTokensLegend([...X4_SEMANTIC_TOKEN_TYPES], []);

  context.subscriptions.push(
    // 1. Folding Range Provider
    vscode.languages.registerFoldingRangeProvider(xmlSelector, {
      provideFoldingRanges(doc) {
        return computeXmlFoldingRanges(doc.getText()).map(r => new vscode.FoldingRange(
          r.startLine,
          r.endLine,
          r.kind === 'comment'
            ? vscode.FoldingRangeKind.Comment
            : r.kind === 'region'
              ? vscode.FoldingRangeKind.Region
              : undefined,
        ));
      },
    }),

    // 2. Document Symbol Provider (Outline / Breadcrumbs / Ctrl+Shift+O)
    vscode.languages.registerDocumentSymbolProvider(xmlSelector, {
      provideDocumentSymbols(doc) {
        return computeX4DocumentSymbols(doc.uri.fsPath, doc.getText()).map(toVsDocSymbol);
      },
    }),

    // 3. Semantic Tokens Provider (X4 Expressions & XPath)
    vscode.languages.registerDocumentSemanticTokensProvider(xmlSelector, {
      provideDocumentSemanticTokens(doc) {
        const { data } = computeX4SemanticTokens(doc.uri.fsPath, doc.getText());
        return new vscode.SemanticTokens(new Uint32Array(data));
      },
    }, semanticLegend),

    // 4. Inlay Hints Provider ({page, id} localized strings + inferred variable types)
    vscode.languages.registerInlayHintsProvider(xmlSelector, {
      provideInlayHints(doc, range) {
        const root = doc.uri.scheme === 'file' ? modRootFor(doc.uri.fsPath) : null;
        const tData = root ? readModTFiles(root) : { files: [], pages: new Map<string, Map<string, string>>() };
        const text = doc.getText();
        const varTypes: Record<string, string> = {};
        for (const m of text.matchAll(/<(?:find|create|get|select)_([A-Za-z_]\w*)\b([^>]*?)\/?>/gi)) {
          const nameM = /\bname\s*=\s*["'](\$[A-Za-z_]\w*)["']/i.exec(m[2]);
          const multM = /\bmultiple\s*=\s*["'](?:true|1)["']/i.exec(m[2]);
          if (nameM) varTypes[nameM[1].toLowerCase()] = multM ? 'list' : m[1].toLowerCase().replace(/s$/, '');
        }
        return computeX4InlayHints(doc.uri.fsPath, text, {
          resolveText: (p, id) => tData.pages.get(p)?.get(id) ?? null,
          variableTypes: varTypes,
        })
          .filter(h => h.position.line >= range.start.line && h.position.line <= range.end.line)
          .map(h => {
            const vh = new vscode.InlayHint(
              new vscode.Position(h.position.line, h.position.character),
              h.label,
              h.kind === 'Type' ? vscode.InlayHintKind.Type : vscode.InlayHintKind.Parameter,
            );
            if (h.paddingLeft) vh.paddingLeft = true;
            return vh;
          });
      },
    }),

    // 5. Reference CodeLens Provider
    vscode.languages.registerCodeLensProvider(xmlSelector, {
      provideCodeLenses(doc) {
        const root = doc.uri.scheme === 'file' ? modRootFor(doc.uri.fsPath) : null;
        const siblings = root ? readSiblingMdFiles(root, vscode.workspace.textDocuments) : [];
        return computeX4CodeLenses(doc.uri.fsPath, doc.getText(), siblings).map(lens => {
          const uri = doc.uri;
          const pos = new vscode.Position(lens.range.start.line, lens.range.start.character);
          const locations = lens.locations.map(loc => new vscode.Location(
            vscode.Uri.file(loc.file),
            new vscode.Position(loc.line, loc.character),
          ));
          return new vscode.CodeLens(toVsRange(lens.range), {
            title: `${lens.referenceCount} reference${lens.referenceCount === 1 ? '' : 's'}`,
            command: locations.length ? 'editor.action.showReferences' : '',
            arguments: locations.length ? [uri, pos, locations] : undefined,
          });
        });
      },
    }),

    // 6. Native F2 Rename Provider (MD Cues/Libraries + Local $Vars + AIScript Labels)
    vscode.languages.registerRenameProvider(xmlSelector, {
      prepareRename(doc, pos) {
        const word = doc.getWordRangeAtPosition(pos, /\$?[A-Za-z_][\w.-]*/);
        if (!word) throw new Error('Place the cursor on a cue, library, label, or $variable to rename.');
        return word;
      },
      provideRenameEdits(doc, pos, newName) {
        const root = doc.uri.scheme === 'file' ? modRootFor(doc.uri.fsPath) : null;
        const files = root ? readSiblingMdFiles(root, vscode.workspace.textDocuments) : [];
        if (!files.some(f => f.file.toLowerCase() === doc.uri.fsPath.toLowerCase())) {
          files.push({ file: doc.uri.fsPath, text: doc.getText() });
        }
        const plan = planX4SymbolRename(files, doc.uri.fsPath, doc.offsetAt(pos), newName);
        if ('reason' in plan) throw new Error(plan.reason);
        const wsEdit = new vscode.WorkspaceEdit();
        for (const edit of plan.edits) {
          const targetUri = vscode.Uri.file(edit.file);
          const openDoc = vscode.workspace.textDocuments.find(d => d.uri.fsPath.toLowerCase() === edit.file.toLowerCase());
          const fileText = openDoc ? openDoc.getText() : files.find(f => f.file.toLowerCase() === edit.file.toLowerCase())?.text || '';
          const before = fileText.slice(0, edit.start).split(/\r?\n/);
          const spanText = fileText.slice(0, edit.end).split(/\r?\n/);
          wsEdit.replace(
            targetUri,
            new vscode.Range(
              new vscode.Position(before.length - 1, before[before.length - 1].length),
              new vscode.Position(spanText.length - 1, spanText[spanText.length - 1].length),
            ),
            edit.newText,
          );
        }
        return wsEdit;
      },
    }),

    // 7. Format String SignatureHelp Provider ('%s of %s'.[$a, |] and {page, id}.[$a, |])
    vscode.languages.registerSignatureHelpProvider(xmlSelector, {
      provideSignatureHelp(doc, pos) {
        const root = doc.uri.scheme === 'file' ? modRootFor(doc.uri.fsPath) : null;
        const tData = root ? readModTFiles(root) : null;
        const sig = computeFormatSignatureHelp(
          doc.getText(),
          doc.offsetAt(pos),
          tData ? (p, id) => tData.pages.get(p)?.get(id) ?? null : undefined,
        );
        if (!sig) return undefined;
        const vsSig = new vscode.SignatureInformation(sig.label);
        vsSig.parameters = sig.parameters.map(p => new vscode.ParameterInformation(p.label));
        const help = new vscode.SignatureHelp();
        help.signatures = [vsSig];
        help.activeSignature = 0;
        help.activeParameter = sig.activeParameter;
        return help;
      },
    }, '[', ','),

    // 8. Lua ReadText(page, id) Go-to-Definition & Completion Providers
    vscode.languages.registerDefinitionProvider(luaSelector, {
      provideDefinition(doc, pos) {
        const root = doc.uri.scheme === 'file' ? modRootFor(doc.uri.fsPath) : null;
        if (!root) return undefined;
        const call = resolveLuaReadTextAtCursor(doc.getText(), doc.offsetAt(pos));
        if (!call) return undefined;
        const { files } = readModTFiles(root);
        const loc = findTFileEntryLocation(files, call.page, call.id);
        if (!loc) return undefined;
        return new vscode.Location(vscode.Uri.file(loc.file), new vscode.Position(loc.line, loc.character));
      },
    }),

    vscode.languages.registerCompletionItemProvider(luaSelector, {
      provideCompletionItems(doc, pos) {
        const root = doc.uri.scheme === 'file' ? modRootFor(doc.uri.fsPath) : null;
        if (!root) return undefined;
        const { pages } = readModTFiles(root);
        const items = completeLuaReadText(doc.getText(), doc.offsetAt(pos), pages);
        if (!items.length) return undefined;
        return items.map((it, idx) => {
          const ci = new vscode.CompletionItem(it.label, vscode.CompletionItemKind.Value);
          ci.detail = it.detail;
          ci.insertText = it.insertText;
          ci.sortText = String(idx).padStart(4, '0');
          return ci;
        });
      },
    }, '(', ',', ' '),

    // 9. XML Quick Fixes CodeAction Provider (misspelled elements, missing attrs, Create Cue/Library)
    vscode.languages.registerCodeActionsProvider(xmlSelector, {
      provideCodeActions(doc, range) {
        const text = doc.getText();
        const cueSet = new Set<string>();
        for (const m of text.matchAll(/<(?:cue|library)\b[^>]*?\bname\s*=\s*["']([^"']+)["']/gi)) {
          cueSet.add(m[1]);
        }
        const fixes = computeXmlQuickFixes(text, doc.offsetAt(range.start), {
          knownElements: [
            'set_value', 'remove_value', 'do_if', 'do_elseif', 'do_else', 'do_all', 'do_any', 'do_while', 'do_for_each',
            'debug_text', 'signal_cue', 'signal_cue_instantly', 'cancel_cue', 'reset_cue', 'run_actions', 'include_actions',
            'run_script', 'create_order', 'create_ship', 'find_ship', 'find_station', 'find_object', 'wait', 'resume', 'label',
            'raise_lua_event', 'add_player_money', 'show_help', 'write_to_logbook', 'cue', 'library', 'conditions', 'actions', 'params', 'param',
          ],
          knownCues: cueSet,
        });
        return fixes.map(fix => {
          const action = new vscode.CodeAction(fix.title, vscode.CodeActionKind.QuickFix);
          action.isPreferred = fix.preferred;
          const edit = new vscode.WorkspaceEdit();
          for (const e of fix.edits) {
            edit.replace(doc.uri, new vscode.Range(doc.positionAt(e.start), doc.positionAt(e.end)), e.newText);
          }
          action.edit = edit;
          return action;
        });
      },
    }, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
  );
}
