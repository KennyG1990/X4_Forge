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
  Plus,
  Sliders,
  Wrench,
  Sparkles,
  Info,
  BookOpen,
  PackageCheck,
  Folder,
  HardDrive,
  GitBranch,
  Compass,
  Library,
  Trash2,
  Activity,
  Terminal,
  Database,
  Tags,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose
} from 'lucide-react';
import { 
  NODE_TEMPLATES,
  ModWorkspace,
  MDNode, 
  UIWidget,
  ChatMessage,
  PackageDiagnostic
} from '../types';
import DirectoryExplorer from './DirectoryExplorer';
import PlaytestWorkspace from './PlaytestWorkspace';
import { toContentVersion, toSafeModId } from '../lib/modCompiler';
import DiagnosticsCenter from './DiagnosticsCenter';
import SnapshotManager from './SnapshotManager';
import SourceControl from './SourceControl';
import ErrorBoundary from './ErrorBoundary';
import CueViewer from './CueViewer';
import AIHelper from './AIHelper';
import ObjectBrowser from './ObjectBrowser';
import type { ModBlueprint } from '../lib/modBlueprint';
import { MOD_PATTERNS, stampPatternIntoWorkspace } from '../lib/modPatterns';
import type { ArchitectStepView } from './BlueprintPanel';
import VirtualizedNodeToolbox from './VirtualizedNodeToolbox';
import type { DiagnosticsScope } from './DiagnosticsCenter';
import {
  SIDEBAR_NAV_ITEMS,
  visibleSidebarTabs,
  type SidebarTab,
  type StudioLayoutPreferences,
} from '../lib/studioLayout';
import type { ValidationDeltaResult } from '../lib/validationDelta';
import type { WorkspaceValidationInputs } from '../lib/workspaceValidationInputs';
import type { WorkspaceSourceSyncStatus } from '../lib/workspaceSourceSync';

interface SidebarProps {
  width?: number;
  /** A4.1 — AI presence gate. When false (tier=off), the AI Co-pilot tab is absent. */
  aiEnabled?: boolean;
  /** Live md.xsd tag set for the AI review's unknown-tag check (forwarded to AIHelper). */
  aiKnownTags?: Set<string>;
  /** A4.3 — active AI presence tier (forwarded to AIHelper to gate Builder/Architect surfaces). */
  aiTier?: 'off' | 'explain' | 'assist' | 'cobuild';
  /** A5.2 — Architect blueprint + agent-loop controls (forwarded to AIHelper). */
  architectBlueprint?: ModBlueprint;
  onBlueprintChange?: (b: ModBlueprint) => void;
  onRunArchitectStep?: () => void;
  architectRunning?: boolean;
  architectStep?: ArchitectStepView | null;
  onConfirmArchitectStep?: () => void;
  onDeclineArchitectStep?: () => void;
  architectCanRun?: boolean;
  architectRunDisabledReason?: string;
  /** A4.7 — abort the in-flight AI request (forwarded to AIHelper). */
  onAiCancel?: () => void;
  activeTab: SidebarTab;
  setActiveTab: (tab: SidebarTab) => void;
  layoutPreferences: StudioLayoutPreferences;
  onMoveTool: (tool: SidebarTab, target: SidebarTab | number) => void;
  onToggleToolRail: () => void;
  onTogglePanel: () => void;
  onOpenLayoutSettings: () => void;
  workspace: ModWorkspace;
  setWorkspace: React.Dispatch<React.SetStateAction<ModWorkspace>>;
  onAddNode: (template: Omit<MDNode, 'id' | 'x' | 'y'>) => void;
  onAddUIWidget: (type: string) => void;
  selectedNode: MDNode | null;
  setSelectedNode: React.Dispatch<React.SetStateAction<MDNode | null>>;
  selectedWidget: UIWidget | null;
  setSelectedWidget: React.Dispatch<React.SetStateAction<UIWidget | null>>;
  modWorkspacePath: string;
  filesystemPath: string;
  saveCheckpoint: (customTarget?: ModWorkspace) => void;
  workspaceView?: 'blueprint' | 'ui-designer' | 'aiscripts' | 'libraries' | 'xmlpatch' | 'contracts' | 'translation' | 'wiki' | 'project' | 'galaxy';
  setWorkspaceView?: (view: 'blueprint' | 'ui-designer' | 'aiscripts' | 'libraries' | 'xmlpatch' | 'contracts' | 'translation' | 'wiki' | 'project' | 'galaxy') => void;
  schemaTemplates?: Omit<MDNode, 'id' | 'x' | 'y'>[];
  onSchemaConfigChanged?: () => Promise<void> | void;
  /** Opens the Directory Settings modal — the single authority for the XSD schema directory. */
  onOpenDirectorySettings?: () => void;
  /** Bumped by App when the Directory Settings modal closes, so the read-only schema panel refreshes. */
  schemaConfigVersion?: number;
  onOpenEditorFile?: (file: {
    name: string;
    path: string;
    content: string;
    handle?: FileSystemFileHandle;
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
  aiActiveMode: 'chat' | 'builder' | 'architect';
  setAiActiveMode: (mode: 'chat' | 'builder' | 'architect') => void;
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
  diagnosticSource: 'checking' | 'project' | 'local';
  validationDelta?: ValidationDeltaResult | null;
  validationInputs?: WorkspaceValidationInputs;
  diagnosticsScope: DiagnosticsScope;
  onDiagnosticsScopeChange: (scope: DiagnosticsScope) => void;
  onSuppressionCommitted?: (sourceHash: string) => void;
  onSelectSnapshot?: (snapWS: ModWorkspace | null) => void;
  onOpenReleaseCenter?: () => void;
  drawerOpen?: boolean;
  sourceSync?: WorkspaceSourceSyncStatus | null;
  diskSyncBusy?: boolean;
  onReloadFromDisk?: () => void;
}

const TOOL_ICONS: Record<SidebarTab, React.ComponentType<{ className?: string }>> = {
  script: Layers,
  cues: Compass,
  ui: Layout,
  config: Tags,
  filesystem: FolderGit2,
  git: GitBranch,
  templates: Library,
  ai: Sparkles,
  playtest: Terminal,
  diagnostics: Activity,
  reference: Database,
};

const TOOL_TITLES: Record<SidebarTab, string> = {
  script: 'MD Nodes',
  cues: 'Cue Hierarchy',
  ui: 'Menu Widgets',
  config: 'Mod Meta',
  filesystem: 'Filesystem',
  git: 'Source Control',
  templates: 'Templates',
  ai: 'AI Co-pilot',
  playtest: 'Playtest Workspace',
  diagnostics: 'Diagnostics — continuous project, script, package & install checks',
  reference: 'Local Object Browser',
};

const TOOL_GROUPS: Record<SidebarTab, 'author' | 'project' | 'quality' | 'ref'> = {
  script: 'author',
  cues: 'author',
  ui: 'author',
  templates: 'author',
  config: 'project',
  filesystem: 'project',
  git: 'project',
  diagnostics: 'quality',
  playtest: 'quality',
  reference: 'ref',
  ai: 'ref',
};

function ToolRail({ activeTab, aiEnabled, layoutPreferences, onSelect, onMove, onCollapse, onOpenSettings }: {
  activeTab: SidebarTab;
  aiEnabled: boolean;
  layoutPreferences: StudioLayoutPreferences;
  onSelect: (tab: SidebarTab) => void;
  onMove: (tool: SidebarTab, target: SidebarTab | number) => void;
  onCollapse: () => void;
  onOpenSettings: () => void;
}) {
  const [dragged, setDragged] = React.useState<SidebarTab | null>(null);
  const visible = visibleSidebarTabs(layoutPreferences, aiEnabled);
  const right = layoutPreferences.toolDock === 'right';
  return (
    <nav aria-label="Forge tools" data-testid="tool-rail" className={`w-[52px] bg-[#0d1016] ${right ? 'border-l' : 'border-r'} border-white/[0.06] flex flex-col items-center py-2 gap-0.5 shrink-0 overflow-y-auto custom-scrollbar`}>
      {visible.map((id, index) => {
        const item = SIDEBAR_NAV_ITEMS.find(candidate => candidate.id === id)!;
        const Icon = TOOL_ICONS[id];
        const active = activeTab === id;
        const prevId = index > 0 ? visible[index - 1] : null;
        const showDivider = prevId !== null && TOOL_GROUPS[prevId] !== TOOL_GROUPS[id];
        return (
          <React.Fragment key={id}>
            {showDivider && <div aria-hidden="true" className="w-6 border-t border-white/[0.06] my-1 shrink-0" />}
            <button
              id={`tab_${id}`}
              data-sidebar-tab={id}
              type="button"
              draggable
              onDragStart={() => setDragged(id)}
              onDragEnd={() => setDragged(null)}
              onDragOver={event => event.preventDefault()}
              onDrop={event => {
                event.preventDefault();
                if (dragged && dragged !== id) {
                  const rect = event.currentTarget.getBoundingClientRect();
                  const remaining = layoutPreferences.toolOrder.filter(candidate => candidate !== dragged);
                  const targetIndex = remaining.indexOf(id);
                  onMove(dragged, targetIndex + (event.clientY > rect.top + rect.height / 2 ? 1 : 0));
                }
                setDragged(null);
              }}
              onClick={() => onSelect(id)}
              aria-label={item.label.toUpperCase()}
              aria-current={active ? 'page' : undefined}
              className={`w-11 min-h-[38px] py-1 px-0.5 rounded-md flex flex-col items-center justify-center transition-colors cursor-pointer ${active
                ? `${id === 'ai' ? 'text-amber-300 bg-amber-500/12 border-amber-400' : id === 'cues' ? 'text-purple-300 bg-purple-500/12 border-purple-400' : 'text-blue-300 bg-blue-500/14 border-blue-400'} ${right ? 'border-r-2' : 'border-l-2'} font-semibold`
                : 'text-[#94a3b8] hover:text-[#eef2f7] hover:bg-white/[0.05]'}`}
              title={`${TOOL_TITLES[id]} — drag to reorder`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {layoutPreferences.density === 'comfortable' && (
                <span className="text-[11px] font-sans font-medium mt-0.5 truncate w-full text-center leading-tight">
                  {item.label}
                </span>
              )}
            </button>
          </React.Fragment>
        );
      })}
      <div className="mt-auto flex flex-col gap-1 pt-2">
        <button type="button" onClick={onOpenSettings} data-testid="studio-settings-tool" className="w-8 h-8 grid place-items-center rounded text-slate-400 hover:text-sky-300 hover:bg-white/5 cursor-pointer" title="Studio Settings — organize workspace and tool tabs">
          <Settings className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={onCollapse} data-testid="tool-rail-collapse" className="w-8 h-8 grid place-items-center rounded text-slate-400 hover:text-sky-300 hover:bg-white/5 cursor-pointer" title="Hide tool rail">
          {right ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      </div>
    </nav>
  );
}

export default function Sidebar({
  width,
  aiEnabled = false,
  aiKnownTags,
  aiTier,
  architectBlueprint,
  onBlueprintChange,
  onRunArchitectStep,
  architectRunning,
  architectStep,
  onConfirmArchitectStep,
  onDeclineArchitectStep,
  architectCanRun,
  architectRunDisabledReason,
  onAiCancel,
  activeTab,
  setActiveTab,
  layoutPreferences,
  onMoveTool,
  onToggleToolRail,
  onTogglePanel,
  onOpenLayoutSettings,
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
  onSchemaConfigChanged: _onSchemaConfigChanged,
  onOpenDirectorySettings,
  schemaConfigVersion,
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
  isAiFloatingOpen: _isAiFloatingOpen,
  setIsAiFloatingOpen: _setIsAiFloatingOpen,
  handleSend,
  handleApplyAction,
  handleDeclineAction,
  diagnostics,
  diagnosticSource,
  validationInputs,
  diagnosticsScope,
  onDiagnosticsScopeChange,
  validationDelta,
  onSuppressionCommitted,
  onSelectSnapshot,
  onOpenReleaseCenter,
  drawerOpen = true,
  sourceSync = null,
  diskSyncBusy = false,
  onReloadFromDisk,
}: SidebarProps) {
  const [nodeFilter, setNodeFilter] = useState<'all' | 'cue' | 'event' | 'condition' | 'action'>('all');
  const [schemaDir, setSchemaDir] = useState<string>('');

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
    files?: Array<{
      domain: string;
      file: string;
      sizeBytes: number;
      includes: string[];
      missingIncludes: string[];
    }>;
    error?: string;
  }>({});
  const [schemaMessage, setSchemaMessage] = useState<string>('');
  const [schemaMessageType, setSchemaMessageType] = useState<'success' | 'error'>('success');

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

  const allTemplates = React.useMemo(() => {
    const byTag = new Map<string, Omit<MDNode, 'id' | 'x' | 'y'>>();
    NODE_TEMPLATES.forEach(template => byTag.set(template.xmlTag, template));
    schemaTemplates.forEach(template => {
      if (!byTag.has(template.xmlTag)) byTag.set(template.xmlTag, template);
    });
    return Array.from(byTag.values());
  }, [schemaTemplates]);

  const loadSchemaConfig = React.useCallback(async () => {
    try {
      const [response, registryResponse] = await Promise.all([
        fetch('/api/schema/config'),
        fetch('/api/agent/schema-registry'),
      ]);
      if (!response.ok) throw new Error('Schema config endpoint unavailable');
      const data = await response.json();
      const registry = registryResponse.ok
        ? await registryResponse.json() as { domains?: Array<{ domain: string; file: string; sizeBytes: number; includes?: string[]; missingIncludes?: string[] }> }
        : { domains: [] };
      setSchemaDir(data.resolved?.schemaDir || '');
      setSchemaStatus({
        mdXsdPath: data.resolved?.mdXsdPath,
        commonXsdPath: data.resolved?.commonXsdPath,
        mdExists: data.resolved?.mdExists,
        commonExists: data.resolved?.commonExists,
        loaded: data.loaded,
        counts: data.schema_counts,
        files: (registry.domains || []).map(file => ({
          domain: file.domain,
          file: file.file,
          sizeBytes: file.sizeBytes,
          includes: file.includes || [],
          missingIncludes: file.missingIncludes || [],
        })),
        error: data.error
      });
      setSchemaMessage('');
      setSchemaMessageType('success');
    } catch (error: unknown) {
      setSchemaMessage(error instanceof Error ? error.message : 'Failed to load schema settings.');
      setSchemaMessageType('error');
    }
  }, []);

  useEffect(() => {
    loadSchemaConfig();
  }, [loadSchemaConfig, schemaConfigVersion]);

  return (
    <div
      id="side_panel"
      style={{ width: drawerOpen ? width : (layoutPreferences.toolRailCollapsed ? 24 : 52) }}
      data-tool-dock={layoutPreferences.toolDock}
      data-drawer-open={drawerOpen ? 'true' : 'false'}
      className={`${layoutPreferences.toolDock === 'right' ? 'border-l flex-row-reverse order-2' : 'border-r order-0'} border-white/[0.08] bg-[#11141a] flex h-full text-slate-300 min-w-0 max-w-[70vw] shrink-0`}
    >
      {/* Config-driven tool rail. Hidden tools remain recoverable in Settings. */}
      {layoutPreferences.toolRailCollapsed ? (
        <div className={`${layoutPreferences.toolDock === 'right' ? 'border-l' : 'border-r'} border-white/[0.06] bg-[#0d1016] w-6 shrink-0 flex flex-col items-center pt-2`}>
          <button
            type="button"
            onClick={onToggleToolRail}
            data-testid="tool-rail-restore"
            className="w-5 h-8 grid place-items-center text-blue-300 hover:bg-blue-500/10 rounded"
            title="Show tool rail"
          >
            {layoutPreferences.toolDock === 'right' ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      ) : (
        <ToolRail
          activeTab={activeTab}
          aiEnabled={aiEnabled}
          layoutPreferences={layoutPreferences}
          onSelect={setActiveTab}
          onMove={onMoveTool}
          onCollapse={onToggleToolRail}
          onOpenSettings={onOpenLayoutSettings}
        />
      )}

      {/* Right Content Column */}
      {drawerOpen && (
      <div className="flex-1 flex flex-col min-w-0 h-full bg-[#11141a]">
        
        {/* Sleek Tab Header */}
        <div className="h-9 px-3 border-b border-white/[0.08] bg-[#141820] shrink-0 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-[#eef2f7] flex items-center gap-1.5 leading-tight min-w-0">
              {activeTab === 'script' && <Layers className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
              {activeTab === 'cues' && <Compass className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
              {activeTab === 'ui' && <Layout className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
              {activeTab === 'config' && <Tags className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
              {activeTab === 'filesystem' && <FolderGit2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
              {activeTab === 'git' && <GitBranch className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
              {activeTab === 'templates' && <Library className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
              {activeTab === 'ai' && <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
              {activeTab === 'playtest' && <Terminal className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
              {activeTab === 'diagnostics' && <Activity className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
              {activeTab === 'reference' && <Database className="w-3.5 h-3.5 text-amber-400 shrink-0" />}

              <span className="min-w-0 truncate">
                {activeTab === 'script' && 'Node Toolbox'}
                {activeTab === 'cues' && 'Cue Hierarchy'}
                {activeTab === 'ui' && 'UI Widgets'}
                {activeTab === 'config' && 'Mod Manifest'}
                {activeTab === 'filesystem' && 'Project Files'}
                {activeTab === 'git' && 'Source Control'}
                {activeTab === 'templates' && 'Reusable Blueprints'}
                {activeTab === 'ai' && 'AI Co-pilot'}
                {activeTab === 'playtest' && 'Playtest Workspace'}
                {activeTab === 'diagnostics' && 'Diagnostics'}
                {activeTab === 'reference' && 'Object Browser'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
          {activeTab === 'git' && (
            <button
              type="button"
              onClick={() => setActiveTab('config')}
              className="px-2 py-0.5 rounded text-[11px] font-medium bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-300 hover:text-white cursor-pointer transition-colors"
              title="Open Mod Manifest & Disk Snapshots"
            >
              Manifest
            </button>
          )}
          {activeTab === 'config' && (
            <button
              type="button"
              onClick={() => setActiveTab('git')}
              className="px-2 py-0.5 rounded text-[11px] font-medium bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-300 hover:text-white cursor-pointer transition-colors"
              title="Open Source Control & GitHub Sync"
            >
              Git
            </button>
          )}
          {activeTab === 'ai' && (
            <button
              onClick={() => setIsAiFloatingVisible(!isAiFloatingVisible)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors border cursor-pointer ${
                isAiFloatingVisible 
                  ? 'bg-amber-500/12 hover:bg-amber-500/20 border-amber-500/30 text-amber-300' 
                  : 'bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-slate-300'
              }`}
              title={isAiFloatingVisible ? "Hide floating AI guide panel" : "Show floating AI guide panel"}
            >
              {isAiFloatingVisible ? "Hide Float ✕" : "Show Float ⎋"}
            </button>
          )}
          <button type="button" data-testid="side-panel-collapse" onClick={onTogglePanel} className="w-6 h-6 grid place-items-center rounded text-slate-400 hover:text-sky-300 hover:bg-white/5 cursor-pointer" title="Hide side panel">
            <PanelLeftClose className="w-3.5 h-3.5" />
          </button>
          </div>
        </div>

        {/* Contextual Editor Domain Hint when opening an editor-specific palette on another domain */}
        {(activeTab === 'script' || activeTab === 'cues' || activeTab === 'templates') && workspaceView !== 'blueprint' && setWorkspaceView && (
          <div className="mx-2.5 mt-2 rounded-md border border-sky-500/25 bg-sky-500/10 px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px] text-sky-200 shrink-0">
            <span className="truncate">Mission Director palette</span>
            <button
              type="button"
              onClick={() => setWorkspaceView('blueprint')}
              className="shrink-0 rounded bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/35 px-2 py-0.5 text-[11px] font-semibold text-sky-100 cursor-pointer"
            >
              Open MD Scripts
            </button>
          </div>
        )}
        {activeTab === 'ui' && workspaceView !== 'ui-designer' && setWorkspaceView && (
          <div className="mx-2.5 mt-2 rounded-md border border-sky-500/25 bg-sky-500/10 px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px] text-sky-200 shrink-0">
            <span className="truncate">HUD &amp; UI widget palette</span>
            <button
              type="button"
              onClick={() => setWorkspaceView('ui-designer')}
              className="shrink-0 rounded bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/35 px-2 py-0.5 text-[11px] font-semibold text-sky-100 cursor-pointer"
            >
              Open HUD &amp; Lua UI
            </button>
          </div>
        )}

        {/* Main Content Pane */}
        <div className={`flex-1 min-w-0 min-h-0 ${activeTab === 'diagnostics'
          ? 'p-0 overflow-hidden'
          : `overflow-y-auto ${activeTab === 'filesystem' || activeTab === 'git' || activeTab === 'cues' || activeTab === 'ai' || activeTab === 'playtest' ? 'p-0' : 'p-3 space-y-3'}`}`}>
        {activeTab === 'cues' && (
          <CueViewer
            workspace={workspace}
            selectedNode={selectedNode}
            setSelectedNode={setSelectedNode}
            setFocusNodeRequest={setFocusNodeRequest}
            visibleCueIds={visibleCueIds}
            setVisibleCueIds={setVisibleCueIds}
            setWorkspace={setWorkspace}
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

        {activeTab === 'playtest' && (
          <ErrorBoundary label="Playtest Workspace">
            <PlaytestWorkspace
              workspace={workspace}
              setWorkspace={setWorkspace}
              saveCheckpoint={saveCheckpoint}
              activeModId={toSafeModId(workspace.name)}
              modWorkspacePath={modWorkspacePath}
              onOpenReleaseCenter={onOpenReleaseCenter}
            />
          </ErrorBoundary>
        )}

        {activeTab === 'diagnostics' && (
          <ErrorBoundary label="Diagnostics">
            <DiagnosticsCenter
              workspace={workspace}
              setWorkspace={setWorkspace}
              saveCheckpoint={saveCheckpoint}
              modWorkspacePath={modWorkspacePath}
              setWorkspaceView={setWorkspaceView}
              diagnostics={diagnostics}
              diagnosticSource={diagnosticSource}
              validationInputs={validationInputs}
              validationDelta={validationDelta}
              scope={diagnosticsScope}
              onScopeChange={onDiagnosticsScopeChange}
              onOpenCues={() => setActiveTab('cues')}
              aiEnabled={aiEnabled}
              onSuppressionCommitted={onSuppressionCommitted}
              onReloadFromDisk={onReloadFromDisk}
              diskSyncBusy={diskSyncBusy}
              canReloadFromDisk={Boolean(sourceSync?.reimportTarget)}
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
              <h3 className="text-xs font-semibold text-slate-200 mb-2">Node types</h3>
              <div className="grid grid-cols-2 gap-1 bg-[#0a0d12] p-1 rounded-md border border-white/[0.08]">
                {(['all', 'cue', 'event', 'condition', 'action'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setNodeFilter(type)}
                    className={`px-2 py-1 text-[11px] font-medium rounded capitalize transition-colors cursor-pointer ${
                      nodeFilter === type
                        ? 'bg-sky-500/15 text-sky-200 border border-sky-500/35'
                        : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>Toolbox (click to create)</span>
              </h3>
              <VirtualizedNodeToolbox templates={allTemplates} nodeType={nodeFilter} onAddNode={onAddNode} />
            </div>
          </div>
        )}

        {/* UI MOD CUSTOMIZER WIDGETS (Tab: ui) */}
        {activeTab === 'ui' && (
          <div className="space-y-4">
            <div className="bg-sky-950/15 border border-sky-500/25 p-2.5 rounded-md text-[11px] leading-relaxed text-slate-300">
              <span className="text-sky-300 font-semibold block mb-0.5">X4 Custom UI rules</span>
              Design working contextual HUD menus or consoles. Add containers, tables, lists, progress bars, and macro buttons.
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-medium text-slate-300 mb-1.5">UI widgets library</h3>
              {[
                { type: 'window', title: 'Context Window Frame', desc: 'Outer widget window layout container' },
                { type: 'header', title: 'Tactical Title / Header', desc: 'Wide high-contrast tactical title bar' },
                { type: 'table', title: 'Standard Data Table', desc: 'Pre-styled multi-row grid framework' },
                { type: 'button', title: 'Macro Menu Button', desc: 'Fires visual cues on selection click' },
                { type: 'progressbar', title: 'Status Progress Bar', desc: 'Clean status / shield indicator' },
                { type: 'text', title: 'Display Label', desc: 'Human-readable description labels' },
                { type: 'dropdown', title: 'Interactive Selector', desc: 'Drop-down values list widget' },
                { type: 'input', title: 'Text Input Box', desc: 'Custom command or log entry text field' },
                { type: 'chat', title: 'Dialogue Chat Logs', desc: 'Scrollable live dialogue transmissions list' }
              ].map(widget => {
                let widgetIcon = <Layout className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
                if (widget.type === 'header') widgetIcon = <Layers className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
                if (widget.type === 'table') widgetIcon = <Library className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
                if (widget.type === 'button') widgetIcon = <Plus className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
                if (widget.type === 'progressbar') widgetIcon = <Sliders className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
                if (widget.type === 'text') widgetIcon = <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
                if (widget.type === 'dropdown') widgetIcon = <ChevronRight className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
                if (widget.type === 'input') widgetIcon = <Settings className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
                if (widget.type === 'chat') widgetIcon = <BookOpen className="w-3.5 h-3.5 text-purple-400 shrink-0" />;

                return (
                  <button
                    key={widget.type}
                    onClick={() => onAddUIWidget(widget.type)}
                    className="w-full text-left p-2.5 rounded-md bg-[#0a0d12] border border-white/[0.08] hover:bg-sky-500/[0.06] hover:border-sky-500/40 transition-colors flex items-center gap-2.5 group cursor-pointer"
                  >
                    {widgetIcon}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-slate-200 group-hover:text-white truncate leading-tight">
                        {widget.title}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                        {widget.desc}
                      </div>
                    </div>
                    <Plus className="w-3.5 h-3.5 text-slate-500 opacity-0 group-hover:opacity-100 group-hover:text-sky-300 transition-opacity shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* METADATA CONFIG (Tab: config) */}
        {activeTab === 'config' && (
          <div className="space-y-4 text-xs">
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">Mod script identifier</label>
                <input
                  type="text"
                  value={workspace.name}
                  onChange={e => setWorkspace(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full p-2 rounded-md bg-[#0a0d12] border border-white/[0.08] text-xs font-mono text-white focus:outline-none focus:border-sky-500/60 transition-colors"
                  placeholder="e.g. My_Elite_Mod"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">Version string</label>
                <input
                  type="text"
                  value={workspace.version}
                  onChange={e => setWorkspace(prev => ({ ...prev, version: e.target.value }))}
                  className="w-full p-2 rounded-md bg-[#0a0d12] border border-white/[0.08] text-xs font-mono text-white focus:outline-none focus:border-sky-500/60 transition-colors"
                  placeholder="e.g. 1.0.0 or 100"
                />
                {/* Audit #1: live X4-version preview — semver ("1.0.0") and X4 integers ("100")
                    are both accepted; this shows exactly what content.xml will carry. */}
                <p className="text-[11px] text-slate-400 mt-1 font-mono" data-testid="x4-version-preview">
                  → content.xml version: <span className="text-sky-300">{toContentVersion(workspace.version)}</span>
                  {' '}(shown in-game as v{(parseInt(toContentVersion(workspace.version), 10) / 100).toFixed(2)})
                </p>
                {sourceSync?.known && sourceSync.diskMeta?.version && sourceSync.versionDrifted && (
                  <div
                    data-testid="disk-version-drift-notice"
                    className="mt-1.5 rounded border border-amber-500/35 bg-amber-500/10 px-2 py-1.5 font-sans text-[11px] text-amber-200 space-y-1"
                  >
                    <div>
                      On disk <span className="font-mono">content.xml</span>: <span className="font-mono font-semibold text-amber-100">{sourceSync.diskMeta.version}</span> (v{(parseInt(toContentVersion(sourceSync.diskMeta.version), 10) / 100).toFixed(2)}) — workspace snapshot differs
                    </div>
                    {onReloadFromDisk && sourceSync.reimportTarget && (
                      <button
                        type="button"
                        data-testid="manifest-reload-from-disk-btn"
                        disabled={diskSyncBusy}
                        onClick={onReloadFromDisk}
                        className="rounded border border-amber-400/45 bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-100 hover:bg-amber-500/25 cursor-pointer disabled:opacity-50"
                      >
                        {diskSyncBusy ? 'Reloading…' : 'Reload from disk'}
                      </button>
                    )}
                  </div>
                )}
                {sourceSync?.known && sourceSync.inSync === true && sourceSync.diskMeta?.version && !sourceSync.versionDrifted && (
                  <p data-testid="disk-version-synced-badge" className="mt-1 font-sans text-[11px] text-emerald-300/90">
                    Synced with disk content.xml
                  </p>
                )}
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">Author name</label>
                <input
                  type="text"
                  value={workspace.author}
                  onChange={e => setWorkspace(prev => ({ ...prev, author: e.target.value }))}
                  className="w-full p-2 rounded-md bg-[#0a0d12] border border-white/[0.08] text-xs font-mono text-white focus:outline-none focus:border-sky-500/60 transition-colors"
                  placeholder="Your Name"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">Mod description</label>
                <textarea
                  value={workspace.description}
                  onChange={e => setWorkspace(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full p-2 h-20 rounded-md bg-[#0a0d12] border border-white/[0.08] text-xs font-mono text-white focus:outline-none focus:border-sky-500/60 transition-colors resize-none"
                  placeholder="Mod brief synopsis..."
                />
              </div>
            </div>

            <div className="border-t border-white/[0.08] pt-4 space-y-3">
              <h3 className="text-xs font-semibold text-sky-300 flex items-center gap-1.5">
                <Settings className="w-3.5 h-3.5 shrink-0" />
                XSD schema source
              </h3>

              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">Schema directory</label>
                <div className="w-full p-2 rounded-md bg-[#0a0d12] border border-white/[0.08] text-slate-300 font-mono text-[11px] break-all min-h-[34px] flex items-center">
                  {schemaDir || <span className="text-slate-400 italic font-sans">Not configured — set it in Directory Settings</span>}
                </div>
                <p className="text-slate-400 text-[11px] mt-1 leading-snug">
                  Configured in <span className="text-sky-300">Directory Settings</span> (single source of truth). This view is read-only.
                </p>
              </div>

              <details className="group rounded-md bg-[#0a0d12] border border-white/[0.08] text-[11px]">
                <summary className="cursor-pointer list-none p-2.5 flex items-center justify-between gap-2 text-slate-200 hover:text-white">
                  <span className="font-medium">
                    {schemaStatus.files?.length
                      ? `Found ${schemaStatus.files.length} schema files`
                      : schemaStatus.mdExists || schemaStatus.commonExists
                        ? 'Schema files found'
                        : 'No schema files found'}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-sky-400 transition-transform group-open:rotate-90" />
                </summary>
                <div className="max-h-56 overflow-y-auto border-t border-white/[0.08] p-2 space-y-2 custom-scrollbar">
                  {(schemaStatus.files || []).length > 0 ? schemaStatus.files!.map(file => (
                    <div key={`${file.domain}:${file.file}`} className="rounded border border-white/[0.06] bg-white/[0.02] p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sky-300 font-semibold font-mono">{file.domain}</span>
                        <span className="text-slate-400 font-mono">{Math.max(1, Math.round(file.sizeBytes / 1024))} KB</span>
                      </div>
                      <div className="mt-1 text-slate-400 font-mono break-all">{file.file}</div>
                      {file.includes.length > 0 && (
                        <div className="mt-1 text-slate-400 font-mono">includes: {file.includes.join(', ')}</div>
                      )}
                      {file.missingIncludes.length > 0 && (
                        <div className="mt-1 text-amber-300 font-mono">missing: {file.missingIncludes.join(', ')}</div>
                      )}
                    </div>
                  )) : (
                    <div className="text-slate-400">No registry entries were returned.</div>
                  )}
                </div>
              </details>

              {schemaStatus.counts && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 rounded-md bg-[#0a0d12] border border-white/[0.08] p-2 text-[11px] text-slate-400">
                  <span>Events <strong className="text-slate-100">{schemaStatus.counts.events}</strong></span>
                  <span>Actions <strong className="text-slate-100">{schemaStatus.counts.actions}</strong></span>
                  <span>Conditions <strong className="text-slate-100">{schemaStatus.counts.conditions}</strong></span>
                  <span>Control <strong className="text-slate-100">{schemaStatus.counts.control_flow}</strong></span>
                </div>
              )}

              <button
                onClick={() => onOpenDirectorySettings?.()}
                className="w-full px-3 py-2 rounded-md bg-sky-600/20 border border-sky-500/35 text-sky-200 hover:bg-sky-600/30 transition-colors font-medium text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                Edit in Directory Settings
              </button>

              {(schemaMessage || schemaStatus.error) && (
                <div className={`text-[11px] leading-relaxed rounded-md border p-2.5 ${
                  schemaMessageType === 'success' && !schemaStatus.error
                    ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/25 text-rose-300'
                }`}>
                  {schemaMessage || schemaStatus.error}
                </div>
              )}
            </div>

            {/* EXTENSION COMPILER & WORKSPACE STAGING */}
            <div className="border-t border-white/[0.08] pt-4 space-y-3">
              <h3 className="text-xs font-semibold text-sky-300 flex items-center gap-1.5">
                <PackageCheck className="w-3.5 h-3.5 shrink-0" />
                Extension package compiler
              </h3>

              {/* Local Directory Link state */}
              {modWorkspacePath ? (
                <div className="space-y-3">
                  <div className="p-2.5 rounded-md bg-emerald-500/[0.06] border border-emerald-500/25 text-[11px] space-y-1">
                    <div className="flex items-center justify-between text-slate-300 font-medium">
                       <span>Workspace path</span>
                       <span className="text-emerald-300 flex items-center gap-1 font-medium">● Configured</span>
                    </div>
                    <div className="text-slate-100 font-mono break-all flex items-center gap-1.5 text-[11px]">
                      <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      {modWorkspacePath}
                    </div>
                  </div>

                  {/* Staging Directory Layout Choice */}
                  <div>
                    <label className="text-[11px] font-medium text-slate-300 block mb-1 flex items-center gap-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                      Staging directory layout
                    </label>
                    <select
                      value={workspaceDirMode}
                      onChange={(e) => {
                        const val = e.target.value as 'candy' | 'store';
                        if (setWorkspaceDirMode) setWorkspaceDirMode(val);
                        localStorage.setItem('x4_workspace_dir_mode', val);
                      }}
                      className="w-full bg-[#0a0d12] border border-white/[0.08] p-2 rounded-md text-[11px] font-mono text-slate-200 focus:outline-none focus:border-sky-500/60 cursor-pointer"
                    >
                      <option value="store">Extensions Parent Folder (extensions/&lt;mod_id&gt;/)</option>
                      <option value="candy">Direct Mod Folder (content.xml at root)</option>
                    </select>
                    <p className="text-[11px] text-slate-400 leading-snug mt-1">
                      {workspaceDirMode === 'store'
                        ? 'Stages files in extensions/ inside a subdirectory named after your mod.'
                        : 'Writes files (content.xml, md/, etc.) directly inside connected directory.'}
                    </p>
                  </div>

                  {/* Compilation scope targets choice */}
                  <div className="bg-[#0a0d12] border border-white/[0.08] rounded-md p-2.5 space-y-2 select-none">
                    <label className="text-slate-300 block text-[11px] font-medium">
                      Active modules to compile
                    </label>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
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
                        HUD &amp; Lua UI
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
                        Wares &amp; Jobs
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
                    className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-black font-semibold text-xs rounded-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed shrink-0"
                  >
                    <PackageCheck className={`w-4 h-4 ${compileStatus === 'compiling' ? 'animate-pulse' : ''}`} />
                    Compile Mod Extension
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] text-slate-400 leading-relaxed text-center py-2">
                    No workspace staging folder configured. Configure it in Settings to enable compiler.
                  </p>
                </div>
              )}

              {/* Compile results log notification */}
              {compileMessage && (
                <div className={`p-2.5 rounded-md border font-mono text-[11px] ${
                  compileStatus === 'error'
                    ? 'bg-rose-500/10 border-rose-500/25 text-rose-300'
                    : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
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
              <h3 className="text-xs font-semibold text-sky-300 mb-1 flex items-center gap-1.5 leading-tight">
                <Library className="w-4 h-4 text-sky-400 shrink-0" />
                <span>Template blueprints</span>
              </h3>
              <p className="text-[11px] text-slate-400 leading-snug">
                Non-compilable visual templates. Drag them onto the canvas or stamp reusable patterns below.
              </p>
            </div>

            {/* B22s2: proven patterns, stampable MID-CANVAS */}
            <div className="space-y-2 bg-[#0a0d12] p-3 rounded-lg border border-amber-500/20">
              <span className="text-amber-300 font-semibold text-xs block">
                Proven patterns — stamp onto canvas
              </span>
              <p className="text-[11px] text-slate-400 leading-snug">
                Working fragments from shipping mods. Stamping adds the pattern below your current graph without replacing nodes.
              </p>
              {MOD_PATTERNS.map(p => (
                <div key={p.id} className="rounded-md border border-amber-500/20 bg-amber-500/[0.04] p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-amber-200 font-semibold text-[11px] leading-tight">{p.title}</div>
                      <div className="text-slate-300 text-[11px] mt-1 leading-snug">{p.blurb}</div>
                      <div className="text-slate-400 text-[11px] font-mono mt-1 truncate" title={`${p.provenance.provenMod} — ${p.provenance.file}\n${p.provenance.note}`}>
                        {p.provenance.provenMod}
                      </div>
                    </div>
                    <button
                      data-testid={`stamp-pattern-${p.id}`}
                      onClick={() => setWorkspace(ws => stampPatternIntoWorkspace(ws, p.id))}
                      className="shrink-0 px-2.5 py-1 rounded bg-amber-600/25 border border-amber-400/35 hover:bg-amber-600/40 text-amber-100 text-[11px] font-medium cursor-pointer transition-colors"
                      title="Add this pattern below your current graph."
                    >
                      Stamp
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Part 1: CREATE REUSABLE BLUEPRINT */}
            <div className="space-y-3 bg-[#0a0d12] p-3 rounded-lg border border-white/[0.08] text-xs">
              <span className="text-sky-300 font-semibold block">
                Create reusable blueprint
              </span>

              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">Blueprint title</label>
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={e => setNewTemplateName(e.target.value)}
                  className="w-full p-2 rounded-md bg-[#11151d] border border-white/[0.08] text-white focus:outline-none focus:border-sky-500/60 text-[11px]"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">Base node structure</label>
                <select
                  value={newTemplateTypeIdx}
                  onChange={e => setNewTemplateTypeIdx(Number(e.target.value))}
                  className="w-full p-2 rounded-md bg-[#11151d] border border-white/[0.08] text-slate-200 focus:outline-none focus:border-sky-500/60 text-[11px] cursor-pointer"
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
                className="w-full py-1.5 font-medium transition-colors bg-sky-600/20 hover:bg-sky-600/30 text-sky-200 hover:text-white rounded-md border border-sky-500/35 cursor-pointer text-xs text-center"
              >
                + Save as blueprint
              </button>
            </div>

            {/* Part 2: LIST AND EDITING */}
            <div className="space-y-2">
              <div className="text-slate-300 font-medium text-[11px] flex items-center justify-between">
                <span>Available blueprints</span>
                <span className="text-slate-400">Drag or click to add</span>
              </div>

              <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
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
                  let badgeColors = 'bg-blue-500/10 text-blue-300 border-blue-500/25';
                  if (tNode.type === 'cue') badgeColors = 'bg-purple-500/10 text-purple-300 border-purple-500/25';
                  if (tNode.type === 'event') badgeColors = 'bg-amber-500/10 text-amber-300 border-amber-500/30';
                  if (tNode.type === 'condition') badgeColors = 'bg-sky-500/10 text-sky-300 border-sky-500/25';
                  if (tNode.type === 'action') badgeColors = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25';

                  const typeLabel = tNode.type.charAt(0).toUpperCase() + tNode.type.slice(1);
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
                      className={`p-2.5 rounded-md bg-[#161b24] border hover:border-sky-500/45 transition-colors flex flex-col gap-1.5 cursor-grab active:cursor-grabbing text-[11px] ${
                        editedTemplateId === tNode.id ? 'border-sky-500 text-white bg-sky-500/[0.08]' : 'border-white/[0.08] text-slate-300'
                      }`}
                      title="Drag this card onto the visual canvas to spawn it, or click to edit item attributes."
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-200 select-none truncate">
                          {tNode.label}
                        </span>
                        <span className={`text-[11px] font-medium border px-1.5 py-0.5 rounded shrink-0 ${badgeColors}`}>
                          {typeLabel}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 select-none border-t border-white/[0.06] pt-1.5 font-mono">
                        <span>&lt;{tNode.xmlTag}&gt;</span>
                        <div className="flex gap-1.5 font-sans">
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
                            className="text-sky-300 hover:text-sky-100 transition-colors cursor-pointer font-medium bg-sky-500/12 hover:bg-sky-500/20 px-1.5 py-0.5 rounded text-[11px]"
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
                              className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 px-1 py-0.5 rounded cursor-pointer leading-none"
                              title="Delete this template blueprint"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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
              <div className="space-y-3 bg-[#0a0d12] p-3 rounded-lg border border-sky-500/25 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-sky-300 font-semibold text-[11px]">
                    Edit blueprint fields
                  </span>
                  <button
                    onClick={() => setEditedTemplateId(null)}
                    className="text-[11px] text-slate-400 hover:text-white cursor-pointer"
                  >
                    Close
                  </button>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-300 block mb-1">Display label</label>
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
                    className="w-full p-2 rounded-md bg-[#11151d] border border-white/[0.08] text-white focus:outline-none focus:border-sky-500/60 text-[11px]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-300 block mb-1">XML tag node</label>
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
                    className="w-full p-2 rounded-md bg-[#11151d] border border-white/[0.08] text-white focus:outline-none focus:border-sky-500/60 font-mono text-[11px]"
                  />
                </div>

                <p className="text-[11px] text-slate-400 leading-snug select-none">
                  Editing values refreshes blueprint configurations safely without altering canvas assets.
                </p>
              </div>
            )}
          </div>
        )}

        {/* AI CO-PILOT (Tab: ai) */}
        {aiEnabled && activeTab === 'ai' && (
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
            knownTags={aiKnownTags}
            aiTier={aiTier}
            architectBlueprint={architectBlueprint}
            onBlueprintChange={onBlueprintChange}
            onRunArchitectStep={onRunArchitectStep}
            architectRunning={architectRunning}
            architectStep={architectStep}
            onConfirmArchitectStep={onConfirmArchitectStep}
            onDeclineArchitectStep={onDeclineArchitectStep}
            architectCanRun={architectCanRun}
            architectRunDisabledReason={architectRunDisabledReason}
            onCancel={onAiCancel}
          />
        )}
        </div>

      {/* Footer System Credits */}
      <div className="px-3 py-1.5 border-t border-white/[0.06] bg-[#0c0e12] text-center text-[11px] font-mono text-slate-500 shrink-0">
        Engine Context: Egosoft MD 4.5
      </div>
    </div>
      )}
  </div>
  );
}
