/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FolderIcon,
  ChevronRight,
  ChevronDown,
  FileJson,
  FileCode,
  FileText,
  Search,
  Save,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
import { ModWorkspace, sanitizeWorkspace, TranslationItem, TranslationPage, TFile } from '../types';
import { parseXMLToWorkspace } from '../lib/xmlParser';
import { chooseDialog, promptDialog } from '../lib/uiDialogs';
import { canonicalMd } from '../lib/mdCanonicalComparison';
import { reconcileFailedWorkspaceWrite, type WorkspaceReadbackSnapshot } from '../lib/workspaceWriteRecovery';
import { generateMDXML } from '../types';

export interface FSItem {
  name: string;
  kind: 'file' | 'directory';
  path: string;
  handle?: unknown; // FileSystemFileHandle or FileSystemDirectoryHandle
  children?: FSItem[];
  isMock?: boolean;
  content?: string; // For mock files
}

// QoL panel cache: the FILES tree survives panel switches (background-refreshed
// on mount instead of refetched with a visible empty state).
const FILE_TREE_CACHE: { root: string; tree: FSItem[] | null } = { root: '', tree: null };

interface FileReadResponse {
  content?: unknown;
  root?: unknown;
  absolutePath?: unknown;
  sha256?: unknown;
}

interface FileScope {
  root: string;
  workspaceId: string;
  selectionRevision: number;
}

type FileIdentity = { path: string; sha256: string };
type FileStatus = { type: 'success' | 'error' | 'info'; text: string };
type SaveKind = { kind: 'json' } | { kind: 'md'; source: string; generated: string };
type FileSaveTarget = FileIdentity & SaveKind & {
  scope: FileScope;
  draftId: string;
  selection: number;
};

const normalizedDiskPath = (value: string) => value.replace(/\\/g, '/');
const workspaceFilePath = (root: string, relative: string) =>
  `${normalizedDiskPath(root).replace(/\/+$/, '')}/${normalizedDiskPath(relative)}`;
const isSha256 = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

async function readWorkspaceSnapshotForRecovery(path: string): Promise<WorkspaceReadbackSnapshot> {
  const response = await fetch(`/api/fs/read?root=workspace&path=${encodeURIComponent(path)}`);
  if (response.status === 404) {
    const errBody = await response.json().catch(() => ({})) as { code?: string };
    if (errBody.code === 'FILE_NOT_FOUND_IN_ROOT') return { state: 'absent' };
    return { state: 'unavailable' };
  }
  if (!response.ok) return { state: 'unavailable' };
  const data = await response.json().catch(() => ({})) as FileReadResponse;
  if (
    data.root !== 'workspace'
    || typeof data.absolutePath !== 'string'
    || normalizedDiskPath(data.absolutePath) !== normalizedDiskPath(path)
    || !isSha256(data.sha256)
  ) {
    return { state: 'unavailable' };
  }
  return {
    state: 'file',
    sha256: data.sha256,
    ...(typeof data.content === 'string' ? { content: data.content } : {}),
  };
}

async function writeFile(path: string, content: string, expectedSha256: string | null): Promise<string> {
  const response = await fetch('/api/fs/write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content, expectedSha256, strict: true }),
  });
  if (!response.ok) {
    const errBody = await response.json().catch((): ErrorResponse => ({}));
    const reconciled = await reconcileFailedWorkspaceWrite({
      status: response.status,
      body: errBody,
      headerRequestId: response.headers.get('X-Forge-Write-Request-Id'),
      fallbackMessage: 'Failed to write file on server.',
      intendedContent: content,
      expectedPreviousSha256: expectedSha256,
      readback: response.status >= 500 ? () => readWorkspaceSnapshotForRecovery(path) : undefined,
    });
    if (reconciled.kind === 'landed-verified') return reconciled.sha256;
    throw new Error(reconciled.message);
  }
  const reply = await response.json() as { success?: boolean; written?: {
    root?: string; absolutePath?: string; sha256?: string; byteExact?: boolean;
  } };
  const written = reply.written;
  if (reply.success !== true || written?.byteExact !== true || written.root !== 'workspace'
    || typeof written.absolutePath !== 'string' || normalizedDiskPath(written.absolutePath) !== normalizedDiskPath(path)
    || !isSha256(written.sha256)) {
    throw new Error('Forge could not confirm the saved bytes. Reopen the file before retrying.');
  }
  return written.sha256;
}

function isBlueprint(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const draft = value as Record<string, unknown>;
  return typeof draft.name === 'string' && Array.isArray(draft.nodes)
    && (draft.links === undefined || Array.isArray(draft.links));
}

interface ErrorResponse {
  error?: unknown;
}

const messageFromUnknown = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const responseErrorMessage = async (response: Response, fallback: string): Promise<string> => {
  const body = await response.json().catch((): ErrorResponse => ({})) as ErrorResponse;
  return typeof body.error === 'string' ? body.error : fallback;
};

interface DirectoryExplorerProps {
  modWorkspacePath: string;
  filesystemPath: string;
  workspace: ModWorkspace;
  setWorkspace: React.Dispatch<React.SetStateAction<ModWorkspace>>;
  saveCheckpoint: (customTarget?: ModWorkspace) => void;
  workspaceView?: 'blueprint' | 'ui-designer' | 'aiscripts' | 'libraries' | 'xmlpatch' | 'contracts' | 'translation' | 'wiki' | 'project' | 'galaxy';
  setWorkspaceView?: (view: 'blueprint' | 'ui-designer' | 'aiscripts' | 'libraries' | 'xmlpatch' | 'contracts' | 'translation' | 'wiki' | 'project' | 'galaxy') => void;
  onOpenEditorFile?: (file: {
    name: string;
    path: string;
    content: string;
    handle?: unknown;
    isMock?: boolean;
  }) => void;
}



export default function DirectoryExplorer({
  modWorkspacePath,
  workspace,
  setWorkspace,
  saveCheckpoint,
  workspaceView: _workspaceView,
  setWorkspaceView,
  onOpenEditorFile
}: DirectoryExplorerProps) {
  const [fileFilter, setFileFilter] = useState('');
  const [fileTree, setFileTree] = useState<FSItem[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});
  
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [saveTarget, setSaveTarget] = useState<FileSaveTarget | null>(null);
  const [writing, setWriting] = useState(false);
  const fileSelection = useRef(0);
  const writingRef = useRef(false);
  const mounted = useRef(true);
  const statusTimer = useRef<number | null>(null);
  const current = useRef({ modWorkspacePath, workspace });
  current.current = { modWorkspacePath, workspace };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      fileSelection.current += 1;
      if (statusTimer.current !== null) window.clearTimeout(statusTimer.current);
    };
  }, []);

  const readScope = (): FileScope => ({
    root: current.current.modWorkspacePath,
    workspaceId: window.__X4_WORKSPACE_CONTEXT__?.getWorkspaceId() ?? '',
    selectionRevision: window.__X4_WORKSPACE_CONTEXT__?.getSelectionRevision() ?? -1,
  });
  const scopeMatches = (scope: FileScope) => {
    const selected = readScope();
    return mounted.current && Boolean(scope.root) && Boolean(scope.workspaceId)
      && scope.root === selected.root && scope.workspaceId === selected.workspaceId
      && scope.selectionRevision === selected.selectionRevision;
  };
  const isCurrentTarget = (target: FileSaveTarget) => scopeMatches(target.scope)
    && fileSelection.current === target.selection && current.current.workspace.id === target.draftId;
  const activeSaveTarget = saveTarget && isCurrentTarget(saveTarget) ? saveTarget : null;
  const [statusMessage, updateStatus] = useState<FileStatus | null>(null);
  const setStatusMessage = useCallback((message: FileStatus, ttl?: number) => {
    if (statusTimer.current !== null) window.clearTimeout(statusTimer.current);
    statusTimer.current = null;
    updateStatus(message);
    if (ttl !== undefined) {
      statusTimer.current = window.setTimeout(() => {
        statusTimer.current = null;
        updateStatus(null);
      }, ttl);
    }
  }, []);

  const handleRefreshDirectory = useCallback(async () => {
    if (!modWorkspacePath) {
      setFileTree([]);
      return;
    }

    try {
      // The Files panel is an authoring surface, so it always shows the editable
      // Mod Workspace source. Deployed files remain available in Project Browser
      // as a separate, read-only comparison source.
      const response = await fetch('/api/fs/list?root=workspace');
      if (!mounted.current || current.current.modWorkspacePath !== modWorkspacePath) return;
      if (response.ok) {
        const tree = await response.json() as unknown;
        if (!Array.isArray(tree)) {
          throw new Error("Filesystem tree response was not an array.");
        }
        if (!mounted.current || current.current.modWorkspacePath !== modWorkspacePath) return;
        FILE_TREE_CACHE.root = modWorkspacePath;
        FILE_TREE_CACHE.tree = tree;
        setFileTree(tree);
        setStatusMessage({ type: 'success', text: "Synced project filesystem!" }, 2000);
      } else {
        throw new Error("Failed to load filesystem tree.");
      }
    } catch (error: unknown) {
      if (mounted.current && current.current.modWorkspacePath === modWorkspacePath) {
        setStatusMessage({ type: 'error', text: `Sync failed: ${messageFromUnknown(error)}` });
      }
    }
  }, [modWorkspacePath, setStatusMessage]);

  // Re-scan whenever configured paths change. Serve the cached tree instantly
  // (panel switches), then refresh in the background.
  useEffect(() => {
    setFileTree(FILE_TREE_CACHE.root === modWorkspacePath ? FILE_TREE_CACHE.tree ?? [] : []);
    handleRefreshDirectory();
  }, [handleRefreshDirectory, modWorkspacePath]);

  const toggleFolder = (path: string) => {
    setExpandedPaths(prev => ({
      ...prev,
      [path]: !prev[path]
    }));
  };

  // 4. File Click and Content Loader
  const handleFileClick = async (file: FSItem) => {
    const selection = ++fileSelection.current;
    const scope = readScope();
    const openingWorkspace = workspace;
    const stillOpening = () => scopeMatches(scope) && fileSelection.current === selection
      && current.current.workspace === openingWorkspace;
    setActiveFilePath(file.path);
    setSaveTarget(null);
    try {
      saveCheckpoint();
      const response = await fetch(`/api/fs/read?root=workspace&path=${encodeURIComponent(file.path)}`);
      if (!response.ok) {
        throw new Error("Could not read file from server.");
      }
      const data = await response.json() as FileReadResponse;
      if (!stillOpening()) return;
      if (typeof data.content !== 'string') throw new Error('Forge did not return file content.');
      const fileText = data.content;
      if (data.root !== 'workspace' || typeof data.absolutePath !== 'string'
        || normalizedDiskPath(data.absolutePath) !== workspaceFilePath(scope.root, file.path)) {
        throw new Error('The file no longer belongs to the displayed Mod Workspace. Reopen it after refreshing Settings.');
      }
      const identity: FileIdentity | null = isSha256(data.sha256)
        ? { path: data.absolutePath, sha256: data.sha256 } : null;
      const bindSave = (draft: ModWorkspace, kind: SaveKind) => {
        if (identity) setSaveTarget({ ...identity, ...kind, scope, draftId: draft.id, selection });
      };
      const sourceFolderName = String(workspace.sourceFolder || '')
        .replace(/\\/g, '/')
        .replace(/\/$/, '')
        .split('/')
        .pop() || '';
      const projectPath = sourceFolderName && file.path.startsWith(`${sourceFolderName}/`)
        ? file.path.slice(sourceFolderName.length + 1)
        : file.path;

      onOpenEditorFile?.({
        name: file.name,
        path: projectPath,
        content: fileText
      });

      const fileExtension = file.name.split('.').pop()?.toLowerCase();

      if (fileExtension === 'json') {
        try {
          const parsed = JSON.parse(fileText);
          if (isBlueprint(parsed)) {
            const sanitized = sanitizeWorkspace(parsed);
            setWorkspace(sanitized);
            bindSave(sanitized, { kind: 'json' });
            setStatusMessage({ type: 'success', text: `Opened Blueprint: ${file.name}` }, 2000);
          } else {
            throw new Error('This JSON file is not a Forge blueprint. Open the source to edit it.');
          }
        } catch (error: unknown) {
          setStatusMessage({ type: 'error', text: `JSON parse failed: ${messageFromUnknown(error)}` });
        }
      } else if (fileExtension === 'xml') {
        const isTFile = file.path.includes('/t/') || fileText.includes('<language');
        const isAIScript = file.path.includes('/aiscripts/') || fileText.includes('<aiscript');
        const isLibrary = file.path.includes('/libraries/') || fileText.includes('<diff');

        if (isTFile) {
          try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(fileText, "application/xml");
            const langEl = doc.getElementsByTagName("language")[0];
            if (langEl) {
              const languageId = langEl.getAttribute("id") || "44";
              const pagesList = langEl.getElementsByTagName("page");
              const pages: TranslationPage[] = [];
              
              for (let i = 0; i < pagesList.length; i++) {
                const pEl = pagesList[i];
                const pageId = pEl.getAttribute("id") || "20001";
                const pageTitle = pEl.getAttribute("title") || `Page ${pageId}`;
                const itemsList = pEl.getElementsByTagName("t");
                const items: TranslationItem[] = [];
                
                for (let j = 0; j < itemsList.length; j++) {
                  const tEl = itemsList[j];
                  const tId = tEl.getAttribute("id") || "1";
                  items.push({
                    id: tId,
                    value: tEl.textContent || "",
                    description: ""
                  });
                }
                pages.push({ id: pageId, title: pageTitle, items });
              }
              
              const targetTFile: TFile = {
                languageId,
                fileName: file.name,
                pages
              };
              
              setWorkspace(prev => {
                const currentTFiles = prev.tFiles || [];
                const existsIdx = currentTFiles.findIndex(f => f.languageId === languageId);
                const newTFiles = [...currentTFiles];
                if (existsIdx !== -1) {
                  newTFiles[existsIdx] = targetTFile;
                } else {
                  newTFiles.push(targetTFile);
                }
                return { ...prev, tFiles: newTFiles };
              });

              if (setWorkspaceView) {
                setWorkspaceView('translation');
              }
              setStatusMessage({ type: 'success', text: `Loaded Language t-file (${languageId}): ${file.name}` }, 2500);
            } else {
              throw new Error("No language root tag identified.");
            }
          } catch (error: unknown) {
            setStatusMessage({ type: 'error', text: `Could not parse Language XML: ${messageFromUnknown(error)}` }, 2500);
          }
        } else if (isAIScript) {
          if (setWorkspaceView) {
            setWorkspaceView('aiscripts');
          }
          setStatusMessage({ type: 'success', text: `Loaded AIScript Behavior: ${file.name}` }, 2500);
        } else if (isLibrary) {
          if (setWorkspaceView) {
            setWorkspaceView('xmlpatch');
          }
          setStatusMessage({ type: 'success', text: `Opened Library XML Patch: ${file.name}` }, 2500);
        } else {
          // Fallback to standard MD script parser
          const decoded = parseXMLToWorkspace(fileText, { identityPath: file.path });
          if (decoded && decoded.nodes.length > 0) {
            const draft = sanitizeWorkspace(decoded);
            const generated = generateMDXML(draft);
            const root = new DOMParser().parseFromString(fileText, 'application/xml').documentElement;
            const faithful = root.tagName === 'mdscript' && canonicalMd(fileText) === canonicalMd(generated);
            setWorkspace(draft);
            if (faithful) bindSave(draft, { kind: 'md', source: fileText, generated });
            if (setWorkspaceView) {
              setWorkspaceView('blueprint');
            }
            setStatusMessage(faithful && identity
              ? { type: 'success', text: `Imported XML Script: ${file.name}` }
              : { type: 'info', text: `Imported ${file.name} for graph viewing. Open the original source to save edits.` }, 2500);
          } else {
            setStatusMessage({ 
              type: 'error', 
              text: "Could not find compatible cues or actions nodes inside this XML script." 
            });
          }
        }
      } else {
        // Non-node standard text file
        setStatusMessage({ type: 'info', text: `Inspected text: ${file.name} (Opening in graph is restricted)` }, 2000);
      }
    } catch (error: unknown) {
      if (stillOpening()) setStatusMessage({ type: 'error', text: `Failed opening file: ${messageFromUnknown(error)}` });
    }
  };

  const handleSaveActiveFile = async () => {
    if (!activeSaveTarget || !isCurrentTarget(activeSaveTarget) || writingRef.current) return;
    const target = activeSaveTarget;
    const draft = current.current.workspace;
    writingRef.current = true;
    setWriting(true);
    try {
      const generated = target.kind === 'md' ? generateMDXML(draft) : JSON.stringify(draft, null, 2);
      const content = target.kind === 'md' && generated === target.generated ? target.source : generated;
      const sha256 = await writeFile(target.path, content, target.sha256);
      if (!isCurrentTarget(target)) return;
      setSaveTarget(target.kind === 'md'
        ? { ...target, source: content, generated, sha256 }
        : { ...target, sha256 });
      const filename = normalizedDiskPath(target.path).split('/').pop();
      setStatusMessage({ type: 'success', text: `Saved file: ${filename}` });
    } catch (error: unknown) {
      if (isCurrentTarget(target)) setStatusMessage({ type: 'error', text: `Save failed: ${messageFromUnknown(error)}` });
    } finally {
      writingRef.current = false;
      if (mounted.current) setWriting(false);
    }
  };

  const handleCreatePrompt = async () => {
    const scope = readScope();
    if (writingRef.current || !scopeMatches(scope)) return;
    const draft = current.current.workspace;
    writingRef.current = true;
    setWriting(true);
    try {
      const name = await promptDialog("Enter name for a new blueprint/script file (e.g., custom_patrol):", "custom_patrol");
      if (!name?.trim() || !scopeMatches(scope)) return;
      const selection = await chooseDialog("Create as a Visual JSON Blueprint, or raw Egosoft MD Script XML?", {
        firstLabel: 'JSON Blueprint', secondLabel: 'MD Script XML',
      });
      if (selection === null || !scopeMatches(scope)) return;
      if (current.current.workspace !== draft) {
        setStatusMessage({ type: 'info', text: 'The workspace changed. Open New File again.' });
        return;
      }

      const type = selection === 'first' ? 'json' : 'xml';
      const cleanName = name.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const filename = cleanName.endsWith(`.${type}`) ? cleanName : `${cleanName}.${type}`;
      const content = type === 'json' ? JSON.stringify(draft, null, 2) : generateMDXML(draft);
      await writeFile(workspaceFilePath(scope.root, filename), content, null);
      if (!scopeMatches(scope)) return;
      await handleRefreshDirectory();
      if (scopeMatches(scope)) setStatusMessage({ type: 'success', text: `Created file: ${filename}` });
    } catch (error: unknown) {
      if (scopeMatches(scope)) setStatusMessage({ type: 'error', text: `Could not create file: ${messageFromUnknown(error)}` });
    } finally {
      writingRef.current = false;
      if (mounted.current) setWriting(false);
    }
  };

  // Recursively filter tree lists
  const filterTreeItems = (items: FSItem[], query: string): FSItem[] => {
    if (!query) return items;
    const lc = query.toLowerCase();
    
    return items.map(item => {
      if (item.kind === 'file') {
        return item.name.toLowerCase().includes(lc) ? item : null;
      }
      
      const filteredChildren = filterTreeItems(item.children || [], query);
      if (filteredChildren.length > 0 || item.name.toLowerCase().includes(lc)) {
        return {
          ...item,
          children: filteredChildren
        };
      }
      return null;
    }).filter((item): item is FSItem => item !== null);
  };

  const filteredTree = filterTreeItems(fileTree, fileFilter);

  // Render recursive list nodes
  const renderFSNode = (item: FSItem, depth = 0) => {
    const isDir = item.kind === 'directory';
    const isExpanded = expandedPaths[item.path] ?? false;
    const isActive = activeFilePath === item.path;

    return (
      <div key={item.path} style={{ paddingLeft: `${depth * 8}px` }}>
        {isDir ? (
          <div>
            <button
              onClick={() => toggleFolder(item.path)}
              className="w-full flex items-center py-1 px-1.5 text-[#cbd5e1] hover:text-[#eef2f7] hover:bg-[#171b23] rounded text-left transition-colors font-mono text-[11px] font-medium cursor-pointer"
            >
              <span className="mr-0.5">
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </span>
              <span className="mr-1.5 text-[#60a5fa]">
                <FolderIcon className="w-3.5 h-3.5" />
              </span>
              <span className="truncate">{item.name}</span>
            </button>
            {isExpanded && item.children && (
              <div className="border-l border-[#262c36] ml-3 my-0.5">
                {item.children.map(child => renderFSNode(child, depth + 1))}
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => handleFileClick(item)}
            className={`w-full flex items-center py-1 px-1.5 rounded text-left transition-all font-mono text-[11px] border border-transparent cursor-pointer ${
              isActive 
                ? 'bg-[#3b82f6]/15 text-[#93c5fd] border-[#3b82f6]/40 font-semibold' 
                : 'text-[#cbd5e1] hover:text-[#eef2f7] hover:bg-[#171b23]'
            }`}
          >
            <span className="ml-4 mr-1.5 shrink-0">
              {item.name.endsWith('.json') ? (
                <FileJson className="w-3.5 h-3.5 text-amber-400" />
              ) : item.name.endsWith('.xml') ? (
                <FileCode className="w-3.5 h-3.5 text-[#60a5fa]" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-[#a0aab8]" />
              )}
            </span>
            <span className="truncate flex-1">{item.name}</span>
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#0c0e12] text-[#eef2f7] overflow-hidden select-none font-sans">
      {/* FileExplorer Top Bar */}
      <div className="p-3 border-b border-[#262c36] shrink-0 space-y-2 bg-[#11141a]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1 items-center bg-[#0a0c10] p-0.5 rounded border border-[#262c36] text-[11px]">
            <button
              onClick={handleRefreshDirectory}
              className="px-2 py-1 rounded hover:bg-[#171b23] text-[#a0aab8] hover:text-[#eef2f7] transition-colors cursor-pointer font-medium"
              title="Refresh project folder"
            >
              Refresh
            </button>
            <span className="text-[#262c36]">|</span>
            <button
              onClick={handleCreatePrompt}
              className="px-2 py-1 rounded hover:bg-[#171b23] text-[#60a5fa] hover:text-[#93c5fd] transition-colors cursor-pointer font-medium"
              title="Create new script or workspace"
              disabled={writing || !modWorkspacePath}
            >
              + New File
            </button>
          </div>
          <div className="flex gap-1">
            {activeSaveTarget && (
              <button
                onClick={handleSaveActiveFile}
                disabled={writing}
                className="px-2 py-1 rounded bg-[#3b82f6]/15 hover:bg-[#3b82f6]/25 text-[#93c5fd] border border-[#3b82f6]/35 transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-medium"
                title={activeSaveTarget.kind === 'md' ? 'Save the loaded Mission Director file' : 'Save the loaded Forge blueprint'}
              >
                <Save className="w-3 h-3" />
                <span>Save</span>
              </button>
            )}
          </div>
        </div>

        {/* Current Folder Path breadcrumb */}
        <div className="flex items-center gap-1.5 bg-[#0a0c10] rounded-md px-2 py-1.5 border border-[#262c36]">
          <span className="font-mono text-[11px] text-[#60a5fa] flex-shrink-0">
            path://
          </span>
          <span className="font-mono text-[11px] text-[#cbd5e1] truncate flex-1" title={modWorkspacePath || "No Mod Workspace folder configured"}>
            {modWorkspacePath || "No Mod Workspace folder configured"}
          </span>
        </div>

        {/* File filter input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-[#687385]" />
          <input
            type="text"
            value={fileFilter}
            onChange={e => setFileFilter(e.target.value)}
            placeholder="Search Files..."
            className="w-full pl-8 pr-2.5 py-1.5 rounded bg-[#0a0c10] border border-[#262c36] text-[11px] text-[#eef2f7] placeholder-[#687385] focus:outline-none focus:border-[#3b82f6] transition-colors font-mono"
          />
        </div>
      </div>

      {/* Directory Tree Scroll List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5 custom-scrollbar bg-[#0c0e12]">
        {/* Tree Render entry point */}
        <div className="space-y-1">
          {filteredTree.length === 0 ? (
            <div className="text-center py-6 px-3 text-[11px] font-mono text-[#687385] leading-relaxed">
              {modWorkspacePath ? "No files matched filters" : "No folder configured. Use Settings to configure the Mod Workspace folder."}
            </div>
          ) : (
            filteredTree.map(item => renderFSNode(item))
          )}
        </div>
      </div>

      {/* Synchronized status indicators details */}
      {statusMessage && (
        <div className={`p-2 font-mono text-[11px] border-t leading-snug shrink-0 flex items-center gap-1.5 ${
          statusMessage.type === 'success' 
            ? 'bg-emerald-500/12 text-emerald-300 border-emerald-500/25' 
            : statusMessage.type === 'error'
            ? 'bg-rose-500/12 text-rose-300 border-rose-500/25'
            : 'bg-[#3b82f6]/12 text-[#93c5fd] border-[#3b82f6]/30'
        }`}>
          {statusMessage.type === 'success' ? (
            <CheckCircle className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          )}
          <span className="flex-1 truncate">{statusMessage.text}</span>
        </div>
      )}

      {/* Godot style Footer feedback detail */}
      <div className="px-2.5 py-2 border-t border-[#262c36] bg-[#11141a] flex items-center justify-between font-mono text-[11px] text-[#a0aab8] shrink-0">
        <span className="truncate">Active File: {activeFilePath ? activeFilePath.split('/').pop() : 'None Loaded'}</span>
        {modWorkspacePath && <span className="shrink-0 text-emerald-400">● Server Connected</span>}
      </div>
    </div>
  );
}
