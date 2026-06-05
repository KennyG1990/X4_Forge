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
  Package
} from 'lucide-react';
import Sidebar from './components/Sidebar';
import SyncModal from './components/SyncModal';
import Canvas from './components/Canvas';
import UIBuilder from './components/UIBuilder';
import CodePreview from './components/CodePreview';
import AIHelper from './components/AIHelper';
import AgentBridge from './components/AgentBridge';
import AIConnectionModal from './components/AIConnectionModal';
import AIScriptEditor from './components/AIScriptEditor';
import LibraryConfigurator from './components/LibraryConfigurator';
import XMLPatchSystem from './components/XMLPatchSystem';
import { ModWorkspace, MDNode, UIWidget, PRESETS, NODE_TEMPLATES, sanitizeWorkspace } from './types';
import { getActiveProvider, getProviderModel, getProviderReasoning } from './lib/apiHelper';

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
      properties: { name: "My_Startup_Cue", instantiate: "false", namespace: "this", state: "active" },
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
  const [rawWorkspace, setRawWorkspace] = useState<ModWorkspace>(() => {
    // Attempt local storage sync
    const stored = localStorage.getItem('x4_mod_studio_workspace');
    const parsed = stored ? JSON.parse(stored) : BLANK_WORKSPACE;
    return sanitizeWorkspace(parsed);
  });

  const setWorkspace = React.useCallback((value: React.SetStateAction<ModWorkspace>) => {
    setRawWorkspace(prev => {
      const next = typeof value === 'function' ? (value as Function)(prev) : value;
      return sanitizeWorkspace(next);
    });
  }, []);

  const workspace = rawWorkspace;

  const [workspaceView, setWorkspaceView] = useState<'blueprint' | 'ui-designer' | 'aiscripts' | 'libraries' | 'xmlpatch'>('blueprint');
  const [activeSidebarTab, setActiveSidebarTab] = useState<'script' | 'ui' | 'config' | 'filesystem'>('script');

  const [dirHandle, setDirHandle] = useState<any | null>(null);
  const [dirName, setDirName] = useState<string>('');

  const [selectedNode, setSelectedNode] = useState<MDNode | null>(null);
  const [selectedWidget, setSelectedWidget] = useState<UIWidget | null>(null);

  const [localVersion, setLocalVersion] = useState<number>(1);
  const [isAgentBridgeOpen, setIsAgentBridgeOpen] = useState<boolean>(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState<boolean>(false);
  const [isAIConfigOpen, setIsAIConfigOpen] = useState<boolean>(false);

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
        }
      } catch (err) {
        console.warn("Could not synchronize local edits to server workspace space.");
      }
    };

    const debounceTimer = setTimeout(syncLocalEditsToServer, 1000);
    return () => clearTimeout(debounceTimer);
  }, [workspace]);

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


  return (
    <div className="w-screen h-screen flex flex-col bg-[#0F1115] text-slate-300 font-sans">
      {/* Upper Technical Header */}
      <header className="h-12 border-b border-white/10 bg-[#161920] px-4 flex items-center justify-between shrink-0 font-mono">
        
        {/* Workspace Brand and Logo */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-cyan-600 rounded flex items-center justify-center font-bold text-white text-xs">X4</div>
            <span className="font-semibold text-white tracking-tight">X4:MD STUDIO v2.4</span>
          </div>
        </div>

        {/* View Selection Mode Tabs */}
        <div id="view_selection_modes" className="flex items-center gap-1 p-1 rounded-md bg-black/45 border border-white/10">
          <button
            onClick={() => { setWorkspaceView('blueprint'); setActiveSidebarTab('script'); }}
            className={`px-2.5 py-1 rounded text-[11px] font-bold font-mono uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
              workspaceView === 'blueprint'
                ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-400 hover:text-white border border-transparent'
            }`}
          >
            <GitFork className="w-3.5 h-3.5" />
            MD Scripts
          </button>
          
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
          dirHandle={dirHandle}
          setDirHandle={setDirHandle}
          dirName={dirName}
          setDirName={setDirName}
          saveCheckpoint={saveCheckpoint}
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
          ) : (
            <XMLPatchSystem
              workspace={workspace}
              setWorkspace={setWorkspace}
            />
          )}

        </main>

        {/* Right Side: Real-time Synchronized compiler preview output */}
        <aside className="w-[460px] shrink-0 flex flex-col h-full bg-[#12141a] border-l border-[#df9825]/10 justify-between">
          <CodePreview 
            workspace={workspace} 
            setWorkspace={setWorkspace} 
            saveCheckpoint={saveCheckpoint} 
            dirHandle={dirHandle}
            setDirHandle={setDirHandle}
            dirName={dirName}
            setDirName={setDirName}
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
      />

      {/* AI Connection Provider Settings Modal */}
      <AIConnectionModal
        isOpen={isAIConfigOpen}
        onClose={() => setIsAIConfigOpen(false)}
      />
    </div>
  );
}
