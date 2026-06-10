/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { 
  FolderGit2, 
  Layers, 
  Layout, 
  Settings, 
  Lightbulb, 
  Plus, 
  Sliders, 
  Wrench,
  Sparkles,
  Info,
  BookOpen,
  ChevronRight,
  Pin,
  Copy,
  Check,
  PackageCheck,
  Folder,
  HardDrive,
  GitBranch,
  GitCommit,
  Compass
} from 'lucide-react';
import { 
  NODE_TEMPLATES, 
  X4_FACTIONS, 
  X4_SHIP_MACROS, 
  X4_STATION_MACROS, 
  ModWorkspace, 
  MDNode, 
  UIWidget 
} from '../types';
import DirectoryExplorer from './DirectoryExplorer';
import { WIKI_TOPICS } from './WikiBrowser';
import SnapshotManager from './SnapshotManager';
import SourceControl from './SourceControl';
import CueViewer from './CueViewer';

interface SidebarProps {
  activeTab: 'script' | 'ui' | 'config' | 'filesystem' | 'git' | 'cues';
  setActiveTab: (tab: 'script' | 'ui' | 'config' | 'filesystem' | 'git' | 'cues') => void;
  workspace: ModWorkspace;
  setWorkspace: React.Dispatch<React.SetStateAction<ModWorkspace>>;
  onAddNode: (template: any) => void;
  onAddUIWidget: (type: string) => void;
  selectedNode: MDNode | null;
  setSelectedNode: React.Dispatch<React.SetStateAction<MDNode | null>>;
  selectedWidget: UIWidget | null;
  setSelectedWidget: React.Dispatch<React.SetStateAction<UIWidget | null>>;
  dirHandle: any | null;
  setDirHandle: (handle: any | null) => void;
  dirName: string;
  setDirName: (name: string) => void;
  fsHandle: any | null;
  setFsHandle: (handle: any | null) => void;
  fsName: string;
  setFsName: (name: string) => void;
  saveCheckpoint: (customTarget?: ModWorkspace) => void;
  workspaceView?: 'blueprint' | 'ui-designer' | 'aiscripts' | 'libraries' | 'xmlpatch' | 'translation' | 'wiki';
  setWorkspaceView?: (view: 'blueprint' | 'ui-designer' | 'aiscripts' | 'libraries' | 'xmlpatch' | 'translation' | 'wiki') => void;
  schemaTemplates?: Omit<MDNode, 'id' | 'x' | 'y'>[];
  onSchemaConfigChanged?: () => Promise<void> | void;
  onOpenEditorFile?: (file: {
    name: string;
    path: string;
    content: string;
    handle?: any;
    isMock?: boolean;
  }) => void;
  workspaceDirMode?: 'candy' | 'store';
  setWorkspaceDirMode?: (mode: 'candy' | 'store') => void;
  compileStatus?: 'idle' | 'compiling' | 'success' | 'error';
  compileMessage?: string;
  handleCompileModProject?: () => Promise<void>;
  handleLinkDirectory?: () => Promise<void>;
  visibleCueIds: string[] | null;
  setVisibleCueIds: (ids: string[] | null) => void;
  setFocusNodeRequest: (req: { nodeId: string; timestamp: number } | null) => void;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  workspace,
  setWorkspace,
  onAddNode,
  onAddUIWidget,
  selectedNode,
  setSelectedNode,
  selectedWidget,
  setSelectedWidget,
  dirHandle,
  setDirHandle,
  dirName,
  setDirName,
  fsHandle,
  setFsHandle,
  fsName,
  setFsName,
  saveCheckpoint,
  workspaceView,
  setWorkspaceView,
  schemaTemplates = [],
  onSchemaConfigChanged,
  onOpenEditorFile,
  workspaceDirMode = 'store',
  setWorkspaceDirMode,
  compileStatus = 'idle',
  compileMessage = '',
  handleCompileModProject,
  handleLinkDirectory,
  visibleCueIds,
  setVisibleCueIds,
  setFocusNodeRequest
}: SidebarProps) {
  const [nodeFilter, setNodeFilter] = useState<'all' | 'cue' | 'event' | 'condition' | 'action'>('all');
  const [schemaDir, setSchemaDir] = useState<string>('');
  const [sidebarCopied, setSidebarCopied] = useState<boolean>(false);
  const [schemaStatus, setSchemaStatus] = useState<{
    mdXsdPath?: string;
    commonXsdPath?: string;
    mdExists?: boolean;
    commonExists?: boolean;
    loaded?: boolean;
    counts?: { events: number; conditions: number; actions: number; control_flow: number };
    error?: string;
  }>({});
  const [schemaMessage, setSchemaMessage] = useState<string>('');
  const [schemaMessageType, setSchemaMessageType] = useState<'success' | 'error'>('success');
  const [savingSchema, setSavingSchema] = useState<boolean>(false);

  const allTemplates = React.useMemo(() => {
    const byTag = new Map<string, Omit<MDNode, 'id' | 'x' | 'y'>>();
    NODE_TEMPLATES.forEach(template => byTag.set(template.xmlTag, template));
    schemaTemplates.forEach(template => {
      if (!byTag.has(template.xmlTag)) byTag.set(template.xmlTag, template);
    });
    return Array.from(byTag.values());
  }, [schemaTemplates]);

  const filteredTemplates = allTemplates.filter(
    t => nodeFilter === 'all' || t.type === nodeFilter
  );

  const loadSchemaConfig = React.useCallback(async () => {
    try {
      const response = await fetch('/api/schema/config');
      if (!response.ok) throw new Error('Schema config endpoint unavailable');
      const data = await response.json();
      setSchemaDir(data.resolved?.schemaDir || '');
      setSchemaStatus({
        mdXsdPath: data.resolved?.mdXsdPath,
        commonXsdPath: data.resolved?.commonXsdPath,
        mdExists: data.resolved?.mdExists,
        commonExists: data.resolved?.commonExists,
        loaded: data.loaded,
        counts: data.schema_counts,
        error: data.error
      });
      setSchemaMessage('');
      setSchemaMessageType('success');
    } catch (error: any) {
      setSchemaMessage(error.message || 'Failed to load schema settings.');
      setSchemaMessageType('error');
    }
  }, []);

  useEffect(() => {
    loadSchemaConfig();
  }, [loadSchemaConfig]);

  const saveSchemaConfig = async () => {
    setSavingSchema(true);
    setSchemaMessage('');
    try {
      const response = await fetch('/api/schema/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schemaDir })
      });
      const data = await response.json();
      if (!response.ok) {
        setSchemaStatus(prev => ({
          ...prev,
          mdXsdPath: data.resolved?.mdXsdPath,
          commonXsdPath: data.resolved?.commonXsdPath,
          mdExists: data.resolved?.mdExists,
          commonExists: data.resolved?.commonExists
        }));
        throw new Error(data.error || 'Failed to save schema settings.');
      }

      setSchemaStatus({
        mdXsdPath: data.resolved?.mdXsdPath,
        commonXsdPath: data.resolved?.commonXsdPath,
        mdExists: data.resolved?.mdExists,
        commonExists: data.resolved?.commonExists,
        loaded: data.loaded,
        counts: data.schema_counts,
        error: data.error
      });
      setSchemaMessage(data.loaded ? 'Schema library reloaded.' : data.error || 'Schema settings saved, but library did not load.');
      setSchemaMessageType(data.loaded ? 'success' : 'error');
      await onSchemaConfigChanged?.();
    } catch (error: any) {
      setSchemaMessage(error.message || 'Failed to save schema settings.');
      setSchemaMessageType('error');
    } finally {
      setSavingSchema(false);
    }
  };

  // Property editor change handling
  const handlePropChange = (key: string, value: any) => {
    if (selectedNode) {
      setWorkspace(prev => ({
        ...prev,
        nodes: prev.nodes.map(n => 
          n.id === selectedNode.id 
            ? { ...n, properties: { ...n.properties, [key]: value } }
            : n
        )
      }));
      // Update selected node state to sync preview
      setSelectedNode(prev => prev ? { ...prev, properties: { ...prev.properties, [key]: value } } : null);
    } else if (selectedWidget) {
      setWorkspace(prev => ({
        ...prev,
        uiWidgets: prev.uiWidgets.map(w => 
          w.id === selectedWidget.id 
            ? { ...w, properties: { ...w.properties, [key]: value } }
            : w
        )
      }));
      // Update selected widget state to sync preview
      setSelectedWidget(prev => prev ? { ...prev, properties: { ...prev.properties, [key]: value } } : null);
    }
  };

  const handleLabelChange = (newLabel: string) => {
    if (selectedNode) {
      setWorkspace(prev => ({
        ...prev,
        nodes: prev.nodes.map(n => 
          n.id === selectedNode.id ? { ...n, label: newLabel } : n
        )
      }));
      setSelectedNode(prev => prev ? { ...prev, label: newLabel } : null);
    } else if (selectedWidget) {
      setWorkspace(prev => ({
        ...prev,
        uiWidgets: prev.uiWidgets.map(w => 
          w.id === selectedWidget.id ? { ...w, label: newLabel } : w
        )
      }));
      setSelectedWidget(prev => prev ? { ...prev, label: newLabel } : null);
    }
  };

  return (
    <div id="side_panel" className="w-80 border-r border-white/5 bg-[#12141a] flex flex-col h-full text-slate-300">
      {/* Category Tabs */}
      <div className="flex border-b border-white/10 bg-[#161920]/40">
        <button
          id="tab_script"
          onClick={() => setActiveTab('script')}
          className={`flex-1 py-3 text-[10px] font-mono font-bold tracking-tight border-b-2 flex flex-col items-center gap-1 transition-all cursor-pointer ${
            activeTab === 'script'
              ? 'border-cyan-500 text-white bg-cyan-600/10'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <Layers className="w-4 h-4" />
          MD NODES
        </button>
        <button
          id="tab_cues"
          onClick={() => setActiveTab('cues')}
          className={`flex-1 py-3 text-[10px] font-mono font-bold tracking-tight border-b-2 flex flex-col items-center gap-1 transition-all cursor-pointer ${
            activeTab === 'cues'
              ? 'border-cyan-500 text-white bg-cyan-600/10'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          CUES
        </button>
        <button
          id="tab_ui"
          onClick={() => setActiveTab('ui')}
          className={`flex-1 py-3 text-[10px] font-mono font-bold tracking-tight border-b-2 flex flex-col items-center gap-1 transition-all cursor-pointer ${
            activeTab === 'ui'
              ? 'border-cyan-500 text-white bg-cyan-600/10'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <Layout className="w-4 h-4" />
          MENU WIDGETS
        </button>
        <button
          id="tab_config"
          onClick={() => setActiveTab('config')}
          className={`flex-1 py-3 text-[10px] font-mono font-bold tracking-tight border-b-2 flex flex-col items-center gap-1 transition-all cursor-pointer ${
            activeTab === 'config'
              ? 'border-cyan-500 text-white bg-cyan-600/10'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <Settings className="w-4 h-4" />
          MOD META
        </button>
        <button
          id="tab_filesystem"
          onClick={() => setActiveTab('filesystem')}
          className={`flex-1 py-3 text-[10px] font-mono font-bold tracking-tighter border-b-2 flex flex-col items-center gap-1 transition-all cursor-pointer ${
            activeTab === 'filesystem'
              ? 'border-cyan-500 text-white bg-cyan-600/10'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <FolderGit2 className="w-3.5 h-3.5" />
          FILESYSTEM
        </button>
        <button
          id="tab_git"
          onClick={() => setActiveTab('git')}
          className={`flex-1 py-3 text-[10px] font-mono font-bold tracking-tighter border-b-2 flex flex-col items-center gap-1 transition-all cursor-pointer ${
            activeTab === 'git'
              ? 'border-cyan-500 text-white bg-cyan-600/10'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <GitBranch className="w-3.5 h-3.5 text-cyan-400" />
          SOURCE
        </button>
      </div>

      {/* Main Content Pane */}
      <div className={`flex-1 overflow-y-auto ${activeTab === 'filesystem' || activeTab === 'git' || activeTab === 'cues' ? 'p-0' : 'p-4 space-y-4'}`}>
        {activeTab === 'cues' && (
          <CueViewer
            workspace={workspace}
            selectedNode={selectedNode}
            setSelectedNode={setSelectedNode}
            setFocusNodeRequest={setFocusNodeRequest}
            visibleCueIds={visibleCueIds}
            setVisibleCueIds={setVisibleCueIds}
          />
        )}

        {activeTab === 'filesystem' && (
          <DirectoryExplorer
            dirHandle={dirHandle}
            setDirHandle={setDirHandle}
            dirName={dirName}
            setDirName={setDirName}
            fsHandle={fsHandle}
            setFsHandle={setFsHandle}
            fsName={fsName}
            setFsName={setFsName}
            workspace={workspace}
            setWorkspace={setWorkspace}
            saveCheckpoint={saveCheckpoint}
            workspaceView={workspaceView}
            setWorkspaceView={setWorkspaceView}
            onOpenEditorFile={onOpenEditorFile}
          />
        )}

        {activeTab === 'git' && (
          <SourceControl
            workspace={workspace}
            setWorkspace={setWorkspace}
            onOpenEditorFile={onOpenEditorFile}
            saveCheckpoint={saveCheckpoint}
            setWorkspaceView={setWorkspaceView}
          />
        )}

        {/* NODE COMPONENT LIBRARY LIST (Tab: script) */}
        {activeTab === 'script' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-mono font-semibold text-cyan-400 mb-2 tracking-wider uppercase">Node Types</h3>
              <div className="grid grid-cols-2 gap-1 bg-black/20 p-1 rounded border border-white/5">
                {(['all', 'cue', 'event', 'condition', 'action'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setNodeFilter(type)}
                    className={`px-2 py-1 text-[10px] font-mono rounded capitalize transition-all cursor-pointer ${
                      nodeFilter === type
                        ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/30'
                        : 'text-slate-400 hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-mono font-semibold text-slate-400 mb-2 tracking-wider uppercase flex items-center gap-1">
                <Wrench className="w-3 h-3 text-cyan-400" />
                TOOLBOX (CLICK TO CREATE)
              </h3>
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {filteredTemplates.map((template, idx) => {
                  let badgeColors = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
                  if (template.type === 'cue') badgeColors = 'bg-purple-500/10 text-purple-400 border-purple-500/20';
                  if (template.type === 'event') badgeColors = 'bg-amber-500/10 text-amber-400 border-amber-500/30';
                  if (template.type === 'condition') badgeColors = 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
                  if (template.type === 'action') badgeColors = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';

                  return (
                    <button
                      key={idx}
                      onClick={() => onAddNode(template)}
                      className="w-full text-left p-2 rounded bg-[#1c1f26] border border-white/5 hover:border-cyan-500/50 transition-all flex items-center justify-between group cursor-pointer"
                    >
                      <div>
                        <div className="text-xs font-medium text-slate-200 group-hover:text-white transition-colors">
                          {template.label}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          &lt;{template.xmlTag}&gt;
                        </div>
                      </div>
                      <span className={`text-[9px] font-mono border px-1.5 py-0.5 rounded ${badgeColors}`}>
                        {template.type.toUpperCase()}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* UI MOD CUSTOMIZER WIDGETS (Tab: ui) */}
        {activeTab === 'ui' && (
          <div className="space-y-4">
            <div className="bg-cyan-900/10 border border-cyan-500/20 p-3 rounded text-[11px] leading-relaxed text-slate-400">
              <span className="text-cyan-400 font-semibold block mb-1">X4 Custom UI Rules:</span>
              Design working contextual HUD menus or consoles. Add containers, tables, lists, progress bars and macro buttons. Widgets are fully interactive on the terminal.
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-mono font-semibold text-slate-400 mb-2 tracking-wider uppercase">UI Widgets Library</h3>
              {[
                { type: 'window', title: 'Context Window Frame', desc: 'Outer widget window layout container' },
                { type: 'header', title: 'Tactical Title / Header', desc: 'Wide high-contrast cyber text decoration line' },
                { type: 'table', title: 'Standard Data Table', desc: 'Pre-styled multi-row grid framework' },
                { type: 'button', title: 'Macro Menu Button', desc: 'Fires visual cues on selection click' },
                { type: 'progressbar', title: 'Status Progress Bar', desc: 'Elegant status / shield indicator' },
                { type: 'text', title: 'Display Label', desc: 'Human-readable description labels' },
                { type: 'dropdown', title: 'Interactive Selector', desc: 'Drop-down values list widget' },
                { type: 'input', title: 'Text Input Box', desc: 'Custom command or log entry text field' },
                { type: 'chat', title: 'Dialogue Chat Logs', desc: 'Scrollable live dialogue transmissions list' }
              ].map(widget => (
                <button
                  key={widget.type}
                  onClick={() => onAddUIWidget(widget.type)}
                  className="w-full text-left p-2.5 rounded bg-[#1c1f26] border border-white/5 hover:bg-cyan-600/10 hover:border-cyan-500/50 transition-all flex items-center justify-between group cursor-pointer"
                >
                  <div>
                    <div className="text-xs font-medium text-slate-200 group-hover:text-white capitalize">
                      {widget.title}
                    </div>
                    <div className="text-[9px] text-slate-500 font-mono mt-0.5">
                      {widget.desc}
                    </div>
                  </div>
                  <Plus className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* METADATA CONFIG (Tab: config) */}
        {activeTab === 'config' && (
          <div className="space-y-4 font-mono text-xs">
            <div className="space-y-3">
              <div>
                <label className="text-slate-400 block mb-1 uppercase text-[10px] tracking-wider">Mod Script Identifier</label>
                <input
                  type="text"
                  value={workspace.name}
                  onChange={e => setWorkspace(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full p-2 rounded bg-black/50 border border-white/10 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                  placeholder="e.g. My_Elite_Mod"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 uppercase text-[10px] tracking-wider">Version String</label>
                <input
                  type="text"
                  value={workspace.version}
                  onChange={e => setWorkspace(prev => ({ ...prev, version: e.target.value }))}
                  className="w-full p-2 rounded bg-black/50 border border-white/10 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                  placeholder="e.g. 1.0.0"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 uppercase text-[10px] tracking-wider">Author Name</label>
                <input
                  type="text"
                  value={workspace.author}
                  onChange={e => setWorkspace(prev => ({ ...prev, author: e.target.value }))}
                  className="w-full p-2 rounded bg-black/50 border border-white/10 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                  placeholder="Your Name"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 uppercase text-[10px] tracking-wider">Mod Description</label>
                <textarea
                  value={workspace.description}
                  onChange={e => setWorkspace(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full p-2 h-20 rounded bg-black/50 border border-white/10 text-white focus:outline-none focus:border-cyan-500 transition-colors resize-none"
                  placeholder="Mod brief synopsis..."
                />
              </div>
            </div>

            <div className="border-t border-white/10 pt-4 space-y-3">
              <h3 className="text-xs font-mono font-semibold text-cyan-400 tracking-wider uppercase flex items-center gap-1.5">
                <Settings className="w-3.5 h-3.5" />
                XSD Schema Source
              </h3>

              <div>
                <label className="text-slate-400 block mb-1 uppercase text-[10px] tracking-wider">Schema Directory</label>
                <input
                  type="text"
                  value={schemaDir}
                  onChange={e => setSchemaDir(e.target.value)}
                  className="w-full p-2 rounded bg-black/50 border border-white/10 text-white focus:outline-none focus:border-cyan-500 transition-colors font-mono text-[10px]"
                  placeholder="Folder containing md.xsd and common.xsd"
                />
              </div>

              <div className="space-y-1.5 rounded bg-black/30 border border-white/10 p-2 text-[10px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 uppercase">md.xsd</span>
                  <span className={schemaStatus.mdExists ? 'text-emerald-400' : 'text-red-400'}>
                    {schemaStatus.mdExists ? 'found' : 'missing'}
                  </span>
                </div>
                <div className="text-slate-400 break-all">{schemaStatus.mdXsdPath || 'Not resolved'}</div>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/5">
                  <span className="text-slate-500 uppercase">common.xsd</span>
                  <span className={schemaStatus.commonExists ? 'text-emerald-400' : 'text-red-400'}>
                    {schemaStatus.commonExists ? 'found' : 'missing'}
                  </span>
                </div>
                <div className="text-slate-400 break-all">{schemaStatus.commonXsdPath || 'Not resolved'}</div>
              </div>

              {schemaStatus.counts && (
                <div className="grid grid-cols-2 gap-1 text-[10px]">
                  <div className="bg-black/30 border border-white/10 rounded p-1.5">
                    <span className="text-slate-500 uppercase block">Events</span>
                    <span className="text-white">{schemaStatus.counts.events}</span>
                  </div>
                  <div className="bg-black/30 border border-white/10 rounded p-1.5">
                    <span className="text-slate-500 uppercase block">Actions</span>
                    <span className="text-white">{schemaStatus.counts.actions}</span>
                  </div>
                  <div className="bg-black/30 border border-white/10 rounded p-1.5">
                    <span className="text-slate-500 uppercase block">Conditions</span>
                    <span className="text-white">{schemaStatus.counts.conditions}</span>
                  </div>
                  <div className="bg-black/30 border border-white/10 rounded p-1.5">
                    <span className="text-slate-500 uppercase block">Control</span>
                    <span className="text-white">{schemaStatus.counts.control_flow}</span>
                  </div>
                </div>
              )}

              <button
                onClick={saveSchemaConfig}
                disabled={savingSchema}
                className="w-full px-3 py-2 rounded bg-cyan-600/20 border border-cyan-500/30 text-cyan-200 hover:bg-cyan-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-bold uppercase text-[10px] tracking-wider"
              >
                {savingSchema ? 'Reloading Schema...' : 'Save Schema Directory'}
              </button>

              {(schemaMessage || schemaStatus.error) && (
                <div className={`text-[10px] leading-relaxed rounded border p-2 ${
                  schemaMessageType === 'success' && !schemaStatus.error
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                    : 'bg-red-500/10 border-red-500/20 text-red-300'
                }`}>
                  {schemaMessage || schemaStatus.error}
                </div>
              )}
            </div>

            {/* EXTENSION COMPILER & WORKSPACE STAGING */}
            <div className="border-t border-white/10 pt-4 space-y-3">
              <h3 className="text-xs font-mono font-semibold text-cyan-400 tracking-wider uppercase flex items-center gap-1.5">
                <PackageCheck className="w-3.5 h-3.5" />
                Extension Package Compiler
              </h3>

              {/* Local Directory Link state */}
              {dirHandle ? (
                <div className="space-y-3">
                  <div className="p-2 rounded bg-emerald-500/5 border border-emerald-500/20 text-[10px] space-y-1">
                    <div className="flex items-center justify-between text-slate-400 font-bold uppercase text-[9px]">
                      <span>Connected Folder</span>
                      <span className="text-emerald-400 flex items-center gap-0.5 font-bold uppercase text-[8px] animate-pulse">● Connected</span>
                    </div>
                    <div className="text-white break-all flex items-center gap-1 text-[10px]">
                      <Folder className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                      {dirName}
                    </div>
                  </div>

                  {/* Candy Store mapping Mode Choice: Candy vs Candy Store */}
                  <div>
                    <label className="text-slate-400 block mb-1 uppercase text-[9px] tracking-wider flex items-center gap-1">
                      <HardDrive className="w-3 h-3 text-cyan-400" />
                      Staging Directory Type
                    </label>
                    <select
                      value={workspaceDirMode}
                      onChange={(e) => {
                        const val = e.target.value as 'candy' | 'store';
                        if (setWorkspaceDirMode) setWorkspaceDirMode(val);
                        localStorage.setItem('x4_workspace_dir_mode', val);
                      }}
                      className="w-full bg-[#0F1115] border border-white/10 p-1.5 rounded text-[10px] font-mono text-slate-300 focus:outline-none focus:border-cyan-500 cursor-pointer"
                    >
                      <option value="store">Generic Extensions Folder ("Candy Store")</option>
                      <option value="candy">Direct Mod Folder ("Candy Itself")</option>
                    </select>
                    <p className="text-[9px] text-slate-500 leading-normal mt-1 italic">
                      {workspaceDirMode === 'store' 
                        ? 'Stages files in extensions/ folder inside a subdirectory named after your mod.' 
                        : 'Writes files (content.xml, md/, etc) directly inside connected directory.'}
                    </p>
                  </div>

                  {/* Trigger compiler button */}
                  <button
                    onClick={handleCompileModProject}
                    disabled={compileStatus === 'compiling'}
                    className="w-full py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-black font-mono font-bold text-[10px] rounded transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed uppercase shadow shadow-emerald-500/25 shrink-0"
                  >
                    <PackageCheck className={`w-4 h-4 ${compileStatus === 'compiling' ? 'animate-pulse' : ''}`} />
                    Compile Mod Extension
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <button
                    onClick={handleLinkDirectory}
                    className="w-full py-2 bg-cyan-600/10 border border-cyan-500/30 hover:bg-cyan-600/20 text-cyan-400 hover:text-white rounded font-mono text-[10px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Folder className="w-4 h-4" />
                    LINK LOCAL FOLDER HANDLE
                  </button>
                  <p className="text-[9.5px] text-slate-500 leading-relaxed italic">
                    Connect local Extensions directory to write mod files directly to your computer.
                  </p>
                </div>
              )}

              {/* Compile results log notification */}
              {compileMessage && (
                <div className={`p-2 rounded border font-mono text-[9.5px] ${
                  compileStatus === 'error'
                    ? 'bg-red-500/10 border-red-500/20 text-red-300'
                    : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                }`}>
                  {compileMessage}
                </div>
              )}
            </div>

            {/* PERSISTENT HISTORICAL SNAPSHOTS */}
            <SnapshotManager
              workspace={workspace}
              setWorkspace={setWorkspace}
              saveCheckpoint={saveCheckpoint}
            />
          </div>
        )}

        {/* COMPONENT INSPECTOR OR PROPERTY VIEWER PANEL */}
        {(selectedNode || selectedWidget) && (
          <div className="border-t border-white/10 pt-4 mt-2">
            <h3 className="text-xs font-mono font-semibold text-cyan-400 mb-3 tracking-wider uppercase flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" />
              PROPERTIES INSPECTOR
            </h3>

            <div className="space-y-3 bg-[#0F1115] p-3 rounded border border-white/10 font-mono text-[11px]">
              <div>
                <label className="text-slate-400 block mb-1 font-semibold uppercase text-[9px] tracking-wider">Display Label</label>
                <input
                  type="text"
                  value={selectedNode ? selectedNode.label : (selectedWidget ? selectedWidget.label : '')}
                  onChange={e => handleLabelChange(e.target.value)}
                  className="w-full p-1.5 rounded bg-black/60 border border-white/10 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              {selectedNode && (selectedNode.propertiesSchema || []).map(schema => (
                <div key={schema.key}>
                  <label className="text-slate-400 block mb-1 uppercase text-[9px] tracking-wider flex items-center justify-between">
                    <span>{schema.label}</span>
                    {schema.description && (
                      <span className="group relative cursor-pointer ml-1">
                        <Info className="w-3 h-3 text-slate-500 hover:text-slate-300" />
                        <span className="hidden group-hover:block absolute right-0 bottom-4 w-44 bg-slate-900 border border-white/10 text-[9px] p-1.5 rounded shadow z-50 normal-case font-sans">
                          {schema.description}
                        </span>
                      </span>
                    )}
                  </label>

                  {schema.type === 'text' && (
                    <input
                      type="text"
                      value={(selectedNode.properties || {})[schema.key] || ''}
                      onChange={e => handlePropChange(schema.key, e.target.value)}
                      placeholder={schema.placeholder}
                      className="w-full p-1.5 rounded bg-black/60 border border-white/10 text-white focus:outline-none focus:border-cyan-500"
                    />
                  )}

                  {schema.type === 'textarea' && (
                    <textarea
                      value={(selectedNode.properties || {})[schema.key] || ''}
                      onChange={e => handlePropChange(schema.key, e.target.value)}
                      placeholder={schema.placeholder}
                      rows={6}
                      className="w-full p-1.5 rounded bg-black/60 border border-white/10 text-white font-mono text-[10px] leading-relaxed focus:outline-none focus:border-cyan-500 resize-y"
                    />
                  )}

                  {schema.type === 'number' && (
                    <input
                      type="number"
                      value={(selectedNode.properties || {})[schema.key] || ''}
                      onChange={e => handlePropChange(schema.key, Number(e.target.value))}
                      placeholder={schema.placeholder}
                      className="w-full p-1.5 rounded bg-black/60 border border-white/10 text-white focus:outline-none focus:border-cyan-500"
                    />
                  )}

                  {schema.type === 'select' && schema.options && (
                    <select
                      value={(selectedNode.properties || {})[schema.key] || ''}
                      onChange={e => handlePropChange(schema.key, e.target.value)}
                      className="w-full p-1.5 rounded bg-black/60 border border-white/10 text-white focus:outline-none focus:border-cyan-500"
                    >
                      {schema.options.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  )}

                  {schema.type === 'boolean' && (
                    <label className="flex items-center gap-2 text-slate-300 bg-black/40 border border-white/10 rounded px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={String((selectedNode.properties || {})[schema.key] || 'false') === 'true'}
                        onChange={e => handlePropChange(schema.key, e.target.checked ? 'true' : 'false')}
                        className="accent-cyan-500"
                      />
                      <span className="text-[10px] uppercase tracking-wider">{schema.key}</span>
                    </label>
                  )}

                  {schema.type === 'coordinates' && (
                    <input
                      type="text"
                      value={(selectedNode.properties || {})[schema.key] || ''}
                      onChange={e => handlePropChange(schema.key, e.target.value)}
                      placeholder="X,Y,Z offset"
                      className="w-full p-1.5 rounded bg-black/60 border border-white/10 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                    />
                  )}
                </div>
              ))}

              {/* Sticky-note annotations comment box */}
              {selectedNode && (
                <div className="border-t border-amber-500/15 pt-3 mt-3 bg-amber-500/5 p-2 rounded border border-amber-500/20">
                  <label className="text-amber-400 font-bold block mb-1 uppercase text-[9px] tracking-wider flex items-center gap-1 leading-none select-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    STICKY-NOTE COMMENT / ANNOTATION
                  </label>
                  <textarea
                    value={selectedNode.comment || ''}
                    onChange={e => {
                      const text = e.target.value;
                      saveCheckpoint();
                      setWorkspace(prev => ({
                        ...prev,
                        nodes: prev.nodes.map(n => n.id === selectedNode.id ? { ...n, comment: text } : n)
                      }));
                      setSelectedNode(prev => prev && prev.id === selectedNode.id ? { ...prev, comment: text } : prev);
                    }}
                    placeholder="Attach an interactive yellow sticky-note annotation beside this node on the canvas layout..."
                    rows={4}
                    className="w-full p-2 rounded bg-black/60 border border-amber-500/25 text-slate-200 font-sans text-[10.5px] leading-relaxed focus:outline-none focus:border-amber-400 placeholder-amber-400/20 resize-none text-left"
                  />
                  <p className="text-[8.5px] text-amber-500/80 italic leading-tight mt-1 select-none">
                    Attaches a floating sticky-note document to this mission step on the canvas graph.
                  </p>
                </div>
              )}

              {selectedWidget && (
                <div className="space-y-3">
                  {selectedWidget.type === 'progressbar' && (
                    <div>
                      <label className="text-slate-400 block mb-1 uppercase text-[9px] tracking-wider">Progress Value (%)</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={selectedWidget.properties.value || 75}
                        onChange={e => handlePropChange('value', Number(e.target.value))}
                        className="w-full accent-cyan-500"
                      />
                    </div>
                  )}

                  {selectedWidget.type === 'button' && (
                    <>
                      <div>
                        <label className="text-slate-400 block mb-1 uppercase text-[9px] tracking-wider">Interaction Command</label>
                        <select
                          value={selectedWidget.properties.action || 'signal_cue'}
                          onChange={e => handlePropChange('action', e.target.value)}
                          className="w-full p-1.5 rounded bg-black/60 border border-white/10 text-white focus:outline-none focus:border-cyan-500"
                        >
                          <option value="signal_cue">Signal Mission Cue</option>
                          <option value="dismiss">Dismiss Pilots</option>
                          <option value="standing">Raise standing rep</option>
                          <option value="claim">Claim rewards</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-slate-400 block mb-1 uppercase text-[9px] tracking-wider">Target Cue ID</label>
                        <input
                          type="text"
                          value={selectedWidget.properties.targetCue || 'MyMissionCue'}
                          onChange={e => handlePropChange('targetCue', e.target.value)}
                          className="w-full p-1.5 rounded bg-black/60 border border-white/10 text-white focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                    </>
                  )}

                  {selectedWidget.type === 'input' && (
                    <div>
                      <label className="text-slate-400 block mb-1 uppercase text-[9px] tracking-wider">Input Placeholder Text</label>
                      <input
                        type="text"
                        value={selectedWidget.properties.placeholder || 'Type transmission command...'}
                        onChange={e => handlePropChange('placeholder', e.target.value)}
                        className="w-full p-1.5 rounded bg-black/60 border border-white/10 text-white focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  )}

                  {selectedWidget.type === 'chat' && (
                    <div>
                      <label className="text-slate-400 block mb-1 uppercase text-[9px] tracking-wider">Simulated Log Lines (Comma Separated)</label>
                      <textarea
                        value={(selectedWidget.properties.messages || []).join('\n')}
                        onChange={e => handlePropChange('messages', e.target.value.split('\n'))}
                        rows={4}
                        className="w-full p-1.5 font-mono text-[10px] rounded bg-black/60 border border-white/10 text-white focus:outline-none focus:border-cyan-500 resize-none"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Pinned Wiki Documentation Section inside Selected Node Property Inspector */}
              {selectedNode && selectedNode.properties?.pinnedArticleId && (
                <div className="mt-4 border-t border-white/10 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-amber-400 font-mono font-bold tracking-wider uppercase flex items-center gap-1.5 leading-none">
                      <Pin className="w-3 h-3 rotate-45 text-amber-500 fill-amber-500/20" />
                      PINNED CODEX REFERENCE
                    </span>
                    <button
                      onClick={() => {
                        setWorkspace(prev => ({
                          ...prev,
                          nodes: prev.nodes.map(n => 
                            n.id === selectedNode.id 
                              ? { ...n, properties: { ...n.properties, pinnedArticleId: null } }
                              : n
                          )
                        }));
                        setSelectedNode(prev => prev ? { ...prev, properties: { ...prev.properties, pinnedArticleId: null } } : null);
                      }}
                      className="text-[9px] text-red-400 hover:text-red-300 font-mono transition-colors uppercase outline-none font-semibold cursor-pointer"
                    >
                      Unpin Reference
                    </button>
                  </div>
                  
                  {(() => {
                    const article = WIKI_TOPICS.find(t => t.id === selectedNode.properties.pinnedArticleId);
                    if (!article) return <div className="text-[10px] text-slate-500 italic">Pinned reference guide not found.</div>;
                    return (
                      <div className="bg-[#141822] border border-amber-500/20 hover:border-amber-500/40 rounded-lg p-3 space-y-2.5 transition-all text-left">
                        <div className="font-bold text-white text-[11px] leading-snug">{article.title}</div>
                        <p className="text-[10px] text-slate-400 font-sans line-clamp-3 leading-relaxed">{article.summary}</p>
                        
                        {article.codeTemplate && (
                          <div className="mt-2 border-t border-white/[0.03] pt-2">
                            <span className="text-[9px] text-slate-500 font-mono uppercase tracking-widest block mb-1">Snippet Preview:</span>
                            <pre className="text-[9.5px] text-cyan-400/90 font-mono whitespace-pre-wrap leading-tight bg-black/40 p-2 rounded border border-white/[0.02] max-h-24 overflow-y-auto custom-scrollbar">
                              {article.codeTemplate}
                            </pre>
                          </div>
                        )}

                        <div className="flex items-center gap-2 pt-1 border-t border-white/[0.03]">
                          <button
                            onClick={() => {
                              if (setWorkspaceView) {
                                setWorkspaceView('wiki');
                                window.location.hash = `article_${article.id}`;
                              }
                            }}
                            className="bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 px-2 py-1 rounded text-[9.5px] font-mono font-bold uppercase flex items-center gap-1 transition-colors outline-none cursor-pointer"
                          >
                            READ CODEX
                            <ChevronRight className="w-3 h-3" />
                          </button>
                          {article.codeTemplate && (
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(article.codeTemplate || '');
                                setSidebarCopied(true);
                                setTimeout(() => setSidebarCopied(false), 2000);
                              }}
                              className="bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-cyan-400 px-2 py-1 rounded text-[9.5px] font-mono font-bold uppercase flex items-center gap-1 ml-auto transition-colors outline-none cursor-pointer"
                            >
                              {sidebarCopied ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span>COPIED!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>COPY CODE</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer System Credits */}
      <div className="p-3 border-t border-white/5 bg-black/45 text-center text-[10px] font-mono text-slate-500">
        Engine Context: Egosoft MD 4.5
      </div>
    </div>
  );
}
