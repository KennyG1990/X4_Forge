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
  Compass,
  Library,
  Trash2,
  Activity,
  Brain,
  Terminal,
  Database
} from 'lucide-react';
import { 
  NODE_TEMPLATES, 
  X4_FACTIONS, 
  X4_SHIP_MACROS, 
  X4_STATION_MACROS, 
  ModWorkspace, 
  MDNode, 
  UIWidget,
  ChatMessage,
  PackageDiagnostic
} from '../types';
import DirectoryExplorer from './DirectoryExplorer';
import DiagnosticsHub from './DiagnosticsHub';
import PackageModDoctor from './PackageModDoctor';
import { WIKI_TOPICS } from './WikiBrowser';
import SnapshotManager from './SnapshotManager';
import SourceControl from './SourceControl';
import ErrorBoundary from './ErrorBoundary';
import CueViewer from './CueViewer';
import AIHelper from './AIHelper';
import ObjectBrowser from './ObjectBrowser';

interface SidebarProps {
  width?: number;
  activeTab: 'script' | 'ui' | 'config' | 'filesystem' | 'git' | 'cues' | 'templates' | 'ai' | 'diagnostics' | 'mdscanner' | 'playtest' | 'reference';
  setActiveTab: (tab: 'script' | 'ui' | 'config' | 'filesystem' | 'git' | 'cues' | 'templates' | 'ai' | 'diagnostics' | 'mdscanner' | 'playtest' | 'reference') => void;
  workspace: ModWorkspace;
  setWorkspace: React.Dispatch<React.SetStateAction<ModWorkspace>>;
  onAddNode: (template: any) => void;
  onAddUIWidget: (type: string) => void;
  selectedNode: MDNode | null;
  setSelectedNode: React.Dispatch<React.SetStateAction<MDNode | null>>;
  selectedWidget: UIWidget | null;
  setSelectedWidget: React.Dispatch<React.SetStateAction<UIWidget | null>>;
  modWorkspacePath: string;
  filesystemPath: string;
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
    isSaved?: boolean;
  }) => void;
  workspaceDirMode?: 'candy' | 'store';
  setWorkspaceDirMode?: (mode: 'candy' | 'store') => void;
  compileStatus?: 'idle' | 'compiling' | 'success' | 'error';
  compileMessage?: string;
  handleCompileModProject?: () => Promise<void>;
  visibleCueIds: string[] | null;
  setVisibleCueIds: (ids: string[] | null) => void;
  setFocusNodeRequest: (req: { nodeId: string; timestamp: number } | null) => void;
  
  // AI Guide Shared State & Handlers
  aiChatHistory: ChatMessage[];
  setAiChatHistory: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  aiInputText: string;
  setAiInputText: (text: string) => void;
  aiActiveMode: 'chat' | 'builder';
  setAiActiveMode: (mode: 'chat' | 'builder') => void;
  aiLoading: boolean;
  aiErrorText: string | null;
  isAiFloatingVisible: boolean;
  setIsAiFloatingVisible: (visible: boolean) => void;
  isAiFloatingOpen: boolean;
  setIsAiFloatingOpen: (open: boolean) => void;
  handleSend: (text: string) => void;
  handleApplyAction: (index: number, msg: ChatMessage) => void;
  handleDeclineAction: (index: number) => void;

  diagnostics: PackageDiagnostic[];
  diagnosticSource: 'checking' | 'package' | 'local';
  onSelectSnapshot?: (snapWS: ModWorkspace | null) => void;
}

export default function Sidebar({
  width,
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
  modWorkspacePath,
  filesystemPath,
  saveCheckpoint,
  workspaceView,
  setWorkspaceView,
  schemaTemplates,
  onSchemaConfigChanged,
  onOpenEditorFile,
  workspaceDirMode,
  setWorkspaceDirMode,
  compileStatus,
  compileMessage,
  handleCompileModProject,
  visibleCueIds,
  setVisibleCueIds,
  setFocusNodeRequest,
  aiChatHistory,
  setAiChatHistory,
  aiInputText,
  setAiInputText,
  aiActiveMode,
  setAiActiveMode,
  aiLoading,
  aiErrorText,
  isAiFloatingVisible,
  setIsAiFloatingVisible,
  isAiFloatingOpen,
  setIsAiFloatingOpen,
  handleSend,
  handleApplyAction,
  handleDeclineAction,
  diagnostics,
  diagnosticSource,
  onSelectSnapshot
}: SidebarProps) {
  const [nodeFilter, setNodeFilter] = useState<'all' | 'cue' | 'event' | 'condition' | 'action'>('all');
  const [schemaDir, setSchemaDir] = useState<string>('');
  const [sidebarCopied, setSidebarCopied] = useState<boolean>(false);
  
  // Custom templates tab sidebar states
  const [newTemplateName, setNewTemplateName] = useState<string>('New Custom Blueprint');
  const [newTemplateTypeIdx, setNewTemplateTypeIdx] = useState<number>(0);
  const [editedTemplateId, setEditedTemplateId] = useState<string | null>(null);
  const [editedTemplateLabel, setEditedTemplateLabel] = useState<string>('');
  const [editedTemplateXmlTag, setEditedTemplateXmlTag] = useState<string>('');
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

  const compileSettings = workspace.compileSettings || {
    md: true,
    ui: true,
    ai: true,
    library: true,
    translations: true,
    patches: true
  };

  const handleToggleCompileSetting = (key: 'md' | 'ui' | 'ai' | 'library' | 'translations' | 'patches') => {
    setWorkspace(prev => ({
      ...prev,
      compileSettings: {
        ...compileSettings,
        [key]: !compileSettings[key]
      }
    }));
  };

  const handleSendCuePackageToAIGuide = () => {
    if (!selectedNode) return;

    // 1. Gather linked nodes
    const links = workspace.links || [];
    const connectedNodeIds = new Set<string>();
    links.forEach(l => {
      if (l.sourceNodeId === selectedNode.id) connectedNodeIds.add(l.targetNodeId);
      if (l.targetNodeId === selectedNode.id) connectedNodeIds.add(l.sourceNodeId);
    });

    const dependencies = (workspace.nodes || []).filter(n => connectedNodeIds.has(n.id));

    // 2. Format highly detailed prompt context message
    let serializedContext = `### SELECTED ELEMENT NODE\n- Label: "${selectedNode.label}"\n- XML Tag: <${selectedNode.xmlTag}>\n`;
    if (Object.keys(selectedNode.properties || {}).length > 0) {
      serializedContext += `  Properties:\n`;
      Object.entries(selectedNode.properties).forEach(([k, v]) => {
        serializedContext += `    - ${k}: ${JSON.stringify(v)}\n`;
      });
    }
    if (selectedNode.comment) {
      serializedContext += `  Comment Annotation: "${selectedNode.comment}"\n`;
    }

    if (dependencies.length > 0) {
      serializedContext += `\n### DEPENDENCIES & CONNECTING NODES\n`;
      dependencies.forEach(dep => {
        serializedContext += `- Relation Connection: <${dep.xmlTag}> Tag, labeled "${dep.label}"\n`;
        if (Object.keys(dep.properties || {}).length > 0) {
          serializedContext += `  Properties:\n`;
          Object.entries(dep.properties).forEach(([k, v]) => {
            serializedContext += `    - ${k}: ${JSON.stringify(v)}\n`;
          });
        }
      });
    }

    // 3. Dispatch global open-ai-chat event
    const promptMessage = `I would like to edit my mission cue sequence. Here is the active selected node and its dependency graph context:\n\n${serializedContext}\n\nPlease analyze this cue structure, offer feedback on Egosoft engine compliance, and guide me on how to enhance this sequence or introduce custom conditions & action events!`;

    const event = new CustomEvent('open-ai-chat', {
      detail: { prompt: promptMessage }
    });
    window.dispatchEvent(event);
  };

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
    <div
      id="side_panel"
      style={{ width }}
      className="border-r border-white/5 bg-[#12141a] flex h-full text-slate-300 min-w-0"
    >
      {/* Left Icon Strip */}
      <div className="w-[52px] bg-[#0a0c10] border-r border-white/5 flex flex-col items-center py-4 gap-2.5 shrink-0">
        <button
          id="tab_script"
          onClick={() => setActiveTab('script')}
          className={`w-10 h-11 rounded-lg flex flex-col items-center justify-center transition-all duration-150 cursor-pointer ${
            activeTab === 'script'
              ? 'text-cyan-400 bg-cyan-950/20 border-l-2 border-cyan-500 font-bold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
          title="MD Nodes"
        >
          <Layers className="w-4 h-4 shrink-0" />
          <span className="text-[7.5px] font-mono tracking-tighter uppercase font-bold mt-1 text-center truncate w-full">NODES</span>
        </button>

        <button
          id="tab_cues"
          onClick={() => setActiveTab('cues')}
          className={`w-10 h-11 rounded-lg flex flex-col items-center justify-center transition-all duration-150 cursor-pointer ${
            activeTab === 'cues'
              ? 'text-purple-400 bg-purple-950/20 border-l-2 border-purple-500 font-bold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
          title="Cues"
        >
          <Compass className="w-4 h-4 shrink-0" />
          <span className="text-[7.5px] font-mono tracking-tighter uppercase font-bold mt-1 text-center truncate w-full">CUES</span>
        </button>

        <button
          id="tab_ui"
          onClick={() => setActiveTab('ui')}
          className={`w-10 h-11 rounded-lg flex flex-col items-center justify-center transition-all duration-150 cursor-pointer ${
            activeTab === 'ui'
              ? 'text-cyan-400 bg-cyan-950/20 border-l-2 border-cyan-500 font-bold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
          title="Menu Widgets"
        >
          <Layout className="w-4 h-4 shrink-0" />
          <span className="text-[7.5px] font-mono tracking-tighter uppercase font-bold mt-1 text-center truncate w-full">WIDGETS</span>
        </button>

        <button
          id="tab_config"
          onClick={() => setActiveTab('config')}
          className={`w-10 h-11 rounded-lg flex flex-col items-center justify-center transition-all duration-150 cursor-pointer ${
            activeTab === 'config'
              ? 'text-cyan-400 bg-cyan-950/20 border-l-2 border-cyan-500 font-bold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
          title="Mod Meta"
        >
          <Settings className="w-4 h-4 shrink-0" />
          <span className="text-[7.5px] font-mono tracking-tighter uppercase font-bold mt-1 text-center truncate w-full">META</span>
        </button>

        <button
          id="tab_filesystem"
          onClick={() => setActiveTab('filesystem')}
          className={`w-10 h-11 rounded-lg flex flex-col items-center justify-center transition-all duration-150 cursor-pointer ${
            activeTab === 'filesystem'
              ? 'text-cyan-400 bg-cyan-950/20 border-l-2 border-cyan-500 font-bold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
          title="Filesystem"
        >
          <FolderGit2 className="w-4 h-4 shrink-0" />
          <span className="text-[7.5px] font-mono tracking-tighter uppercase font-bold mt-1 text-center truncate w-full">FILES</span>
        </button>

        <button
          id="tab_git"
          onClick={() => setActiveTab('git')}
          className={`w-10 h-11 rounded-lg flex flex-col items-center justify-center transition-all duration-150 cursor-pointer ${
            activeTab === 'git'
              ? 'text-cyan-400 bg-cyan-950/20 border-l-2 border-cyan-500 font-bold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
          title="Source Control"
        >
          <GitBranch className="w-4 h-4 shrink-0" />
          <span className="text-[7.5px] font-mono tracking-tighter uppercase font-bold mt-1 text-center truncate w-full">SOURCE</span>
        </button>

        <button
          id="tab_templates"
          onClick={() => setActiveTab('templates')}
          className={`w-10 h-11 rounded-lg flex flex-col items-center justify-center transition-all duration-150 cursor-pointer ${
            activeTab === 'templates'
              ? 'text-cyan-400 bg-cyan-950/20 border-l-2 border-cyan-500 font-bold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
          title="Templates"
        >
          <Library className="w-4 h-4 shrink-0" />
          <span className="text-[7.5px] font-mono tracking-tighter uppercase font-bold mt-1 text-center truncate w-full">TEMPLATES</span>
        </button>

        <button
          id="tab_ai"
          onClick={() => setActiveTab('ai')}
          className={`w-10 h-11 rounded-lg flex flex-col items-center justify-center transition-all duration-150 cursor-pointer ${
            activeTab === 'ai'
              ? 'text-amber-400 bg-amber-950/20 border-l-2 border-amber-500 font-bold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
          title="AI Co-pilot"
        >
          <Sparkles className="w-4 h-4 shrink-0" />
          <span className="text-[7.5px] font-mono tracking-tighter uppercase font-bold mt-1 text-center truncate w-full">CO-PILOT</span>
        </button>
        <button
          id="tab_mdscanner"
          onClick={() => setActiveTab('mdscanner')}
          className={`w-10 h-11 rounded-lg flex flex-col items-center justify-center transition-all duration-150 cursor-pointer ${
            activeTab === 'mdscanner'
              ? 'text-amber-400 bg-amber-950/20 border-l-2 border-amber-500 font-bold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
          title="MD Scanner"
        >
          <Brain className="w-4 h-4 shrink-0" />
          <span className="text-[7.5px] font-mono tracking-tighter uppercase font-bold mt-1 text-center truncate w-full font-mono">SCANNER</span>
        </button>
        <button
          id="tab_playtest"
          onClick={() => setActiveTab('playtest')}
          className={`w-10 h-11 rounded-lg flex flex-col items-center justify-center transition-all duration-150 cursor-pointer ${
            activeTab === 'playtest'
              ? 'text-emerald-400 bg-emerald-950/20 border-l-2 border-emerald-500 font-bold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
          title="Playtest Workspace"
        >
          <Terminal className="w-4 h-4 shrink-0" />
          <span className="text-[7.5px] font-mono tracking-tighter uppercase font-bold mt-1 text-center truncate w-full font-mono">PLAYTEST</span>
        </button>
        <button
          id="tab_diagnostics"
          onClick={() => setActiveTab('diagnostics')}
          className={`w-10 h-11 rounded-lg flex flex-col items-center justify-center transition-all duration-150 cursor-pointer ${
            activeTab === 'diagnostics'
              ? 'text-cyan-400 bg-cyan-950/20 border-l-2 border-cyan-500 font-bold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
          title="Package Mod Doctor Diagnostics"
        >
          <Activity className="w-4 h-4 shrink-0" />
          <span className="text-[7.5px] font-mono tracking-tighter uppercase font-bold mt-1 text-center truncate w-full">DOCTOR</span>
        </button>
        <button
          id="tab_reference"
          onClick={() => setActiveTab('reference')}
          className={`w-10 h-11 rounded-lg flex flex-col items-center justify-center transition-all duration-150 cursor-pointer ${
            activeTab === 'reference'
              ? 'text-amber-400 bg-amber-950/20 border-l-2 border-amber-500 font-bold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
          title="Local Object Browser"
        >
          <Database className="w-4 h-4 shrink-0" />
          <span className="text-[7.5px] font-mono tracking-tighter uppercase font-bold mt-1 text-center truncate w-full font-mono">OBJECTS</span>
        </button>
      </div>

      {/* Right Content Column */}
      <div className="flex-1 flex flex-col min-w-0 h-full bg-[#12141a]">
        
        {/* Sleek Tab Header */}
        <div className="px-3.5 py-3 border-b border-white/5 bg-[#161920]/30 shrink-0 flex items-center justify-between font-mono">
          <div>
            <div className="text-[11px] font-bold text-slate-105 uppercase tracking-wider flex items-center gap-1.5 leading-none">
              {activeTab === 'script' && <Layers className="w-3.5 h-3.5 text-cyan-400" />}
              {activeTab === 'cues' && <Compass className="w-3.5 h-3.5 text-purple-400" />}
              {activeTab === 'ui' && <Layout className="w-3.5 h-3.5 text-cyan-400" />}
              {activeTab === 'config' && <Settings className="w-3.5 h-3.5 text-cyan-400" />}
              {activeTab === 'filesystem' && <FolderGit2 className="w-3.5 h-3.5 text-cyan-400" />}
              {activeTab === 'git' && <GitBranch className="w-3.5 h-3.5 text-cyan-400" />}
              {activeTab === 'templates' && <Library className="w-3.5 h-3.5 text-cyan-400" />}
              {activeTab === 'ai' && <Sparkles className="w-3.5 h-3.5 text-amber-400" />}
              {activeTab === 'mdscanner' && <Brain className="w-3.5 h-3.5 text-amber-500" />}
              {activeTab === 'playtest' && <Terminal className="w-3.5 h-3.5 text-emerald-400" />}
              {activeTab === 'diagnostics' && <Activity className="w-3.5 h-3.5 text-cyan-405" />}
              {activeTab === 'reference' && <Database className="w-3.5 h-3.5 text-amber-400" />}

              {activeTab === 'script' && 'Node Toolbox'}
              {activeTab === 'cues' && 'Cue Hierarchy'}
              {activeTab === 'ui' && 'UI Widgets'}
              {activeTab === 'config' && 'Mod Config'}
              {activeTab === 'filesystem' && 'Filesystem'}
              {activeTab === 'git' && 'Source Control'}
              {activeTab === 'templates' && 'Blueprints'}
              {activeTab === 'ai' && 'AI Co-pilot'}
              {activeTab === 'mdscanner' && 'MD Scanner'}
              {activeTab === 'playtest' && 'Playtest Workspace'}
              {activeTab === 'diagnostics' && 'Mod Doctor'}
              {activeTab === 'reference' && 'Object Browser'}
            </div>
            <div className="text-[9px] text-slate-500 font-sans mt-0.5 leading-none">
              {activeTab === 'script' && 'Create visual logic nodes'}
              {activeTab === 'cues' && 'Navigate Mission Director cues'}
              {activeTab === 'ui' && 'HUD widgets & Lua overlays'}
              {activeTab === 'config' && 'Edit extension settings'}
              {activeTab === 'filesystem' && 'Workspace loose files list'}
              {activeTab === 'git' && 'Staged changes & remotes'}
              {activeTab === 'templates' && 'Manage reusable subgraphs'}
              {activeTab === 'ai' && 'AI-assisted logic & templates'}
              {activeTab === 'mdscanner' && 'Deep logic cognitive scanning & telemetry'}
              {activeTab === 'playtest' && 'Directory sync, manual syncer, and log parser'}
              {activeTab === 'diagnostics' && 'Package-wide syntax and reference check'}
              {activeTab === 'reference' && 'Browse local ships, wares, factions, and code references'}
            </div>
          </div>

          {activeTab === 'ai' && (
            <button
              onClick={() => setIsAiFloatingVisible(!isAiFloatingVisible)}
              className={`px-2 py-1 rounded text-[9.5px] font-mono font-bold uppercase transition-all duration-150 border cursor-pointer ${
                isAiFloatingVisible 
                  ? 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-400' 
                  : 'bg-slate-800 hover:bg-slate-700 border-white/10 text-slate-400 hover:text-slate-200'
              }`}
              title={isAiFloatingVisible ? "Hide floating AI guide panel" : "Show floating AI guide panel"}
            >
              {isAiFloatingVisible ? "Hide Float ✕" : "Show Float ⎋"}
            </button>
          )}
        </div>

        {/* Main Content Pane */}
        <div className={`flex-1 overflow-y-auto min-w-0 min-h-0 ${activeTab === 'filesystem' || activeTab === 'git' || activeTab === 'cues' || activeTab === 'ai' ? 'p-0' : 'p-3 space-y-3'}`}>
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
            modWorkspacePath={modWorkspacePath}
            filesystemPath={filesystemPath}
            workspace={workspace}
            setWorkspace={setWorkspace}
            saveCheckpoint={saveCheckpoint}
            workspaceView={workspaceView}
            setWorkspaceView={setWorkspaceView}
            onOpenEditorFile={onOpenEditorFile}
          />
        )}

        {activeTab === 'git' && (
          <ErrorBoundary label="Source Control">
            <SourceControl
              workspace={workspace}
              setWorkspace={setWorkspace}
              onOpenEditorFile={onOpenEditorFile}
              saveCheckpoint={saveCheckpoint}
              setWorkspaceView={setWorkspaceView}
            />
          </ErrorBoundary>
        )}

        {activeTab === 'mdscanner' && (
          <ErrorBoundary label="MD Scanner">
            <DiagnosticsHub
              workspace={workspace}
              setWorkspace={setWorkspace}
              saveCheckpoint={saveCheckpoint}
              modWorkspacePath={modWorkspacePath}
              setWorkspaceView={setWorkspaceView}
              forceTab="analyzer"
            />
          </ErrorBoundary>
        )}

        {activeTab === 'playtest' && (
          <ErrorBoundary label="Playtest Workspace">
            <DiagnosticsHub
              workspace={workspace}
              setWorkspace={setWorkspace}
              saveCheckpoint={saveCheckpoint}
              modWorkspacePath={modWorkspacePath}
              setWorkspaceView={setWorkspaceView}
              forceTab="playtest"
            />
          </ErrorBoundary>
        )}

        {activeTab === 'diagnostics' && (
          <ErrorBoundary label="Mod Doctor">
            <PackageModDoctor
              workspace={workspace}
              diagnostics={diagnostics}
              diagnosticSource={diagnosticSource}
            />
          </ErrorBoundary>
        )}

        {activeTab === 'reference' && (
          <ErrorBoundary label="Local Object Browser">
            <ObjectBrowser />
          </ErrorBoundary>
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
              <h3 className="text-[10px] font-mono font-semibold text-slate-400 mb-1.5 tracking-wider uppercase flex items-center gap-1">
                <Wrench className="w-3.5 h-3.5 text-cyan-400" />
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
                      className="w-full text-left p-1.5 rounded bg-black/20 border border-white/5 hover:border-cyan-500/50 transition-all flex items-center justify-between group cursor-pointer"
                    >
                      <div>
                        <div className="text-xs font-semibold text-slate-200 group-hover:text-white transition-colors leading-none">
                          {template.label}
                        </div>
                        <div className="text-[9.5px] font-mono text-slate-500 mt-1">
                          &lt;{template.xmlTag}&gt;
                        </div>
                      </div>
                      <span className={`text-[8.5px] font-mono border px-1 py-0.5 rounded leading-none shrink-0 ${badgeColors}`}>
                        {template.type.substring(0, 4).toUpperCase()}
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
            <div className="bg-cyan-950/10 border border-cyan-500/15 p-2.5 rounded text-[10px] leading-relaxed text-slate-400">
              <span className="text-cyan-400 font-bold block mb-0.5">X4 Custom UI Rules:</span>
              Design working contextual HUD menus or consoles. Add containers, tables, lists, progress bars and macro buttons.
            </div>

            <div className="space-y-2">
              <h3 className="text-[10px] font-mono font-semibold text-slate-400 mb-1.5 tracking-wider uppercase">UI Widgets Library</h3>
              {[
                { type: 'window', title: 'Context Window Frame', desc: 'Outer widget window layout container' },
                { type: 'header', title: 'Tactical Title / Header', desc: 'Wide high-contrast cyber decoration line' },
                { type: 'table', title: 'Standard Data Table', desc: 'Pre-styled multi-row grid framework' },
                { type: 'button', title: 'Macro Menu Button', desc: 'Fires visual cues on selection click' },
                { type: 'progressbar', title: 'Status Progress Bar', desc: 'Elegant status / shield indicator' },
                { type: 'text', title: 'Display Label', desc: 'Human-readable description labels' },
                { type: 'dropdown', title: 'Interactive Selector', desc: 'Drop-down values list widget' },
                { type: 'input', title: 'Text Input Box', desc: 'Custom command or log entry text field' },
                { type: 'chat', title: 'Dialogue Chat Logs', desc: 'Scrollable live dialogue transmissions list' }
              ].map(widget => {
                let widgetIcon = <Layout className="w-3.5 h-3.5 text-cyan-400 shrink-0" />;
                if (widget.type === 'header') widgetIcon = <Layers className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
                if (widget.type === 'table') widgetIcon = <Library className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
                if (widget.type === 'button') widgetIcon = <Plus className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
                if (widget.type === 'progressbar') widgetIcon = <Sliders className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
                if (widget.type === 'text') widgetIcon = <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
                if (widget.type === 'dropdown') widgetIcon = <ChevronRight className="w-3.5 h-3.5 text-cyan-400 shrink-0" />;
                if (widget.type === 'input') widgetIcon = <Settings className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
                if (widget.type === 'chat') widgetIcon = <BookOpen className="w-3.5 h-3.5 text-purple-400 shrink-0" />;

                return (
                  <button
                    key={widget.type}
                    onClick={() => onAddUIWidget(widget.type)}
                    className="w-full text-left p-2 rounded bg-black/20 border border-white/5 hover:bg-cyan-600/5 hover:border-cyan-500/50 transition-all flex items-center gap-2.5 group cursor-pointer"
                  >
                    {widgetIcon}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-200 group-hover:text-white capitalize truncate leading-none">
                        {widget.title}
                      </div>
                      <div className="text-[9px] text-slate-550 font-sans mt-1 truncate">
                        {widget.desc}
                      </div>
                    </div>
                    <Plus className="w-3.5 h-3.5 text-slate-500 opacity-0 group-hover:opacity-100 group-hover:text-cyan-400 transition-all" />
                  </button>
                );
              })}
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
              {modWorkspacePath ? (
                <div className="space-y-3">
                  <div className="p-2 rounded bg-emerald-500/5 border border-emerald-500/20 text-[10px] space-y-1">
                    <div className="flex items-center justify-between text-slate-400 font-bold uppercase text-[9px]">
                       <span>Workspace Path</span>
                       <span className="text-emerald-400 flex items-center gap-0.5 font-bold uppercase text-[8px] animate-pulse">● Configured</span>
                    </div>
                    <div className="text-white break-all flex items-center gap-1 text-[10px]">
                      <Folder className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                      {modWorkspacePath}
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

                  {/* Compilation scope targets choice */}
                  <div className="bg-[#0F1115]/50 border border-white/5 rounded p-2.5 space-y-2 select-none">
                    <label className="text-slate-400 block uppercase text-[8.5px] tracking-wider font-bold">
                      🛠️ active modules to compile
                    </label>
                    <div className="grid grid-cols-2 gap-2 font-mono text-[9.5px]">
                      <label className="flex items-center gap-2 text-slate-300 hover:text-white cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={compileSettings.md}
                          onChange={() => handleToggleCompileSetting('md')}
                          className="accent-emerald-500 rounded cursor-pointer"
                        />
                        MD Scripts
                      </label>
                      <label className="flex items-center gap-2 text-slate-300 hover:text-white cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={compileSettings.ui}
                          onChange={() => handleToggleCompileSetting('ui')}
                          className="accent-emerald-500 rounded cursor-pointer"
                        />
                        HUD & LUA UI
                      </label>
                      <label className="flex items-center gap-2 text-slate-300 hover:text-white cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={compileSettings.ai}
                          onChange={() => handleToggleCompileSetting('ai')}
                          className="accent-emerald-500 rounded cursor-pointer"
                        />
                        AI Behaviors
                      </label>
                      <label className="flex items-center gap-2 text-slate-300 hover:text-white cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={compileSettings.library}
                          onChange={() => handleToggleCompileSetting('library')}
                          className="accent-emerald-500 rounded cursor-pointer"
                        />
                        Wares & Jobs
                      </label>
                      <label className="flex items-center gap-2 text-slate-300 hover:text-white cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={compileSettings.translations}
                          onChange={() => handleToggleCompileSetting('translations')}
                          className="accent-emerald-500 rounded cursor-pointer"
                        />
                        T Languages
                      </label>
                      <label className="flex items-center gap-2 text-slate-300 hover:text-white cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={compileSettings.patches}
                          onChange={() => handleToggleCompileSetting('patches')}
                          className="accent-emerald-500 rounded cursor-pointer"
                        />
                        XML Patching
                      </label>
                    </div>
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
                  <p className="text-[9.5px] text-slate-500 leading-relaxed italic text-center py-2">
                    No workspace staging folder configured. Configure it in Settings to enable compiler.
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
              modWorkspacePath={modWorkspacePath}
              onSelectSnapshot={onSelectSnapshot}
            />
          </div>
        )}

        {/* LIBRARY / TEMPLATES (Tab: templates) */}
        {activeTab === 'templates' && (
          <div className="space-y-4">
            {/* Title */}
            <div>
              <h3 className="text-xs font-mono font-semibold text-cyan-400 mb-1 tracking-wider uppercase flex items-center gap-1.5 leading-none">
                <Library className="w-4 h-4 text-cyan-400" />
                TEMPLATE BLUEPRINTS
              </h3>
              <p className="text-[10px] text-slate-500 leading-normal font-sans">
                Non-compilable visual templates. Drag them onto the canvas or drag-start, select, and customize them.
              </p>
            </div>

            {/* Part 1: CREATE REUSABLE BLUEPRINT */}
            <div className="space-y-3 bg-black/40 p-3 rounded border border-white/5 font-mono text-[11px]">
              <span className="text-cyan-400 uppercase font-bold text-[9px] tracking-wider block">
                CREATE BLUEPRINT BLUEPRINT
              </span>
              
              <div>
                <label className="text-slate-400 block mb-1 uppercase text-[8.5px] tracking-wider">Blueprint Title</label>
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={e => setNewTemplateName(e.target.value)}
                  className="w-full p-1.5 rounded bg-black/50 border border-white/10 text-white focus:outline-none focus:border-cyan-500 text-[10px]"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 uppercase text-[8.5px] tracking-wider">Base Node Structure</label>
                <select
                  value={newTemplateTypeIdx}
                  onChange={e => setNewTemplateTypeIdx(Number(e.target.value))}
                  className="w-full p-1.5 rounded bg-[#0b0c10] border border-white/10 text-slate-300 focus:outline-none focus:border-cyan-500 text-[10px] cursor-pointer"
                >
                  {NODE_TEMPLATES.map((nodeT, idx) => (
                    <option key={idx} value={idx}>
                      {nodeT.label} ({nodeT.xmlTag})
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => {
                  if (!newTemplateName.trim()) return;
                  const baseNode = NODE_TEMPLATES[newTemplateTypeIdx];
                  if (!baseNode) return;

                  const customT: MDNode = {
                    id: `custom_template_${Date.now()}`,
                    type: baseNode.type,
                    label: newTemplateName,
                    xmlTag: baseNode.xmlTag,
                    x: 100,
                    y: 100,
                    properties: { ...baseNode.properties },
                    propertiesSchema: [...(baseNode.propertiesSchema || [])],
                    inputs: [...(baseNode.inputs || [])],
                    outputs: [...(baseNode.outputs || [])],
                    includeInBuild: false
                  };

                  saveCheckpoint();
                  setWorkspace(prev => ({
                    ...prev,
                    templates: [...(prev.templates || []), customT]
                  }));
                  setNewTemplateName('New Custom Blueprint');
                }}
                className="w-full py-1.5 font-bold uppercase transition-all bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 hover:text-white rounded border border-cyan-500/30 cursor-pointer text-[10px] tracking-wider text-center"
              >
                + Save as Blueprint
              </button>
            </div>

            {/* Part 2: LIST AND EDITING */}
            <div className="space-y-2">
              <span className="text-slate-400 uppercase font-bold text-[9px] tracking-wider flex items-center justify-between">
                <span>AVAILABLE BLUEPRINTS</span>
                <span className="text-slate-500 text-[8px] lowercase">drag or click to add</span>
              </span>

              <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                {[
                  {
                    id: 'preseed_sample_cue',
                    type: 'cue' as const,
                    label: 'Standard Mission Cue Scaffold',
                    xmlTag: 'cue',
                    x: 100,
                    y: 100,
                    properties: { name: 'Cue_Scaffold', instantiate: 'true', namespace: 'this', state: 'active' },
                    propertiesSchema: NODE_TEMPLATES.find(t => t.xmlTag === 'cue')?.propertiesSchema || [],
                    inputs: NODE_TEMPLATES.find(t => t.xmlTag === 'cue')?.inputs || [],
                    outputs: NODE_TEMPLATES.find(t => t.xmlTag === 'cue')?.outputs || [],
                    includeInBuild: false
                  },
                  {
                    id: 'preseed_cargo_alert',
                    type: 'event' as const,
                    label: 'Cargo Check Event Trigger',
                    xmlTag: 'event_object_destroyed',
                    x: 100,
                    y: 100,
                    properties: { object: 'player.target', faction: 'any' },
                    propertiesSchema: NODE_TEMPLATES.find(t => t.xmlTag === 'event_object_destroyed')?.propertiesSchema || [],
                    inputs: NODE_TEMPLATES.find(t => t.xmlTag === 'event_object_destroyed')?.inputs || [],
                    outputs: NODE_TEMPLATES.find(t => t.xmlTag === 'event_object_destroyed')?.outputs || [],
                    includeInBuild: false
                  },
                  {
                    id: 'preseed_briefing_help',
                    type: 'action' as const,
                    label: 'Briefing Help Banner Alarm',
                    xmlTag: 'show_help',
                    x: 100,
                    y: 100,
                    properties: { text: "Warning: Elite Sector Security forces alert!", duration: 10 },
                    propertiesSchema: NODE_TEMPLATES.find(t => t.xmlTag === 'show_help')?.propertiesSchema || [],
                    inputs: NODE_TEMPLATES.find(t => t.xmlTag === 'show_help')?.inputs || [],
                    outputs: NODE_TEMPLATES.find(t => t.xmlTag === 'show_help')?.outputs || [],
                    includeInBuild: false
                  },
                  ...(workspace.templates || [])
                ].map((tNode, idx) => {
                  let badgeColors = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
                  if (tNode.type === 'cue') badgeColors = 'bg-purple-500/10 text-purple-400 border-purple-500/20';
                  if (tNode.type === 'event') badgeColors = 'bg-amber-500/10 text-amber-400 border-amber-500/30';
                  if (tNode.type === 'condition') badgeColors = 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
                  if (tNode.type === 'action') badgeColors = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';

                  const isCustom = !tNode.id.startsWith('preseed_');

                  return (
                    <div
                      key={idx}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', JSON.stringify({
                          type: 'x4-template-node',
                          template: tNode
                        }));
                      }}
                      onClick={() => {
                        if (isCustom) {
                          setEditedTemplateId(tNode.id);
                          setEditedTemplateLabel(tNode.label);
                          setEditedTemplateXmlTag(tNode.xmlTag);
                        } else {
                          setEditedTemplateId(null);
                        }
                      }}
                      className={`p-2 rounded bg-[#1c1f26] border hover:border-cyan-500/50 transition-all flex flex-col gap-1.5 cursor-grab active:cursor-grabbing font-mono text-[10px] ${
                        editedTemplateId === tNode.id ? 'border-cyan-500 text-white bg-cyan-700/5' : 'border-white/5 text-slate-300'
                      }`}
                      title="Drag this card onto the visual canvas to spawn it, or click to edit item attributes."
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-200 select-none">
                          {tNode.label}
                        </span>
                        <div className="flex items-center gap-1">
                          <span className={`text-[8px] font-bold border px-1 rounded scale-90 ${badgeColors}`}>
                            {tNode.type.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[9px] text-slate-400 select-none border-t border-white/5 pt-1 font-mono">
                        <span>&lt;{tNode.xmlTag}&gt;</span>
                        <div className="flex gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // Clone/instantiate onto workspace.nodes
                              saveCheckpoint();
                              const instNode = {
                                ...tNode,
                                id: `node_inst_${Date.now()}`,
                                x: 200 + Math.random() * 80,
                                y: 150 + Math.random() * 80,
                                includeInBuild: true // Direct insertion sets it as compilable in the active mod!
                              };
                              setWorkspace(prev => ({
                                ...prev,
                                nodes: [...prev.nodes, instNode]
                              }));
                            }}
                            className="text-cyan-400 hover:text-cyan-200 transition-all cursor-pointer font-bold leading-none bg-cyan-500/10 px-1 py-0.5 rounded uppercase text-[8px]"
                          >
                            + Insert active
                          </button>
                          {isCustom && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                saveCheckpoint();
                                setWorkspace(prev => ({
                                  ...prev,
                                  templates: (prev.templates || []).filter(item => item.id !== tNode.id)
                                }));
                                if (editedTemplateId === tNode.id) {
                                  setEditedTemplateId(null);
                                }
                              }}
                              className="text-red-400 hover:text-red-300 hover:bg-red-500/10 px-1 py-0.5 rounded cursor-pointer leading-none"
                              title="Delete this template blueprint"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* PART 3: VISUALLY SEE & EDIT CUSTOM TEMPLATE ATTRIBUTES */}
            {editedTemplateId && (
              <div className="border-t border-cyan-500/20 pt-3 space-y-3 bg-[#0F1115] p-3 rounded border border-white/10 font-mono text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-cyan-400 font-bold text-[9px] uppercase tracking-wider">
                    Edit Blueprint Fields
                  </span>
                  <button
                    onClick={() => setEditedTemplateId(null)}
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
                    Close
                  </button>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1 uppercase text-[8.5px] tracking-wider">Display Label</label>
                  <input
                    type="text"
                    value={editedTemplateLabel}
                    onChange={e => {
                      const newV = e.target.value;
                      setEditedTemplateLabel(newV);
                      setWorkspace(prev => ({
                        ...prev,
                        templates: (prev.templates || []).map(item =>
                          item.id === editedTemplateId ? { ...item, label: newV } : item
                        )
                      }));
                    }}
                    className="w-full p-1.5 rounded bg-black/60 border border-white/10 text-white focus:outline-none focus:border-cyan-500 text-[10px]"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1 uppercase text-[8.5px] tracking-wider">XML Tag Node</label>
                  <input
                    type="text"
                    value={editedTemplateXmlTag}
                    onChange={e => {
                      const newV = e.target.value;
                      setEditedTemplateXmlTag(newV);
                      setWorkspace(prev => ({
                        ...prev,
                        templates: (prev.templates || []).map(item =>
                          item.id === editedTemplateId ? { ...item, xmlTag: newV } : item
                        )
                      }));
                    }}
                    className="w-full p-1.5 rounded bg-black/60 border border-white/10 text-white focus:outline-none focus:border-cyan-500 text-[10px]"
                  />
                </div>
                
                <p className="text-[8px] text-slate-500 leading-normal italic select-none font-sans">
                  Editing values instantly refreshes blueprint configurations safely without altering canvas assets.
                </p>
              </div>
            )}
          </div>
        )}

        {/* AI CO-PILOT (Tab: ai) */}
        {activeTab === 'ai' && (
          <AIHelper
            mode="sidebar"
            workspace={workspace}
            setWorkspace={setWorkspace}
            localVersion={1}
            setLocalVersion={() => {}}
            chatHistory={aiChatHistory}
            setChatHistory={setAiChatHistory}
            inputText={aiInputText}
            setInputText={setAiInputText}
            activeMode={aiActiveMode}
            setActiveMode={setAiActiveMode}
            loading={aiLoading}
            errorText={aiErrorText}
            isOpen={false}
            setIsOpen={() => {}}
            handleSend={handleSend}
            handleApplyAction={handleApplyAction}
            handleDeclineAction={handleDeclineAction}
            isAiFloatingVisible={isAiFloatingVisible}
            setIsAiFloatingVisible={setIsAiFloatingVisible}
          />
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

              {/* Build Inclusion Toggle */}
              <div>
                <label className="text-slate-400 block mb-1 font-semibold uppercase text-[9px] tracking-wider">Build Inclusion</label>
                <label className="flex items-center gap-2 text-slate-300 bg-black/60 border border-white/10 rounded px-2.5 py-1.5 cursor-pointer hover:bg-black/90 transition-all select-none">
                  <input
                    type="checkbox"
                    checked={selectedNode ? selectedNode.includeInBuild !== false : (selectedWidget ? selectedWidget.includeInBuild !== false : true)}
                    onChange={e => {
                      saveCheckpoint();
                      const val = e.target.checked;
                      if (selectedNode) {
                        setWorkspace(prev => ({
                          ...prev,
                          nodes: prev.nodes.map(n => n.id === selectedNode.id ? { ...n, includeInBuild: val } : n)
                        }));
                        setSelectedNode(prev => prev && prev.id === selectedNode.id ? { ...prev, includeInBuild: val } : prev);
                      } else if (selectedWidget) {
                        setWorkspace(prev => ({
                          ...prev,
                          uiWidgets: prev.uiWidgets.map(w => w.id === selectedWidget.id ? { ...w, includeInBuild: val } : w)
                        }));
                        setSelectedWidget(prev => prev && prev.id === selectedWidget.id ? { ...prev, includeInBuild: val } : prev);
                      }
                    }}
                    className="accent-cyan-500 cursor-pointer"
                  />
                  <span className="text-[10px] uppercase font-bold tracking-wider text-cyan-400">Include in automatic build</span>
                </label>
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

              {/* AI Copilot Cue Editor */}
              {selectedNode && (
                <div className="mt-4 border-t border-cyan-500/10 pt-3 bg-gradient-to-r from-emerald-500/5 to-cyan-500/5 hover:from-emerald-500/10 hover:to-cyan-500/10 border border-emerald-500/10 rounded p-2.5 flex flex-col gap-2 transition-all">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                    <span className="text-[10px] text-emerald-400 uppercase font-bold tracking-wider">AI Copilot Cue Editor</span>
                  </div>
                  <p className="text-[9.5px] text-slate-400 leading-normal font-sans">
                    Send this node and all of its linking triggers/actions dependencies on the canvas to the AI Guide for interactive editing.
                  </p>
                  <button
                    onClick={handleSendCuePackageToAIGuide}
                    className="w-full text-center py-1.5 font-mono text-[9.5px] font-bold text-emerald-400 hover:text-white bg-emerald-500/10 hover:bg-emerald-600 rounded border border-emerald-500/25 cursor-pointer uppercase tracking-wider transition-all flex items-center justify-center gap-1"
                  >
                    🚀 Transmit Context to AI Guide
                  </button>
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
    </div> {/* Close Right Content Column */}
  </div>
  );
}
