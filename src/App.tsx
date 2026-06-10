/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Compass, 
  Layers, 
  GitFork, 
  Trash, 
  Layout, 
  FileCode, 
  Play, 
  Zap, 
  Bot,
  HelpCircle,
  Cpu,
  Info,
  Undo2,
  Redo2,
  FolderGit2,
  Sparkles,
  Scroll,
  Package,
  Globe,
  BookOpen,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Settings as SettingsGear
} from 'lucide-react';
import Sidebar from './components/Sidebar';
import SyncModal from './components/SyncModal';
import Canvas from './components/Canvas';
import UIBuilder from './components/UIBuilder';
import CodePreview, { EditorFile } from './components/CodePreview';
import AIHelper from './components/AIHelper';
import AgentBridge from './components/AgentBridge';
import AIConnectionModal from './components/AIConnectionModal';
import DirectorySettingsModal from './components/DirectorySettingsModal';
import AIScriptEditor from './components/AIScriptEditor';
import LibraryConfigurator from './components/LibraryConfigurator';
import XMLPatchSystem from './components/XMLPatchSystem';
import TFileEditor from './components/TFileEditor';
import WikiBrowser from './components/WikiBrowser';
import GlobalSearch from './components/GlobalSearch';
import { ModWorkspace, MDNode, UIWidget, PRESETS, NODE_TEMPLATES, sanitizeWorkspace, generateMDXML, validateModWorkspace } from './types';
import type { SchemaLibrary } from './lib/schemaTypes';
import { setSchemaTemplatesForImport } from './lib/xmlParser';
import { getActiveProvider, getProviderModel, getProviderReasoning } from './lib/apiHelper';
import { compileAndSaveAll } from './lib/modCompiler';

// Default initial blank workspace schema
const BLANK_WORKSPACE: ModWorkspace = {
  id: 'workspace_default',
  name: 'X4_My_Custom_Mod',
  version: '1.0.0',
  author: 'Space_Pilot',
  description: 'Custom script developed using X4 Foundations Mod Studio visual nodes generator',
  nodes: [
    {
      id: "cue_first",
      type: "cue",
      label: "Mission Cue",
      xmlTag: "cue",
      x: 150,
      y: 120,
      properties: { name: "My_Startup_Cue", instantiate: "false", namespace: "this", state: "active", conditions: "", actions: "" },
      propertiesSchema: NODE_TEMPLATES[0].propertiesSchema,
      inputs: NODE_TEMPLATES[0].inputs,
      outputs: NODE_TEMPLATES[0].outputs
    }
  ],
  links: [],
  uiWidgets: [],
  uiTheme: {
    backgroundColor: '#0F1115',
    borderColor: '#06b6d4',
    accentColor: '#0891b2',
    opacity: 0.95,
    showIcons: true
  }
};

export default function App() {
  const [schemaTemplates, setSchemaTemplates] = useState<Omit<MDNode, 'id' | 'x' | 'y'>[]>([]);
  const loadSchemaLibrary = React.useCallback(async () => {
    try {
      const res = await fetch('/api/schema/library');
      const library: SchemaLibrary | null = res.ok ? await res.json() : null;
      if (library?.loaded && Array.isArray(library.templates)) {
        setSchemaTemplates(library.templates);
        setSchemaTemplatesForImport(library.templates);
      } else {
        setSchemaTemplates([]);
        setSchemaTemplatesForImport([]);
      }
    } catch {
      setSchemaTemplates([]);
      setSchemaTemplatesForImport([]);
    }
  }, []);

  const [rawWorkspace, setRawWorkspace] = useState<ModWorkspace>(() => {
    // Attempt local storage sync
    const stored = localStorage.getItem('x4_mod_studio_workspace');
    const parsed = stored ? JSON.parse(stored) : BLANK_WORKSPACE;
    
    // Merge legacy localStorage items for backwards compatibility:
    const legacyAIScripts = localStorage.getItem('x4_mod_studio_aiscripts');
    const legacyWares = localStorage.getItem('x4_mod_studio_wares');
    const legacyJobs = localStorage.getItem('x4_mod_studio_jobs');
    const legacyPatches = localStorage.getItem('x4_mod_studio_xml_patches');

    if (legacyAIScripts && (!parsed.aiScripts || parsed.aiScripts.length === 0)) {
      try { parsed.aiScripts = JSON.parse(legacyAIScripts); } catch(e){}
    }
    if (legacyWares && (!parsed.wares || parsed.wares.length === 0)) {
      try { parsed.wares = JSON.parse(legacyWares); } catch(e){}
    }
    if (legacyJobs && (!parsed.jobs || parsed.jobs.length === 0)) {
      try { parsed.jobs = JSON.parse(legacyJobs); } catch(e){}
    }
    if (legacyPatches && (!parsed.xmlPatches || parsed.xmlPatches.length === 0)) {
      try { parsed.xmlPatches = JSON.parse(legacyPatches); } catch(e){}
    }

    return sanitizeWorkspace(parsed);
  });

  const setWorkspace = React.useCallback((value: React.SetStateAction<ModWorkspace>) => {
    setRawWorkspace(prev => {
      const next = typeof value === 'function' ? (value as Function)(prev) : value;
      return sanitizeWorkspace(next);
    });
  }, []);

  const workspace = rawWorkspace;

  useEffect(() => {
    loadSchemaLibrary();
    (async () => {
      try {
        const res = await fetch('/api/schema/config').then(r => r.json());
        if (res.config) {
          setModWorkspacePath(res.config.modWorkspacePath || '');
          setFilesystemPath(res.config.filesystemPath || '');
        }
      } catch (err) {
        console.warn("Could not load initial directory settings from server.");
      }
    })();
  }, [loadSchemaLibrary]);

  const [workspaceView, setWorkspaceView] = useState<'blueprint' | 'ui-designer' | 'aiscripts' | 'libraries' | 'xmlpatch' | 'translation' | 'wiki'>('blueprint');
  const [activeSidebarTab, setActiveSidebarTab] = useState<'script' | 'ui' | 'config' | 'filesystem' | 'git' | 'cues' | 'templates'>('script');
  const [visibleCueIds, setVisibleCueIds] = useState<string[] | null>(null);
  const [focusNodeRequest, setFocusNodeRequest] = useState<{ nodeId: string; timestamp: number } | null>(null);

  const [modWorkspacePath, setModWorkspacePath] = useState<string>('');
  const [filesystemPath, setFilesystemPath] = useState<string>('');
  
  const [workspaceDirMode, setWorkspaceDirMode] = useState<'candy' | 'store'>(() => {
    return (localStorage.getItem('x4_workspace_dir_mode') as 'candy' | 'store') || 'store';
  });
  const [compileStatus, setCompileStatus] = useState<'idle' | 'compiling' | 'success' | 'error'>('idle');
  const [compileMessage, setCompileMessage] = useState<string>('');

  const [selectedNode, setSelectedNode] = useState<MDNode | null>(null);
  const [activeEditorFile, setActiveEditorFile] = useState<EditorFile | null>(null);
  const [selectedWidget, setSelectedWidget] = useState<UIWidget | null>(null);

  const [localVersion, setLocalVersion] = useState<number>(1);
  const [isAgentBridgeOpen, setIsAgentBridgeOpen] = useState<boolean>(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState<boolean>(false);
  const [isAIConfigOpen, setIsAIConfigOpen] = useState<boolean>(false);
  const [isDirSettingsOpen, setIsDirSettingsOpen] = useState<boolean>(false);

  // Left & Right Sidebar Resizing States
  const [leftSidebarWidth, setLeftSidebarWidth] = useState<number>(320);
  const [rightSidebarWidth, setRightSidebarWidth] = useState<number>(460);
  const [isResizingLeft, setIsResizingLeft] = useState<boolean>(false);
  const [isResizingRight, setIsResizingRight] = useState<boolean>(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingLeft) {
        const newWidth = Math.max(200, Math.min(550, e.clientX));
        setLeftSidebarWidth(newWidth);
      }
      if (isResizingRight) {
        const newWidth = Math.max(300, Math.min(800, window.innerWidth - e.clientX));
        setRightSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizingLeft(false);
      setIsResizingRight(false);
    };

    if (isResizingLeft || isResizingRight) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingLeft, isResizingRight]);

  // Active AI modeling status states
  const [activeAIProvider, setActiveAIProvider] = useState<string>('gemini');
  const [activeAIModel, setActiveAIModel] = useState<string>('gemini-3.5-flash');
  const [activeReasoning, setActiveReasoning] = useState<string>('none');

  useEffect(() => {
    const updateAIState = () => {
      const provider = getActiveProvider();
      setActiveAIProvider(provider);
      setActiveAIModel(getProviderModel(provider));
      setActiveReasoning(getProviderReasoning(provider));
    };

    updateAIState();
    window.addEventListener('ai-config-updated', updateAIState);
    return () => {
      window.removeEventListener('ai-config-updated', updateAIState);
    };
  }, []);

  // Undo/Redo historical state stacks
  const [pastStates, setPastStates] = useState<ModWorkspace[]>([]);
  const [futureStates, setFutureStates] = useState<ModWorkspace[]>([]);

  // Function to capture a manual undoable snapshot checkpoint
  const saveCheckpoint = (customTarget?: ModWorkspace) => {
    const target = customTarget || workspace;
    setPastStates(prev => [...prev.slice(-39), JSON.parse(JSON.stringify(target))]);
    setFutureStates([]);
  };

  const handleUndo = () => {
    if (pastStates.length === 0) return;
    const previous = pastStates[pastStates.length - 1];
    const newPast = pastStates.slice(0, pastStates.length - 1);

    setFutureStates(prev => [JSON.parse(JSON.stringify(workspace)), ...prev]);
    setPastStates(newPast);
    setWorkspace(previous);
  };

  const handleRedo = () => {
    if (futureStates.length === 0) return;
    const next = futureStates[0];
    const newFuture = futureStates.slice(1);

    setPastStates(prev => [...prev, JSON.parse(JSON.stringify(workspace))]);
    setFutureStates(newFuture);
    setWorkspace(next);
  };

  // Setup keyboard modifiers for general OS accessibility (Ctrl+Z and Ctrl+Y)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if inside input fields to not disrupt standard typing workflows
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      } else if ((e.metaKey || e.ctrlKey) && (e.shiftKey && e.key === 'z' || e.key === 'y')) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pastStates, futureStates, workspace]);

  // Sync to local storage and do debounced sync with the server database
  useEffect(() => {
    localStorage.setItem('x4_mod_studio_workspace', JSON.stringify(workspace));

    const syncLocalEditsToServer = async () => {
      try {
        const response = await fetch("/api/agent/workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspace })
        });
        const data = await response.json();
        if (data && data.success && data.version) {
          setLocalVersion(data.version);
          localStorage.setItem('x4_mod_studio_version', String(data.version));
        }
      } catch (err) {
        console.warn("Could not synchronize local edits to server workspace space.");
      }
    };

    const debounceTimer = setTimeout(syncLocalEditsToServer, 1000);
    return () => clearTimeout(debounceTimer);
  }, [workspace]);

  const handleCompileModProject = async () => {
    if (!modWorkspacePath) {
      setCompileStatus('error');
      setCompileMessage('No workspace staging folder configured. Please configure it in Settings.');
      return;
    }
    setCompileStatus('compiling');
    setCompileMessage('Compiling and deploying project on the server...');
    try {
      const deployRes = await fetch('/api/agent/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace })
      });
      const deployData = await deployRes.json();
      if (deployRes.ok && deployData.success) {
        setCompileStatus('success');
        setCompileMessage(deployData.message);
      } else {
        setCompileStatus('error');
        setCompileMessage(deployData.error || 'Compilation or deployment failed.');
      }
    } catch (e: any) {
      setCompileStatus('error');
      setCompileMessage(e.message || 'Compilation failed. Connection error.');
    }
  };

  // Initial load and periodic background polling of the server workspace
  useEffect(() => {
    const fetchLatestServerWorkspace = async () => {
      try {
        const response = await fetch("/api/agent/workspace");
        const data = await response.json();
        if (data && data.workspace && data.version) {
          const storedVer = Number(localStorage.getItem('x4_mod_studio_version') || String(localVersion));
          if (data.version > storedVer) {
            setWorkspace(data.workspace);
            setLocalVersion(data.version);
            localStorage.setItem('x4_mod_studio_version', String(data.version));
            localStorage.setItem('x4_mod_studio_workspace', JSON.stringify(data.workspace));
          }
        }
      } catch (err) {
        // Silently ignore background polling connection issues
      }
    };

    fetchLatestServerWorkspace();
    const interval = setInterval(fetchLatestServerWorkspace, 3000);
    return () => clearInterval(interval);
  }, [localVersion, setWorkspace]);

  // Command node addition handler
  const handleAddNode = (template: any) => {
    saveCheckpoint();
    const newNode: MDNode = {
      ...template,
      id: `node_${Date.now()}`,
      x: 100 + Math.random() * 80,
      y: 120 + Math.random() * 80,
      properties: { ...template.properties }
    };
    setWorkspace(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode]
    }));
    setSelectedNode(newNode);
  };

  // UI Widget addition handler
  const handleAddUIWidget = (type: string) => {
    saveCheckpoint();
    const getWidgetDefaults = () => {
      switch (type) {
        case 'window': return { w: 420, h: 300, label: 'Control Sub console', properties: {} };
        case 'header': return { w: 320, h: 40, label: 'COCKPIT COMMS SCANNER', properties: {} };
        case 'table': return { w: 400, h: 180, label: 'Sectors Cargo Manifest', properties: {} };
        case 'button': return { w: 180, h: 45, label: 'LAUNCH EXTERMINATORS', properties: { action: 'signal_cue', targetCue: 'Bounty_Active_Cue' } };
        case 'progressbar': return { w: 300, h: 40, label: 'Warp Jump Coils', properties: { value: 75, progressColor: '#3b82f6' } };
        case 'text': return { w: 220, h: 30, label: 'Warning: Hull Breach near port engine', properties: {} };
        case 'dropdown': return { w: 180, h: 35, label: 'Standard Alert Modes', properties: { options: ['Red alert', 'Yellow alert', 'Green safe'] } };
        case 'input': return { w: 220, h: 40, label: '', properties: { placeholder: 'Type transmission command...' } };
        case 'chat': return { w: 320, h: 180, label: 'Sector Operations Chat Logs', properties: { messages: ['[COCOPILOT]: Welcome, Captain.', '[ARGON FLEET]: System status active.', '[XENON INCURSION]: Active threats in Sector 0'] } };
        default: return { w: 150, h: 40, label: 'Widget label', properties: {} };
      }
    };

    const defaults = getWidgetDefaults();
    const newWidget: UIWidget = {
      id: `widget_${Date.now()}`,
      type: type as any,
      x: 50 + Math.round(Math.random() * 40),
      y: 80 + Math.round(Math.random() * 40),
      ...defaults
    };

    setWorkspace(prev => ({
      ...prev,
      uiWidgets: [...prev.uiWidgets, newWidget]
    }));
    setSelectedWidget(newWidget);
  };

  // Reset workspace
  const handleClearWorkspace = () => {
    saveCheckpoint();
    setWorkspace(BLANK_WORKSPACE);
    setSelectedNode(null);
    setSelectedWidget(null);
  };

  // Load sample presets
  const handleLoadPreset = (key: 'escort' | 'mission' | 'blank') => {
    saveCheckpoint();
    if (key === 'blank') {
      handleClearWorkspace();
    } else {
      const preset = PRESETS[key];
      if (preset) {
        const loaded: ModWorkspace = {
          id: `workspace_${Date.now()}`,
          ...preset.workspace
        };
        setWorkspace(loaded);
        setSelectedNode(null);
        setSelectedWidget(null);
      }
    }
  };


  // MD Scripts Validation State calculations
  const mdDiagnostics = React.useMemo(() => {
    try {
      const code = generateMDXML(workspace);
      return validateModWorkspace(workspace, code);
    } catch (e) {
      return [{ severity: 'error', message: String(e), category: 'syntax' }];
    }
  }, [workspace]);

  const mdErrorCount = mdDiagnostics.filter(d => d.severity === 'error').length;
  const mdWarningCount = mdDiagnostics.filter(d => d.severity === 'warning').length;

  return (
    <div className="w-screen h-screen flex flex-col bg-[#0F1115] text-slate-300 font-sans">
      {/* Upper Technical Header */}
      <header className="h-12 border-b border-white/10 bg-[#161920] px-4 flex items-center justify-between shrink-0 font-mono">
        
        {/* Workspace Brand and Logo */}
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-cyan-600 rounded flex items-center justify-center font-bold text-white text-xs shrink-0">X4</div>
            <span className="font-semibold text-white tracking-tight shrink-0 select-none">X4:MD STUDIO v2.4</span>
          </div>

          {/* Global Search Tool */}
          <GlobalSearch
            workspace={workspace}
            workspaceView={workspaceView}
            setWorkspaceView={setWorkspaceView}
            setActiveSidebarTab={setActiveSidebarTab}
            setSelectedNode={setSelectedNode}
            setSelectedWidget={setSelectedWidget}
          />
        </div>

        {/* View Selection Mode Tabs */}
        <div id="view_selection_modes" className="flex items-center gap-1 p-1 rounded-md bg-black/45 border border-white/10">
          {(() => {
            const isActive = workspaceView === 'blueprint';
            let btnClass = '';
            let tooltip = '';
            let indicatorDot = null;
            
            if (mdErrorCount > 0) {
              // Red for errors
              btnClass = isActive
                ? 'bg-red-500/15 text-red-400 border border-red-500/50 shadow-[0_0_8px_rgba(239,68,68,0.15)] hover:bg-red-500/25'
                : 'bg-red-500/5 text-red-400/80 hover:text-red-300 border border-red-500/20 hover:border-red-500/40';
              tooltip = `MD Scripts — ${mdErrorCount} validation error${mdErrorCount > 1 ? 's' : ''} detected! Click to view workspace flow errors.`;
              indicatorDot = (
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
              );
            } else if (mdWarningCount > 0) {
              // Amber for warnings
              btnClass = isActive
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/40 shadow-[0_0_8px_rgba(245,158,11,0.1)] hover:bg-amber-500/25'
                : 'bg-amber-500/5 text-amber-400/80 hover:text-amber-300 border border-amber-500/15 hover:border-amber-500/35';
              tooltip = `MD Scripts — ${mdWarningCount} validation warning${mdWarningCount > 1 ? 's' : ''} active. Click to view rules advisory.`;
              indicatorDot = (
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
              );
            } else {
              // Green for valid
              btnClass = isActive
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.1)] hover:bg-emerald-500/25'
                : 'text-slate-400 hover:text-emerald-400 border border-transparent hover:border-emerald-500/20';
              tooltip = "MD Scripts — All flowchart script validation laws satisfied (valid).";
              indicatorDot = (
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              );
            }
            
            return (
              <button
                onClick={() => { setWorkspaceView('blueprint'); setActiveSidebarTab('script'); }}
                className={`px-2.5 py-1 rounded text-[11px] font-bold font-mono uppercase flex items-center gap-2 transition-all cursor-pointer ${btnClass}`}
                title={tooltip}
              >
                <GitFork className="w-3.5 h-3.5" />
                <span>MD Scripts</span>
                {indicatorDot}
              </button>
            );
          })()}
          
          <button
            onClick={() => { setWorkspaceView('aiscripts'); setActiveSidebarTab('script'); }}
            className={`px-2.5 py-1 rounded text-[11px] font-bold font-mono uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
              workspaceView === 'aiscripts'
                ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-400 hover:text-white border border-transparent'
            }`}
          >
            <Scroll className="w-3.5 h-3.5" />
            AIScripts
          </button>

          <button
            onClick={() => { setWorkspaceView('libraries'); setActiveSidebarTab('config'); }}
            className={`px-2.5 py-1 rounded text-[11px] font-bold font-mono uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
              workspaceView === 'libraries'
                ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-400 hover:text-white border border-transparent'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            Wares & Jobs
          </button>

          <button
            onClick={() => { setWorkspaceView('ui-designer'); setActiveSidebarTab('ui'); }}
            className={`px-2.5 py-1 rounded text-[11px] font-bold font-mono uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
              workspaceView === 'ui-designer'
                ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-400 hover:text-white border border-transparent'
            }`}
          >
            <Layout className="w-3.5 h-3.5" />
            HUD & LUA UI
          </button>

          <button
            onClick={() => { setWorkspaceView('xmlpatch'); setActiveSidebarTab('config'); }}
            className={`px-2.5 py-1 rounded text-[11px] font-bold font-mono uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
              workspaceView === 'xmlpatch'
                ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-400 hover:text-white border border-transparent'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            XML Patching
          </button>

          <button
            onClick={() => { setWorkspaceView('translation'); setActiveSidebarTab('config'); }}
            className={`px-2.5 py-1 rounded text-[11px] font-bold font-mono uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
              workspaceView === 'translation'
                ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-white border border-transparent'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            Languages (t/)
          </button>

          <button
            onClick={() => { setWorkspaceView('wiki'); setActiveSidebarTab('config'); }}
            className={`px-2.5 py-1 rounded text-[11px] font-bold font-mono uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
              workspaceView === 'wiki'
                ? 'bg-amber-600/20 text-amber-400 border border-amber-500/30'
                : 'text-slate-400 hover:text-white border border-transparent'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            X4 Wiki
          </button>
        </div>

        {/* Preset & Project management utilities */}
        <div className="flex items-center gap-3">
          {/* History Undo/Redo Group */}
          <div className="flex items-center gap-1 bg-black/45 border border-white/10 p-1 rounded-md">
            <button
              onClick={handleUndo}
              disabled={pastStates.length === 0}
              className={`p-1 px-2 rounded font-mono text-[11px] flex items-center gap-1 transition-all ${
                pastStates.length > 0
                  ? 'text-cyan-400 hover:bg-cyan-500/10 cursor-pointer'
                  : 'text-slate-600 cursor-not-allowed'
              }`}
              title="Undo last action (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span className="text-[9px]">({pastStates.length})</span>
            </button>
            <button
              onClick={handleRedo}
              disabled={futureStates.length === 0}
              className={`p-1 px-2 rounded font-mono text-[11px] flex items-center gap-1 transition-all ${
                futureStates.length > 0
                  ? 'text-cyan-400 hover:bg-cyan-500/10 cursor-pointer'
                  : 'text-slate-600 cursor-not-allowed'
              }`}
              title="Redo action (Ctrl+Y)"
            >
              <Redo2 className="w-3.5 h-3.5" />
              <span className="text-[9px]">({futureStates.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 bg-black/35 rounded border border-white/10 p-1">
            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider px-1">Preset:</span>
            <select
              onChange={(e) => handleLoadPreset(e.target.value as any)}
              className="bg-[#0F1115] border border-white/10 p-1 rounded text-[10px] font-mono text-slate-300 focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="blank">Blank Workspace</option>
              <option value="escort">Elite Fighter Wing Escort</option>
              <option value="mission">Argon Sector Bounty System</option>
            </select>
          </div>

          <button
            onClick={() => setIsSyncModalOpen(true)}
            className="px-3 py-1 border border-cyan-500/30 hover:border-cyan-500/80 bg-cyan-500/10 text-cyan-400 rounded font-mono text-[11px] hover:bg-cyan-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
            title="Load existing mods or push updates to GitHub"
          >
            <FolderGit2 className="w-3.5 h-3.5" />
            SYNC MOD
          </button>

          <button
            onClick={() => setIsAIConfigOpen(true)}
            className="px-3 py-1 border border-amber-500/25 hover:border-[#df9825] bg-amber-500/5 text-amber-400 rounded font-mono text-[11px] hover:bg-amber-500/15 transition-all flex flex-col justify-center items-start text-left cursor-pointer select-none leading-tight gap-0.5"
            title={`Configure AI: Active Engine: ${activeAIProvider.toUpperCase()} | Model: ${activeAIModel} | Reasoning: ${activeReasoning}`}
          >
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-amber-500 animate-pulse" />
              <span className="font-bold text-[9px] tracking-wide text-slate-200 uppercase">AI ENGINE: {activeAIProvider.toUpperCase()}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[8.5px] text-[#df9825] font-mono leading-none">
              <span className="opacity-95">{activeAIModel.length > 20 ? activeAIModel.substring(0, 18) + '...' : activeAIModel}</span>
              {activeReasoning !== 'none' && (
                <span className="bg-[#df9825]/15 px-1 py-0.5 rounded border border-[#df9825]/20 text-[7px] uppercase font-bold text-emerald-400">
                  THINK:{activeReasoning}
                </span>
              )}
            </div>
          </button>

          <button
            onClick={() => setIsAgentBridgeOpen(prev => !prev)}
            className={`px-3 py-1 border rounded font-mono text-[11px] transition-all flex items-center gap-1.5 cursor-pointer ${
              isAgentBridgeOpen
                ? 'bg-cyan-600/20 text-cyan-400 border-cyan-500/50 hover:bg-cyan-600/30 font-bold'
                : 'bg-black/40 text-slate-300 border-white/10 hover:border-cyan-400/40 hover:text-white'
            }`}
            title="Open External AI Agent API Control panel and documentation"
          >
            <Cpu className="w-3.5 h-3.5" />
            AGENT API
          </button>

          <button
            onClick={() => setIsDirSettingsOpen(true)}
            className="px-3 py-1 border border-white/10 hover:border-cyan-400/40 bg-black/40 text-slate-300 hover:text-white rounded font-mono text-[11px] transition-all flex items-center gap-1.5 cursor-pointer"
            title="Manage all folders the studio uses (Mod Workspace, X4 game path, schema)"
          >
            <SettingsGear className="w-3.5 h-3.5" />
            SETTINGS
          </button>

          <button
            onClick={handleClearWorkspace}
            className="px-3 py-1 border border-red-500/10 hover:border-red-500/30 bg-red-500/5 text-red-400 rounded font-mono text-[11px] hover:bg-red-500/10 transition-all flex items-center gap-1 cursor-pointer"
            title="Clean workspace back to blank state"
          >
            <Trash className="w-3.5 h-3.5" />
            RESET
          </button>
        </div>
      </header>

      {/* Main Workspace split panel areas */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Left Side: Drag control panel, property editor inspector */}
        <Sidebar
          width={leftSidebarWidth}
          activeTab={activeSidebarTab}
          setActiveTab={setActiveSidebarTab}
          workspace={workspace}
          setWorkspace={(updater) => {
            // Save state checkpoint before doing adjustments from sidebar fields
            saveCheckpoint();
            setWorkspace(updater);
          }}
          onAddNode={handleAddNode}
          onAddUIWidget={handleAddUIWidget}
          selectedNode={selectedNode}
          setSelectedNode={setSelectedNode}
          selectedWidget={selectedWidget}
          setSelectedWidget={setSelectedWidget}
          modWorkspacePath={modWorkspacePath}
          filesystemPath={filesystemPath}
          saveCheckpoint={saveCheckpoint}
          workspaceView={workspaceView}
          setWorkspaceView={setWorkspaceView}
          schemaTemplates={schemaTemplates}
          onSchemaConfigChanged={loadSchemaLibrary}
          onOpenEditorFile={(file) => {
            setActiveEditorFile(file);
          }}
          workspaceDirMode={workspaceDirMode}
          setWorkspaceDirMode={setWorkspaceDirMode}
          compileStatus={compileStatus}
          compileMessage={compileMessage}
          handleCompileModProject={handleCompileModProject}
          visibleCueIds={visibleCueIds}
          setVisibleCueIds={setVisibleCueIds}
          setFocusNodeRequest={setFocusNodeRequest}
        />

        {/* Left Resizer Handle */}
        <div
          className={`w-1 cursor-col-resize hover:bg-cyan-500/50 hover:w-1.5 transition-all bg-white/5 h-full relative z-40 select-none shrink-0 ${
            isResizingLeft ? 'bg-cyan-500 w-1.5' : ''
          }`}
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizingLeft(true);
          }}
        />

        {/* Center: Canvas editor viewport (Based on active workspace mode) */}
        <main className="flex-1 flex flex-col h-full overflow-hidden border-r border-white/10 bg-[#0a0c10]">
          
          {workspaceView === 'blueprint' ? (
            <Canvas
              workspace={workspace}
              setWorkspace={setWorkspace}
              saveCheckpoint={saveCheckpoint}
              selectedNode={selectedNode}
              setSelectedNode={setSelectedNode}
              schemaTemplates={schemaTemplates}
              visibleCueIds={visibleCueIds}
              focusNodeRequest={focusNodeRequest}
            />
          ) : workspaceView === 'ui-designer' ? (
            <UIBuilder
              workspace={workspace}
              setWorkspace={setWorkspace}
              selectedWidget={selectedWidget}
              setSelectedWidget={setSelectedWidget}
            />
          ) : workspaceView === 'aiscripts' ? (
            <AIScriptEditor
              workspace={workspace}
              setWorkspace={setWorkspace}
            />
          ) : workspaceView === 'libraries' ? (
            <LibraryConfigurator
              workspace={workspace}
              setWorkspace={setWorkspace}
            />
          ) : workspaceView === 'translation' ? (
            <TFileEditor
              workspace={workspace}
              setWorkspace={setWorkspace}
            />
          ) : workspaceView === 'wiki' ? (
            <WikiBrowser
              selectedNode={selectedNode}
              setSelectedNode={setSelectedNode}
              setWorkspace={setWorkspace}
            />
          ) : (
            <XMLPatchSystem
              workspace={workspace}
              setWorkspace={setWorkspace}
            />
          )}

        </main>

        {/* Right Resizer Handle */}
        <div
          className={`w-1 cursor-col-resize hover:bg-cyan-500/50 hover:w-1.5 transition-all bg-white/5 h-full relative z-40 select-none shrink-0 ${
            isResizingRight ? 'bg-cyan-500 w-1.5' : ''
          }`}
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizingRight(true);
          }}
        />

        {/* Right Side: Real-time Synchronized compiler preview output */}
        <aside className="shrink-0 flex flex-col h-full bg-[#12141a] border-l border-[#df9825]/10 justify-between" style={{ width: rightSidebarWidth }}>
          <CodePreview 
            workspace={workspace} 
            setWorkspace={setWorkspace} 
            saveCheckpoint={saveCheckpoint} 
            modWorkspacePath={modWorkspacePath}
            compileStatus={compileStatus}
            compileMessage={compileMessage}
            handleCompileModProject={handleCompileModProject}
            activeEditorFile={activeEditorFile}
            setActiveEditorFile={setActiveEditorFile}
            selectedNode={selectedNode}
          />
        </aside>

      </div>

      {/* Embedded Intelligent AI Guide Drawer chatbot */}
      <AIHelper 
        workspace={workspace}
        setWorkspace={setWorkspace}
        localVersion={localVersion}
        setLocalVersion={setLocalVersion}
      />

      {/* External AI Agent Developer Connection Gateway drawer panel */}
      <AgentBridge
        isOpen={isAgentBridgeOpen}
        onClose={() => setIsAgentBridgeOpen(false)}
        workspace={workspace}
        setWorkspace={setWorkspace}
        localVersion={localVersion}
        setLocalVersion={setLocalVersion}
      />

      {/* Load Mod & GitHub Synchronization Module */}
      <SyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        workspace={workspace}
        setWorkspace={setWorkspace}
        saveCheckpoint={saveCheckpoint}
        setWorkspaceView={setWorkspaceView}
      />

      {/* AI Connection Provider Settings Modal */}
      <AIConnectionModal
        isOpen={isAIConfigOpen}
        onClose={() => setIsAIConfigOpen(false)}
      />

      {/* Directory Settings Modal — manages every folder the studio needs */}
      <DirectorySettingsModal
        isOpen={isDirSettingsOpen}
        onClose={() => setIsDirSettingsOpen(false)}
        modWorkspacePath={modWorkspacePath}
        setModWorkspacePath={setModWorkspacePath}
        filesystemPath={filesystemPath}
        setFilesystemPath={setFilesystemPath}
      />
    </div>
  );
}
