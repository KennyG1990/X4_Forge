/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Code2,
  FileCode,
  FileJson,
  FileText,
  FolderOpen,
  FolderSync,
  Layers3,
  PackageOpen,
  RefreshCw,
  Search,
  ShieldAlert,
  Upload,
  X
} from 'lucide-react';
import { ModWorkspace } from '../types';
import { parseXMLToWorkspace } from '../lib/xmlParser';
import { toTFileName } from '../lib/modCompiler';

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspace: ModWorkspace;
  setWorkspace: React.Dispatch<React.SetStateAction<ModWorkspace>>;
  saveCheckpoint: (customTarget?: ModWorkspace) => void;
  setWorkspaceView?: (view: 'blueprint' | 'ui-designer' | 'aiscripts' | 'libraries' | 'xmlpatch' | 'contracts' | 'translation' | 'wiki' | 'project' | 'galaxy') => void;
  modWorkspacePath?: string;
  filesystemPath?: string;
  onProjectLoaded?: () => void;
}

interface FSItem {
  name: string;
  kind: 'file' | 'directory';
  path: string;
  children?: FSItem[];
  childrenLoaded?: boolean;
  hasChildren?: boolean;
  childCount?: number;
  hasContent?: boolean;
  hasPacked?: boolean;
}

type ProjectSourceRoot = 'workspace' | 'filesystem';

interface ModCandidate {
  root: ProjectSourceRoot;
  name: string;
  path: string;
  domains: string[];
  hasContent: boolean;
  hasPacked: boolean;
}

const PROJECT_SOURCES: Array<{ root: ProjectSourceRoot; label: string; description: string }> = [
  { root: 'workspace', label: 'Mod Workspace', description: 'Development copies' },
  { root: 'filesystem', label: 'Filesystem', description: 'Installed or external mods' }
];

const DOMAIN_RULES: { key: string; label: string; test: (p: string) => boolean }[] = [
  { key: 'md', label: 'Mission Director', test: p => /^md\//i.test(p) },
  { key: 'aiscripts', label: 'AI Scripts', test: p => /^aiscripts\//i.test(p) },
  { key: 'libraries', label: 'Libraries/Patches', test: p => /^libraries\//i.test(p) },
  { key: 'ui', label: 'Lua/UI', test: p => /^ui\//i.test(p) || p.toLowerCase() === 'ui.xml' },
  { key: 't', label: 'Translations', test: p => /^t\//i.test(p) },
  { key: 'packed', label: 'Packed CAT/DAT', test: p => /\.(cat|dat)$/i.test(p) }
];

function collectFiles(node: FSItem, out: FSItem[] = []): FSItem[] {
  if (node.kind === 'file') out.push(node);
  for (const child of node.children || []) collectFiles(child, out);
  return out;
}

function collectRelativeEntries(node: FSItem, out: string[] = []): string[] {
  for (const child of node.children || []) {
    const relative = child.path.slice(node.path.length).replace(/^\/+/, '').replace(/\\/g, '/');
    out.push(child.kind === 'directory' ? `${relative}/` : relative);
    collectRelativeEntries(child, out);
  }
  return out;
}

function findModCandidates(items: FSItem[], root: ProjectSourceRoot): ModCandidate[] {
  const candidates: ModCandidate[] = [];
  const visit = (node: FSItem) => {
    if (node.kind !== 'directory') return;
    const files = collectFiles(node);
    const relFiles = files.map(f => f.path.slice(node.path.length).replace(/^\/+/, '').replace(/\\/g, '/'));
    const relEntries = collectRelativeEntries(node);
    const hasContent = node.hasContent ?? relFiles.some(p => p.toLowerCase() === 'content.xml');
    if (hasContent) {
      const domains = DOMAIN_RULES.filter(r => relEntries.some(r.test)).map(r => r.label);
      candidates.push({
        root,
        name: node.name,
        path: node.path,
        domains,
        hasContent,
        hasPacked: node.hasPacked ?? relFiles.some(p => /\.(cat|dat)$/i.test(p))
      });
    }
    for (const child of node.children || []) visit(child);
  };
  for (const item of items) visit(item);
  return candidates.sort((a, b) => a.name.localeCompare(b.name));
}

function updateTreeNode(items: FSItem[], targetPath: string, update: (item: FSItem) => FSItem): FSItem[] {
  return items.map(item => {
    if (item.path === targetPath) return update(item);
    if (!item.children?.length) return item;
    return { ...item, children: updateTreeNode(item.children, targetPath, update) };
  });
}

function filterProjectTree(items: FSItem[], query: string, showOfficial: boolean, depth = 0): FSItem[] {
  const normalized = query.trim().toLowerCase();
  return items.flatMap(item => {
    if (!showOfficial && depth === 0 && /^ego_/i.test(item.name)) return [];
    const children = item.children ? filterProjectTree(item.children, query, showOfficial, depth + 1) : undefined;
    if (!normalized || item.name.toLowerCase().includes(normalized) || item.path.toLowerCase().includes(normalized) || children?.length) {
      return [{ ...item, ...(children ? { children } : {}) }];
    }
    return [];
  });
}

function treeNodeTestId(root: ProjectSourceRoot, relativePath: string): string {
  return `project-tree-node-${root}-${relativePath.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
}

function countClasses(report: any) {
  return report?.counts || {};
}

export default function SyncModal({
  isOpen,
  onClose,
  workspace,
  setWorkspace,
  saveCheckpoint,
  setWorkspaceView,
  modWorkspacePath,
  filesystemPath,
  onProjectLoaded,
}: SyncModalProps) {
  const [mode, setMode] = useState<'project' | 'file'>('project');
  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'refused' | 'info'; msg: string } | null>(null);
  const [importText, setImportText] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [fileTrees, setFileTrees] = useState<Record<ProjectSourceRoot, FSItem[]>>({ workspace: [], filesystem: [] });
  const [rootErrors, setRootErrors] = useState<Partial<Record<ProjectSourceRoot, string>>>({});
  const [rootExpanded, setRootExpanded] = useState<Record<ProjectSourceRoot, boolean>>({ workspace: true, filesystem: true });
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});
  const [loadingPaths, setLoadingPaths] = useState<Record<string, boolean>>({});
  const [nodeErrors, setNodeErrors] = useState<Record<string, string>>({});
  const [loadingTree, setLoadingTree] = useState(false);
  const [projectFilter, setProjectFilter] = useState('');
  const [selectedRoot, setSelectedRoot] = useState<ProjectSourceRoot>('workspace');
  const [selectedPath, setSelectedPath] = useState('');
  const [previewReport, setPreviewReport] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewGeneration = useRef(0);
  const [importLoading, setImportLoading] = useState(false);
  const [showOfficial, setShowOfficial] = useState(false);

  const candidates = useMemo(
    () => PROJECT_SOURCES.flatMap(source => findModCandidates(fileTrees[source.root], source.root)),
    [fileTrees]
  );
  const filteredCandidates = useMemo(() => {
    const q = projectFilter.trim().toLowerCase();
    return candidates.filter(c => {
      if (!showOfficial && /^ego_/i.test(c.name)) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.path.toLowerCase().includes(q);
    });
  }, [candidates, projectFilter, showOfficial]);
  const visibleTrees = useMemo<Record<ProjectSourceRoot, FSItem[]>>(() => ({
    workspace: filterProjectTree(fileTrees.workspace, projectFilter, showOfficial),
    filesystem: filterProjectTree(fileTrees.filesystem, projectFilter, showOfficial),
  }), [fileTrees, projectFilter, showOfficial]);
  const selectedCandidate = candidates.find(c => c.root === selectedRoot && c.path === selectedPath) || null;
  const previewCounts = countClasses(previewReport?.importReport || previewReport);
  const selectedFileCount = previewReport?.importReport?.classification?.length
    ?? previewReport?.classification?.length
    ?? null;
  const previewClassification = previewReport?.importReport?.classification || previewReport?.classification || [];
  const detectedDomains = previewReport
    ? DOMAIN_RULES.filter(rule => previewClassification.some((entry: any) => rule.test(String(entry?.path || '')))).map(rule => rule.label)
    : (selectedCandidate?.domains || []);
  const graphNodeCount = previewReport?.importReport?.graphNodeCount ?? previewReport?.graphNodeCount ?? null;
  const opaqueNodeCount = previewReport?.importReport?.opaqueNodeCount ?? previewReport?.opaqueNodeCount ?? null;
  const opaqueTopLevelNodeCount = previewReport?.importReport?.opaqueTopLevelNodeCount ?? previewReport?.opaqueTopLevelNodeCount ?? 0;
  const localizedOpaqueNodeCount = Math.max(0, Number(opaqueNodeCount || 0) - Number(opaqueTopLevelNodeCount || 0));

  useEffect(() => {
    if (!isOpen) return;
    void loadProjectTree();
    // reason: loadProjectTree is a non-memoized component-body function; the tree should reload only when the modal opens or its path inputs (modWorkspacePath/filesystemPath) change, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, modWorkspacePath, filesystemPath]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onCloseRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Discovery is a navigation aid, not the authority for a manually entered path.
  // In particular, partial input and paths typed while a scan is pending must survive.
  const invalidatePreview = () => {
    previewGeneration.current += 1;
    setPreviewReport(null);
    setPreviewLoading(false);
  };

  const loadProjectTree = async () => {
    invalidatePreview();
    setLoadingTree(true);
    setStatusBanner(null);
    setExpandedPaths({});
    setLoadingPaths({});
    setNodeErrors({});
    // A refresh or late path-config hydration invalidates the old preview, but
    // must also replace it. Otherwise a selected project can remain pending
    // forever when its earlier response arrives after this generation changes.
    if (selectedPath.trim()) void previewProject(selectedRoot, selectedPath);
    const results = await Promise.all(PROJECT_SOURCES.map(async source => {
      try {
        const res = await fetch(`/api/fs/list?root=${source.root}&depth=1`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `${source.label} scan failed (${res.status})`);
        return { root: source.root, tree: Array.isArray(data) ? data : [], error: '' };
      } catch (error) {
        return { root: source.root, tree: [] as FSItem[], error: error instanceof Error ? error.message : `Failed to scan ${source.label}.` };
      }
    }));
    const nextTrees: Record<ProjectSourceRoot, FSItem[]> = { workspace: [], filesystem: [] };
    const nextErrors: Partial<Record<ProjectSourceRoot, string>> = {};
    for (const result of results) {
      nextTrees[result.root] = result.tree;
      if (result.error) nextErrors[result.root] = result.error;
    }
    setFileTrees(nextTrees);
    setRootErrors(nextErrors);
    const failures = Object.keys(nextErrors).length;
    setStatusBanner(failures
      ? { type: 'refused', msg: `Scanned ${PROJECT_SOURCES.length - failures} of ${PROJECT_SOURCES.length} project sources. ${Object.values(nextErrors).join(' ')}` }
      : { type: 'info', msg: 'Scanned Mod Workspace and Filesystem project sources.' });
    setLoadingTree(false);
  };

  const loadDirectoryChildren = async (root: ProjectSourceRoot, item: FSItem) => {
    const key = `${root}:${item.path}`;
    if (item.childrenLoaded || loadingPaths[key]) return;
    setLoadingPaths(prev => ({ ...prev, [key]: true }));
    setNodeErrors(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    try {
      const query = new URLSearchParams({ root, depth: '1', path: item.path });
      const res = await fetch(`/api/fs/list?${query.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Could not expand ${item.name} (${res.status})`);
      if (!Array.isArray(data)) throw new Error(`Directory response for ${item.name} was not an array.`);
      setFileTrees(prev => ({
        ...prev,
        [root]: updateTreeNode(prev[root], item.path, current => ({
          ...current,
          children: data,
          childrenLoaded: true,
          hasChildren: data.length > 0,
          childCount: data.length,
        })),
      }));
    } catch (error) {
      setNodeErrors(prev => ({
        ...prev,
        [key]: error instanceof Error ? error.message : `Could not expand ${item.name}.`,
      }));
    } finally {
      setLoadingPaths(prev => ({ ...prev, [key]: false }));
    }
  };

  const toggleDirectory = (root: ProjectSourceRoot, item: FSItem) => {
    const key = `${root}:${item.path}`;
    const nextExpanded = !expandedPaths[key];
    setExpandedPaths(prev => ({ ...prev, [key]: nextExpanded }));
    if (nextExpanded && !item.childrenLoaded) void loadDirectoryChildren(root, item);
  };

  const previewProject = async (root: ProjectSourceRoot, path: string) => {
    if (!path) return;
    const generation = ++previewGeneration.current;
    setPreviewLoading(true);
    setPreviewReport(null);
    setStatusBanner(null);
    try {
      const res = await fetch('/api/agent/round-trip-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root, path })
      });
      const data = await res.json();
      if (generation !== previewGeneration.current) return;
      if (!res.ok || data.error) throw new Error(data.error || `Preview failed (${res.status})`);
      setPreviewReport(data);
    } catch (e) {
      if (generation === previewGeneration.current) setStatusBanner({ type: 'refused', msg: e.message || 'Project preview failed.' });
    } finally {
      if (generation === previewGeneration.current) setPreviewLoading(false);
    }
  };

  const selectProject = (candidate: ModCandidate) => {
    setSelectedRoot(candidate.root);
    setSelectedPath(candidate.path);
    void previewProject(candidate.root, candidate.path);
  };

  const importProject = async () => {
    if (!selectedPath.trim()) {
      setStatusBanner({ type: 'refused', msg: 'Select a mod folder or enter a folder path first.' });
      return;
    }
    setImportLoading(true);
    try {
      const res = await fetch('/api/agent/mod-folder/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: selectedRoot, path: selectedPath.trim() })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Import failed (${res.status})`);
      saveCheckpoint();
      setWorkspace(data.workspace);
      onProjectLoaded?.();
      if (setWorkspaceView) setWorkspaceView('blueprint');
      setStatusBanner({ type: 'success', msg: `Loaded ${selectedRoot} mod folder "${selectedPath}". ${data.report?.summary || ''}` });
      onClose();
    } catch (e) {
      setStatusBanner({ type: 'refused', msg: e.message || 'Project import failed.' });
    } finally {
      setImportLoading(false);
    }
  };

  const executeImport = (textToImport: string, format: 'json' | 'xml') => {
    if (!textToImport.trim()) {
      setStatusBanner({ type: 'refused', msg: 'Paste or drop file data first.' });
      return;
    }

    try {
      if (format === 'json') {
        const parsed = JSON.parse(textToImport);
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.nodes)) {
          saveCheckpoint();
          setWorkspace(parsed);
          setStatusBanner({ type: 'success', msg: `Workspace JSON "${parsed.name || 'mod'}" loaded with ${parsed.nodes.length} visual nodes.` });
          onClose();
        } else {
          throw new Error("Missing mandatory 'nodes' schema attribute.");
        }
        return;
      }

      const isTFile = textToImport.includes('<language');
      const isAIScript = textToImport.includes('<aiscript');
      const isLibrary = textToImport.includes('<diff');

      if (isTFile) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(textToImport, 'application/xml');
        const langEl = doc.getElementsByTagName('language')[0];
        if (!langEl) throw new Error('Invalid language XML root structure.');
        const languageId = langEl.getAttribute('id') || '44';
        const pages = [...doc.getElementsByTagName('page')].map(pEl => ({
          id: pEl.getAttribute('id') || '20001',
          title: pEl.getAttribute('title') || `Page ${pEl.getAttribute('id') || '20001'}`,
          items: [...pEl.getElementsByTagName('t')].map(tEl => ({
            id: tEl.getAttribute('id') || '1',
            value: tEl.textContent || '',
            description: ''
          }))
        }));
        saveCheckpoint();
        setWorkspace(prev => {
          const current = prev.tFiles || [];
          const target = { languageId, fileName: toTFileName({ languageId }), pages };
          const idx = current.findIndex(f => f.languageId === languageId);
          const next = [...current];
          if (idx >= 0) next[idx] = target;
          else next.push(target);
          return { ...prev, tFiles: next };
        });
        if (setWorkspaceView) setWorkspaceView('translation');
        onClose();
      } else if (isAIScript) {
        // P10: this path used to claim success ("Routed to Behavior Tree builder") while
        // importing NOTHING — the pasted XML was discarded. Be honest: single-paste AIScript
        // import isn't wired here; point the user at the real import flow.
        setStatusBanner({ type: 'refused', msg: 'Detected an AIScript, but pasting a single AIScript here does not import it. Use Load Mod Project to import an AIScript from a mod folder.' });
      } else if (isLibrary) {
        // P10: same — a pasted <diff> was not imported despite the old success message.
        setStatusBanner({ type: 'refused', msg: 'Detected an XML diff patch, but pasting it here does not import it. Use Load Mod Project, or author patches in the XML Patching tab.' });
      } else {
        const reconstructed = parseXMLToWorkspace(textToImport);
        if (!reconstructed || reconstructed.nodes.length === 0) throw new Error('No compatible MD cues/events/actions were identified.');
        saveCheckpoint();
        setWorkspace(reconstructed);
        if (setWorkspaceView) setWorkspaceView('blueprint');
        onClose();
      }
    } catch (e) {
      setStatusBanner({ type: 'refused', msg: `Parse error: ${e.message || 'Ensure correct XML structure.'}` });
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      const content = event.target?.result as string || '';
      setImportText(content);
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'json') executeImport(content, 'json');
      else if (ext === 'xml') executeImport(content, 'xml');
      else setStatusBanner({ type: 'info', msg: 'Loaded raw text into the legacy parser.' });
    };
    reader.readAsText(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      const content = event.target?.result as string || '';
      setImportText(content);
      const ext = file.name.split('.').pop()?.toLowerCase();
      executeImport(content, ext === 'json' ? 'json' : 'xml');
    };
    reader.readAsText(file);
  };

  const renderProjectTreeNode = (
    source: (typeof PROJECT_SOURCES)[number],
    item: FSItem,
    depth = 0
  ): React.ReactNode => {
    const key = `${source.root}:${item.path}`;
    const filterForcesExpanded = Boolean(projectFilter.trim() && item.children?.length);
    const isExpanded = Boolean(expandedPaths[key] || filterForcesExpanded);
    const isLoading = Boolean(loadingPaths[key]);
    const candidate = item.hasContent
      ? candidates.find(current => current.root === source.root && current.path === item.path) || null
      : null;
    const isSelected = selectedRoot === source.root && selectedPath === item.path;

    if (item.kind === 'file') {
      const lowerName = item.name.toLowerCase();
      const icon = /\.(?:cat|dat)$/.test(lowerName)
        ? <PackageOpen className="w-3.5 h-3.5 text-fuchsia-300 shrink-0" />
        : lowerName.endsWith('.json')
          ? <FileJson className="w-3.5 h-3.5 text-amber-300 shrink-0" />
          : /\.(?:xml|xsd|lua)$/.test(lowerName)
            ? <FileCode className="w-3.5 h-3.5 text-sky-300 shrink-0" />
            : <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />;
      return (
        <div
          key={key}
          data-testid={treeNodeTestId(source.root, item.path)}
          className="flex items-center gap-1.5 rounded px-1.5 py-1 font-mono text-[11px] text-slate-300"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          title={item.path}
        >
          <span className="w-3.5 shrink-0" aria-hidden="true" />
          {icon}
          <span className="truncate">{item.name}</span>
        </div>
      );
    }

    const canExpand = item.hasChildren !== false;
    return (
      <div key={key} data-testid={treeNodeTestId(source.root, item.path)}>
        <div
          className={`group flex items-center rounded border transition-colors ${isSelected ? 'bg-sky-500/12 border-sky-500/35' : 'border-transparent hover:bg-white/[0.04]'}`}
          style={{ paddingLeft: `${depth * 12}px` }}
        >
          {canExpand ? (
            <button
              type="button"
              onClick={() => toggleDirectory(source.root, item)}
              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${item.name}`}
              aria-expanded={isExpanded}
              className="p-1 text-slate-500 hover:text-white cursor-pointer shrink-0"
            >
              {isLoading
                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                : isExpanded
                  ? <ChevronDown className="w-3.5 h-3.5" />
                  : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : <span className="w-[22px] shrink-0" aria-hidden="true" />}
          <button
            type="button"
            onClick={() => candidate ? selectProject(candidate) : toggleDirectory(source.root, item)}
            aria-label={candidate ? `Select ${item.name} from ${source.label}` : `${isExpanded ? 'Collapse' : 'Expand'} folder ${item.name}`}
            className="min-w-0 flex-1 flex items-center gap-1.5 py-1 pr-1.5 text-left cursor-pointer"
            title={item.path}
          >
            <FolderOpen className={`w-3.5 h-3.5 shrink-0 ${candidate ? 'text-sky-300' : 'text-slate-500'}`} />
            <span className={`truncate font-mono text-[11px] ${candidate ? 'font-semibold text-slate-100' : 'text-slate-400'}`}>{item.name}</span>
            {item.hasPacked && <span className="text-[11px] px-1.5 py-0.5 rounded bg-fuchsia-500/10 border border-fuchsia-500/25 text-fuchsia-300">CAT/DAT</span>}
            {typeof item.childCount === 'number' && <span className="ml-auto font-mono text-[11px] text-slate-500">{item.childCount}</span>}
          </button>
        </div>
        {nodeErrors[key] && <div className="ml-7 px-2 py-1 text-[11px] text-rose-300">{nodeErrors[key]}</div>}
        {isExpanded && item.children && (
          <div className="ml-3 border-l border-white/8">
            {item.children.length
              ? item.children.map(child => renderProjectTreeNode(source, child, depth + 1))
              : <div className="pl-5 py-1 text-[11px] text-slate-500">Empty folder</div>}
          </div>
        )}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div
      data-testid="sync-modal-dialog"
      className="fixed inset-0 z-[110] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 font-sans"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Load Mod Project"
        onClick={event => event.stopPropagation()}
        className="w-full max-w-7xl bg-[#11151d] border border-white/[0.12] rounded-xl overflow-hidden shadow-2xl flex flex-col h-[88vh]"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08] bg-[#141820] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-md border border-sky-500/30 bg-sky-500/10 flex items-center justify-center shrink-0">
              <PackageOpen className="w-5 h-5 text-sky-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-100">Load Mod Project</h2>
              <p className="text-[11px] font-mono text-slate-400 truncate">Project-first import for complete X4 extension folders</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close Load Mod Project" className="p-1.5 rounded-md hover:bg-white/10 text-slate-400 hover:text-white transition-all cursor-pointer" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {statusBanner && (
          <div className={`px-4 py-2 text-[11px] font-mono border-b flex items-center justify-between ${
            statusBanner.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
              : statusBanner.type === 'refused'
                ? 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                : 'bg-sky-500/10 text-sky-300 border-sky-500/25'
          }`}>
            <div className="flex items-center gap-2 min-w-0">
              {statusBanner.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span className="truncate">{statusBanner.msg}</span>
            </div>
            <button onClick={() => setStatusBanner(null)} className="underline hover:text-white cursor-pointer">Dismiss</button>
          </div>
        )}

        <div className="flex border-b border-white/[0.08] bg-[#131720] font-mono text-xs shrink-0">
          <button
            onClick={() => setMode('project')}
            className={`px-5 py-2.5 border-b-2 font-semibold transition-all cursor-pointer ${mode === 'project' ? 'border-sky-400 text-slate-100 bg-sky-500/10' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            Project Browser
          </button>
          <button
            onClick={() => setMode('file')}
            className={`px-5 py-2.5 border-b-2 font-semibold transition-all cursor-pointer ${mode === 'file' ? 'border-sky-400 text-slate-100 bg-sky-500/10' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            Single File Parser
          </button>
        </div>

        {mode === 'project' ? (
          <div className="flex-1 min-h-0 grid grid-cols-[320px_minmax(0,1fr)_320px] bg-[#0b0f16]">
            <aside className="border-r border-white/8 bg-[#10151f] min-h-0 flex flex-col">
              <div className="p-3 border-b border-white/8 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-mono text-[11px] font-semibold text-slate-300">Project Sources</div>
                  <button onClick={loadProjectTree} className="p-1.5 rounded border border-white/10 bg-white/[0.03] hover:bg-white/10 text-slate-300 cursor-pointer" title="Refresh projects">
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingTree ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-2" />
                  <input
                    value={projectFilter}
                    onChange={e => setProjectFilter(e.target.value)}
                    placeholder="Filter mod folders..."
                    className="w-full bg-black/35 border border-white/10 rounded pl-7 pr-2 py-1.5 text-[11px] text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
                <label className="flex items-center gap-2 font-mono text-[11px] text-slate-300 select-none cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showOfficial}
                    onChange={e => setShowOfficial(e.target.checked)}
                    className="accent-sky-500"
                  />
                  Show official Ego/DLC extensions
                </label>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-3">
                {PROJECT_SOURCES.map(source => {
                  const sourcePath = source.root === 'workspace' ? modWorkspacePath : filesystemPath;
                  const sourceCandidates = filteredCandidates.filter(candidate => candidate.root === source.root);
                  const sourceTree = visibleTrees[source.root];
                  const isSourceExpanded = rootExpanded[source.root];
                  return (
                    <section key={source.root} data-testid={`project-source-${source.root}`} className="rounded-md border border-white/8 bg-black/20 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setRootExpanded(prev => ({ ...prev, [source.root]: !prev[source.root] }))}
                        aria-label={`${isSourceExpanded ? 'Collapse' : 'Expand'} ${source.label}`}
                        aria-expanded={isSourceExpanded}
                        className="w-full flex items-start gap-1.5 px-2 py-2 bg-white/[0.025] hover:bg-white/[0.05] text-left cursor-pointer"
                      >
                        {isSourceExpanded ? <ChevronDown className="w-3.5 h-3.5 mt-0.5 text-slate-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 mt-0.5 text-slate-400 shrink-0" />}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="font-mono text-[11px] font-semibold text-slate-200">{source.label}</div>
                              <div className="text-[11px] text-slate-400">{source.description}</div>
                            </div>
                            <span className="font-mono text-[11px] text-slate-400">{sourceCandidates.length}</span>
                          </div>
                          <div className="mt-1 font-mono text-[11px] text-slate-400 break-all">{sourcePath || 'Not configured'}</div>
                        </div>
                      </button>
                      {isSourceExpanded && (
                        <div className="border-t border-white/8 p-1">
                          {rootErrors[source.root] ? (
                            <div className="text-[11px] text-rose-300 p-2">{rootErrors[source.root]}</div>
                          ) : sourceTree.length === 0 ? (
                            <div className="text-[11px] text-slate-400 p-2 leading-relaxed">No folders or files found.</div>
                          ) : sourceTree.map(item => renderProjectTreeNode(source, item))}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            </aside>

            <main className="min-w-0 min-h-0 flex flex-col">
              <div className="p-4 border-b border-white/8 bg-[#0f141e]">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-mono text-[11px] font-medium text-slate-400">Selected Extension</div>
                    <h3 className="mt-1 text-lg font-semibold text-white truncate">{selectedCandidate?.name || 'No mod selected'}</h3>
                    <div className="mt-1 font-mono text-[11px] text-slate-300 break-all">{selectedPath ? `${selectedRoot}: ${selectedPath}` : 'Pick a folder from either project source, or type a relative folder path below.'}</div>
                  </div>
                  <button
                    onClick={importProject}
                    disabled={importLoading || !selectedPath}
                    className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-md border border-sky-500/40 bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 font-mono text-[11px] font-semibold cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    <FolderSync className={`w-4 h-4 ${importLoading ? 'animate-spin' : ''}`} />
                    Load Project
                  </button>
                </div>
                <div className="mt-3 flex gap-2">
                  <div className="flex rounded border border-white/10 overflow-hidden shrink-0">
                    {PROJECT_SOURCES.map(source => (
                      <button
                        key={source.root}
                        onClick={() => { setSelectedRoot(source.root); invalidatePreview(); }}
                        className={`px-2 py-2 font-mono text-[11px] capitalize cursor-pointer ${selectedRoot === source.root ? 'bg-sky-500/15 text-sky-200' : 'bg-black/35 text-slate-400 hover:text-slate-200'}`}
                        title={source.label}
                      >
                        {source.root}
                      </button>
                    ))}
                  </div>
                  <input
                    value={selectedPath}
                    onChange={e => { setSelectedPath(e.target.value); invalidatePreview(); }}
                    placeholder="Relative folder path, e.g. sn_mod_support_apis"
                    className="flex-1 bg-black/35 border border-white/10 rounded px-2 py-2 text-[11px] text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                  />
                  <button
                    onClick={() => previewProject(selectedRoot, selectedPath)}
                    disabled={!selectedPath || previewLoading}
                    className="px-3 py-2 rounded border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 font-mono text-[11px] cursor-pointer disabled:opacity-45"
                  >
                    {previewLoading ? 'Scanning...' : 'Preview'}
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
                <section className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                  {DOMAIN_RULES.slice(0, 5).map(d => {
                    const active = detectedDomains.includes(d.label);
                    return (
                      <div key={d.key} className={`rounded-md border p-3 ${active ? 'bg-sky-500/10 border-sky-500/30' : 'bg-white/[0.025] border-white/8'}`}>
                        <div className="flex items-center gap-2">
                          <Layers3 className={`w-4 h-4 ${active ? 'text-sky-300' : 'text-slate-500'}`} />
                          <span className={`font-mono text-[11px] font-semibold ${active ? 'text-slate-100' : 'text-slate-400'}`}>{d.label}</span>
                        </div>
                        <div className="mt-2 text-[11px] text-slate-400">{active ? 'Detected in package' : 'No files detected'}</div>
                      </div>
                    );
                  })}
                </section>

                <section className="rounded-md border border-white/8 bg-white/[0.025] p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Code2 className="w-4 h-4 text-emerald-300" />
                    <h4 className="font-mono text-[11px] text-slate-100 font-semibold">Import Contract</h4>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    {[
                      ['Editable', previewCounts.editable || 0, 'Parsed into Forge models'],
                      ['Generated', previewCounts.generated || 0, 'Regenerated on export'],
                      ['Partial', previewCounts.partial || 0, 'Known but preserved'],
                      ['Passthrough', previewCounts.passthrough || 0, 'Copied byte-for-byte'],
                      ['Binary', previewCounts.binary || 0, 'Tracked, not loaded']
                    ].map(([label, count, detail]) => (
                      <div key={String(label)} className="rounded border border-white/8 bg-black/30 p-2">
                        <div className="font-mono text-[15px] text-white font-bold">{String(count)}</div>
                        <div className="font-mono text-[11px] font-semibold text-slate-300">{label}</div>
                        <div className="mt-1 text-[11px] text-slate-400">{detail}</div>
                      </div>
                    ))}
                  </div>
                  {graphNodeCount !== null && (
                    <div className="mt-3 rounded border border-sky-500/20 bg-sky-500/[0.05] px-3 py-2 text-[11px] text-slate-300">
                      <span className="font-mono font-semibold text-sky-300">{graphNodeCount} graph nodes</span>
                      {opaqueNodeCount
                        ? ` · ${localizedOpaqueNodeCount} localized raw element${localizedOpaqueNodeCount === 1 ? '' : 's'} · ${opaqueTopLevelNodeCount} whole cue${opaqueTopLevelNodeCount === 1 ? '' : 's'} collapsed`
                        : ' · every MD element mapped to a typed node · 0 whole cues collapsed'}
                    </div>
                  )}
                </section>

                <section className="rounded-md border border-white/8 bg-black/25 p-4">
                  <h4 className="font-mono text-[11px] text-slate-100 font-semibold mb-2">Preview Notes</h4>
                  <div className="text-[11px] text-slate-400 leading-relaxed">
                    Whole-folder import preserves the mod ecosystem: `content.xml`, MD, libraries, translations, UI/Lua, unknown files, and packed artifacts. Editable domains become Forge models; unsupported domains stay passthrough so import/export does not silently destroy the package.
                  </div>
                  {!!opaqueNodeCount && (
                    <div className="mt-3 text-[11px] text-amber-200/85 leading-relaxed border border-amber-500/20 bg-amber-500/[0.05] rounded p-2.5">
                      {opaqueTopLevelNodeCount > 0
                        ? `${opaqueTopLevelNodeCount} whole cue${opaqueTopLevelNodeCount === 1 ? '' : 's'} could not be decomposed and remain lossless raw nodes. `
                        : 'No whole cue was collapsed. '}
                      {localizedOpaqueNodeCount > 0
                        ? `${localizedOpaqueNodeCount} unsupported element${localizedOpaqueNodeCount === 1 ? '' : 's'} remain localized raw nodes at their real graph position; their enclosing cues and surrounding logic stay editable.`
                        : 'All remaining MD elements are typed nodes.'}
                    </div>
                  )}
                  {previewReport?.droppedFiles?.length > 0 && (
                    <div className="mt-3 text-red-300 text-[11px] font-mono bg-red-500/10 border border-red-500/20 rounded p-2">
                      Dropped files detected: {previewReport.droppedFiles.slice(0, 5).join(', ')}
                    </div>
                  )}
                </section>
              </div>
            </main>

            <aside className="border-l border-white/8 bg-[#10151f] min-h-0 flex flex-col">
              <div className="p-3 border-b border-white/8">
                <div className="font-mono text-[11px] font-semibold text-slate-300">Project Summary</div>
                <div className="mt-2 space-y-2 text-[11px] text-slate-300">
                  <div className="flex justify-between gap-2"><span>Candidate mods</span><span className="font-mono text-white">{candidates.length}</span></div>
                  <div className="flex justify-between gap-2"><span>Selected files</span><span className="font-mono text-white">{selectedFileCount ?? 'preview pending'}</span></div>
                  <div className="flex justify-between gap-2"><span>Packed archive</span><span className="font-mono text-white">{selectedCandidate?.hasPacked ? 'yes' : 'no'}</span></div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3">
                <div className="rounded border border-white/8 bg-black/25 p-3">
                  <div className="font-mono text-[11px] font-semibold text-slate-300 mb-2">Detected Domains</div>
                  <div className="flex flex-wrap gap-1">
                    {detectedDomains.length ? detectedDomains.map(d => (
                      <span key={d} className="font-mono text-[11px] text-sky-200 bg-sky-500/10 border border-sky-500/25 rounded px-1.5 py-0.5">{d}</span>
                    )) : <span className="text-[11px] text-slate-500">{selectedPath ? 'No supported domains detected.' : 'No project selected.'}</span>}
                  </div>
                </div>
                <div className="rounded border border-white/8 bg-black/25 p-3">
                  <div className="font-mono text-[11px] font-semibold text-slate-300 mb-2">Current Workspace</div>
                  <div className="text-[11px] text-slate-300 font-mono break-all">{workspace.name || 'Untitled workspace'}</div>
                  <div className="mt-2 text-[11px] text-slate-400">Loading a project creates a checkpoint before replacing this workspace.</div>
                </div>
              </div>
              <div className="p-3 border-t border-white/8 text-[11px] text-slate-400 flex items-start gap-2">
                <ShieldAlert className="w-3.5 h-3.5 text-yellow-500 shrink-0 mt-0.5" />
                <span>Project import is local and read-only until you explicitly compile or deploy.</span>
              </div>
            </aside>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0b0f16]">
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-6 text-center select-none cursor-pointer transition-all ${dragActive ? 'border-sky-500 bg-sky-500/10' : 'border-white/10 hover:border-sky-500/40 bg-black/25'}`}
            >
              <input type="file" id="import-file-picker" accept=".json,.xml" className="hidden" onChange={handleFileInput} />
              <label htmlFor="import-file-picker" className="cursor-pointer space-y-2 block">
                <Upload className="w-8 h-8 text-sky-400 mx-auto" />
                <div className="text-white text-xs font-mono font-medium">Drop one file here, or <span className="text-sky-400 underline">browse computer</span></div>
                <p className="text-[11px] text-slate-400 font-mono">Legacy path for workspace `.json` or individual Egosoft `.xml` files.</p>
              </label>
            </div>

            <div className="relative">
              <div className="flex items-center justify-between mb-1.5 font-mono">
                <div className="text-[11px] text-slate-300 font-semibold flex items-center gap-1">
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  Paste Raw Code
                </div>
                <div className="flex gap-2">
                  <button onClick={() => executeImport(importText, 'json')} className="px-2.5 py-1 rounded text-[11px] bg-indigo-600/20 text-indigo-300 border border-indigo-500/35 hover:bg-indigo-600/35 cursor-pointer transition-all flex items-center gap-1">
                    <FileJson className="w-3 h-3" />
                    Import JSON
                  </button>
                  <button onClick={() => executeImport(importText, 'xml')} className="px-2.5 py-1 rounded text-[11px] bg-sky-600/20 text-sky-300 border border-sky-500/35 hover:bg-sky-600/35 cursor-pointer transition-all flex items-center gap-1">
                    <FileCode className="w-3 h-3" />
                    Parse XML
                  </button>
                </div>
              </div>
              <textarea
                value={importText}
                onChange={e => setImportText(e.target.value)}
                placeholder="Paste workspace JSON or standard X4 MD script XML here..."
                className="w-full h-64 p-3 rounded-lg bg-black/60 border border-white/10 font-mono text-[11px] text-slate-300 focus:outline-none focus:border-sky-500 transition-all resize-none"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
