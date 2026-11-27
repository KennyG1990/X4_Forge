import React from 'react';
import { ExternalLink, File, FileDown, FileWarning, GitCompare, RefreshCw } from 'lucide-react';
import type { ModWorkspace } from '../types';
import { hasNativeReleaseHost, openBoundWorkspaceFile, openOrMaterializeInNativeEditor, openSourceVsGeneratedDiff } from '../lib/nativeEditor';

interface InventoryEntry {
  path: string;
  state: 'source' | 'synchronized-generated' | 'generated-only' | 'conflict';
  size: number;
  text: boolean;
  openable: boolean;
  materializable: boolean;
}

interface InventoryResponse {
  ok: boolean;
  sourceAvailable: boolean;
  entries: InventoryEntry[];
  excludedCount: number;
  sourceFolder?: string | null;
  workspaceRootId?: string;
  errors?: string[];
  error?: string;
}

export default function NativeProjectFiles({ workspace, workspaceId }: { workspace: ModWorkspace; workspaceId: string }) {
  const [snapshot, setSnapshot] = React.useState<{ workspace: ModWorkspace; inventory: InventoryResponse } | null>(null);
  const [selected, setSelected] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [materializing, setMaterializing] = React.useState(false);
  const activeWorkspace = React.useRef<ModWorkspace | null>(null);
  const pendingRequest = React.useRef<AbortController | null>(null);

  React.useLayoutEffect(() => {
    activeWorkspace.current = workspace;
    return () => {
      activeWorkspace.current = null;
      pendingRequest.current?.abort();
    };
  }, [workspace]);

  const isCurrentWorkspace = React.useCallback(() => {
    const selectedId = window.__X4_WORKSPACE_CONTEXT__?.getWorkspaceId();
    return activeWorkspace.current === workspace && (!selectedId || selectedId === workspaceId);
  }, [workspace, workspaceId]);

  const refresh = React.useCallback(async () => {
    if (!isCurrentWorkspace()) return;
    pendingRequest.current?.abort();
    const request = new AbortController();
    pendingRequest.current = request;
    const revision = window.__X4_WORKSPACE_CONTEXT__?.getSelectionRevision();
    const isCurrentRequest = () => !request.signal.aborted && isCurrentWorkspace()
      && revision === window.__X4_WORKSPACE_CONTEXT__?.getSelectionRevision();
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/agent/project/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace }),
        signal: request.signal,
      });
      const data = await response.json() as InventoryResponse;
      if (!isCurrentRequest()) return;
      if (!Array.isArray(data.entries)) throw new Error(data.error || data.errors?.join(' ') || 'Could not load project files.');
      setSnapshot({ workspace, inventory: data });
      setSelected((current) => data.entries.some(entry => entry.path === current)
        ? current
        : data.entries.find(entry => entry.openable)?.path || data.entries[0]?.path || '');
    } catch (error) {
      if (!isCurrentRequest()) return;
      setSnapshot(null);
      setMessage(error instanceof Error ? error.message : 'Could not load project files.');
    } finally {
      if (pendingRequest.current === request) {
        pendingRequest.current = null;
        if (isCurrentWorkspace()) setLoading(false);
      }
    }
  }, [isCurrentWorkspace, workspace]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 500);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const inventory = snapshot?.workspace === workspace ? snapshot.inventory : null;
  const entry = inventory?.entries.find(candidate => candidate.path === selected);
  const open = () => {
    if (!isCurrentWorkspace()) return;
    if (!entry?.openable) {
      setMessage(entry?.text
        ? 'This generated file is not materialized in the Mod Workspace yet.'
        : 'Binary payloads are preserved but are not opened as text.');
      return;
    }
    if (!hasNativeReleaseHost()) {
      setMessage('Native tabs are available in the installed Antigravity/VS Code extension.');
      return;
    }
    if (!inventory?.sourceFolder || !inventory.workspaceRootId) {
      setMessage('Forge could not identify the Mod Workspace folder. Refresh Project Files.');
      return;
    }
    openBoundWorkspaceFile(entry.path, inventory.sourceFolder, inventory.workspaceRootId);
  };

  const materialize = async () => {
    if (!entry || !isCurrentWorkspace()) return;
    setMaterializing(true);
    setMessage('');
    try {
      const result = await openOrMaterializeInNativeEditor(workspace, entry.path);
      if (isCurrentWorkspace()) {
        setMessage(result.message);
        await refresh();
      }
    } finally {
      setMaterializing(false);
    }
  };

  const compare = async () => {
    if (!entry || !isCurrentWorkspace()) return;
    setMessage('');
    const result = await openSourceVsGeneratedDiff(workspace, entry.path);
    if (isCurrentWorkspace()) setMessage(result.message);
  };

  return (
    <div data-testid="native-project-files" className="flex items-center gap-1 rounded-md border border-white/[0.08] bg-[#0a0c10] h-7 px-1.5 min-w-0">
      <File className="w-3.5 h-3.5 text-blue-400 shrink-0" />
      <select
        aria-label="Project Files"
        value={entry?.path || ''}
        onChange={(event) => { setSelected(event.target.value); setMessage(''); }}
        title={message || `${inventory?.entries.length || 0} packaged project files`}
        className="min-w-0 flex-1 max-w-[155px] 2xl:max-w-[230px] min-[1200px]:min-w-[115px] bg-[#11141a] border border-white/[0.08] rounded px-1.5 py-0.5 text-[11px] font-mono text-slate-200 focus:outline-none focus:border-blue-400"
      >
        {!inventory?.entries.length && <option value="">{loading ? 'Scanning project files…' : 'No project files'}</option>}
        {inventory?.entries.map(file => (
          <option key={file.path} value={file.path}>
            {file.path}{file.text ? '' : ' [binary]'}{file.state === 'conflict' ? ' [conflict]' : file.state === 'generated-only' ? ' [not materialized]' : ''}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={open}
        disabled={!entry || loading}
        title={entry?.openable ? `Open ${entry.path} in Antigravity` : message || 'Select a materialized text file'}
        className="p-1.5 rounded text-cyan-400 hover:bg-cyan-400/10 hover:text-cyan-200 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {entry && !entry.openable ? <FileWarning className="w-3.5 h-3.5" /> : <ExternalLink className="w-3.5 h-3.5" />}
      </button>
      {entry?.state === 'conflict' && entry.text && entry.openable && (
        <button
          type="button"
          onClick={() => void compare()}
          title={`Compare workspace source with Forge-generated ${entry.path}`}
          className="p-1.5 rounded text-fuchsia-400 hover:bg-fuchsia-400/10 hover:text-fuchsia-200"
        >
          <GitCompare className="w-3.5 h-3.5" />
        </button>
      )}
      {entry?.materializable && (
        <button
          type="button"
          onClick={() => void materialize()}
          disabled={materializing || entry.state === 'conflict'}
          title={entry.state === 'conflict' ? 'Generated and source bytes differ; review instead of overwriting' : `Materialize ${entry.path} into the Mod Workspace`}
          className="p-1.5 rounded text-amber-400 hover:bg-amber-400/10 hover:text-amber-200 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <FileDown className={`w-3.5 h-3.5 ${materializing ? 'animate-pulse' : ''}`} />
        </button>
      )}
      <button type="button" onClick={() => void refresh()} disabled={loading} title="Refresh project file inventory" className="p-1.5 rounded text-slate-500 hover:text-white hover:bg-white/5 disabled:opacity-30">
        <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
      </button>
      {message && <span className="sr-only" role="status">{message}</span>}
    </div>
  );
}
