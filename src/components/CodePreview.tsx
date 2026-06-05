/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Clipboard, 
  Check, 
  Download, 
  Terminal, 
  AlertTriangle, 
  CheckCircle,
  FileCode,
  FileJson,
  Brain,
  Sparkles,
  RefreshCw,
  Compass,
  HelpCircle,
  Activity,
  ArrowRight,
  Folder,
  Save,
  Wrench,
  Play,
  Upload,
  Cpu
} from 'lucide-react';
import { ModWorkspace, generateMDXML, generateUIXML, validateModWorkspace, XMLDiagnostic, MDNode } from '../types';
import { getAIHeaders } from '../lib/apiHelper';

interface CodePreviewProps {
  workspace: ModWorkspace;
  setWorkspace?: React.Dispatch<React.SetStateAction<ModWorkspace>>;
  saveCheckpoint?: (customTarget?: ModWorkspace) => void;
  dirHandle: any | null;
  setDirHandle: (handle: any | null) => void;
  dirName: string;
  setDirName: (name: string) => void;
}

interface ScriptAnalysis {
  summary: string;
  triggerCondition: string;
  flowSteps: Array<{
    nodeId: string;
    nodeLabel: string;
    xmlTag: string;
    plainEnglishAction: string;
    sequenceOrder: number;
  }>;
  entityRegistry: Array<{
    name: string;
    type: string;
    detail: string;
  }>;
  tacticalInsights: string[];
}

interface LogIssue {
  id: string;
  severity: 'error' | 'warning';
  title: string;
  errorLogSnippet: string;
  explanation: string;
  impact: string;
  suggestedAction: string;
  affectedNodeId?: string;
  autoFix?: {
    type: 'update_node_property';
    nodeId: string;
    propertyKey: string;
    propertyValue: string;
  };
}

interface LogAnalysisResult {
  parsedLogsCount: number;
  summaryOfGameMDReload: string;
  issues: LogIssue[];
}

export default function CodePreview({ 
  workspace, 
  setWorkspace, 
  saveCheckpoint, 
  dirHandle, 
  setDirHandle, 
  dirName, 
  setDirName 
}: CodePreviewProps) {
  const [activeTab, setActiveTab] = useState<'md' | 'ui' | 'analyzer' | 'playtest'>('md');
  const [copied, setCopied] = useState<boolean>(false);
  const [diagnostics, setDiagnostics] = useState<XMLDiagnostic[]>([]);
  
  // Cognitive Analyzer states
  const [analysisResult, setAnalysisResult] = useState<ScriptAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [lastAnalyzedWorkspace, setLastAnalyzedWorkspace] = useState<string>('');

  // Playtest Live Debugger states
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [syncErrorMsg, setSyncErrorMsg] = useState<string>('');
  const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(true);
  
  const [logInput, setLogInput] = useState<string>('');
  const [diagnosingLogs, setDiagnosingLogs] = useState<boolean>(false);
  const [logAnalysis, setLogAnalysis] = useState<LogAnalysisResult | null>(null);
  const [diagnosticError, setDiagnosticError] = useState<string | null>(null);
  const [successfulFixApplied, setSuccessfulFixApplied] = useState<string | null>(null);

  const mdCode = generateMDXML(workspace);
  const uiCode = generateUIXML(workspace);
  const currentCode = activeTab === 'md' ? mdCode : uiCode;

  const workspaceSerialized = JSON.stringify({
    name: workspace.name,
    description: workspace.description,
    author: workspace.author,
    version: workspace.version,
    nodes: workspace.nodes.map(n => ({ id: n.id, type: n.type, label: n.label, xmlTag: n.xmlTag, properties: n.properties })),
    links: workspace.links,
    uiWidgets: workspace.uiWidgets.map(w => ({ id: w.id, type: w.type, label: w.label, properties: w.properties }))
  });

  const isAnalysisStale = analysisResult !== null && lastAnalyzedWorkspace !== workspaceSerialized;

  // Check if File System Access API is supported
  const isFileSystemAccessSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

  // Run diagnostics validator updates
  useEffect(() => {
    const reports = validateModWorkspace(workspace, currentCode);
    setDiagnostics(reports);
  }, [workspace, activeTab, currentCode]);

  // Handle automatic synchronization to folder handle on workspace edits
  useEffect(() => {
    if (autoSaveEnabled && dirHandle) {
      saveToDirectory(dirHandle, false);
    }
  }, [workspaceSerialized, autoSaveEnabled, dirHandle]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadFile = () => {
    const blob = new Blob([currentCode], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = activeTab === 'md' 
      ? `${workspace.name || 'custom_md_script'}.xml` 
      : `${workspace.name || 'custom_menu_layout'}_ui.xml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const triggerAnalysis = async () => {
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const response = await fetch('/api/gemini/analyze', {
        method: 'POST',
        headers: getAIHeaders(),
        body: JSON.stringify({ workspace })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to establish telemetry connection to server.");
      }
      setAnalysisResult(data.analysis);
      setLastAnalyzedWorkspace(workspaceSerialized);
    } catch (err: any) {
      console.error(err);
      setAnalysisError(err.message || 'An error occurred during cognitive script analysis.');
    } finally {
      setAnalyzing(false);
    }
  };

  // Helper to sync to local directory
  const saveToDirectory = async (handle: any, showFeedback = true) => {
    if (!handle) return;
    if (showFeedback) setSyncStatus('syncing');
    try {
      // 1. Write core director XML
      const directorDir = await handle.getDirectoryHandle('director', { create: true });
      const nameSanitized = (workspace.name || 'X4_My_Custom_Mod').replace(/[^a-zA-Z0-9_]/g, '_');
      const filename = `${nameSanitized}.xml`;
      const mdFile = await directorDir.getFileHandle(filename, { create: true });
      const mdWritable = await mdFile.createWritable();
      await mdWritable.write(generateMDXML(workspace));
      await mdWritable.close();

      // 2. Write UI layout XML if populated
      if (workspace.uiWidgets && workspace.uiWidgets.length > 0) {
        const uiDir = await handle.getDirectoryHandle('md_ui_layouts', { create: true });
        const uiFile = await uiDir.getFileHandle(`${nameSanitized}_ui.xml`, { create: true });
        const uiWritable = await uiFile.createWritable();
        await uiWritable.write(generateUIXML(workspace));
        await uiWritable.close();
      }

      if (showFeedback) {
        setSyncStatus('success');
        setTimeout(() => setSyncStatus('idle'), 2000);
      }
    } catch (err: any) {
      console.error("Playtest Directory Sync Error:", err);
      if (showFeedback) {
        setSyncStatus('error');
        setSyncErrorMsg(err.message || "Disk write access refused. Try opening MD Studio in a new tab to bypass iframe security sandbox bounds.");
        setTimeout(() => setSyncStatus('idle'), 5000);
      }
    }
  };

  const handleLinkDirectory = async () => {
    if (!isFileSystemAccessSupported) {
      alert("Your browser does not fully support Direct Folder Sync. Please use Google Chrome, Edge, or Opera.");
      return;
    }
    try {
      const handle = await (window as any).showDirectoryPicker();
      setDirHandle(handle);
      setDirName(handle.name);
      await saveToDirectory(handle, true);
    } catch (err: any) {
      console.error("Directory picking failed/cancelled", err);
      // Let the user know if sandboxed
      if (err.name === 'SecurityError') {
        setSyncStatus('error');
        setSyncErrorMsg("Iframe security sandbox blocked folder access. Open the app in a new tab by clicking the url on the right!");
        setTimeout(() => setSyncStatus('idle'), 6000);
      }
    }
  };

  const handleTriggerLogAnalysis = async () => {
    if (!logInput.trim()) return;
    setDiagnosingLogs(true);
    setDiagnosticError(null);
    try {
      const response = await fetch('/api/gemini/analyze-log', {
        method: 'POST',
        headers: getAIHeaders(),
        body: JSON.stringify({ workspace, logs: logInput })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Log parsing request rejected.");
      }
      setLogAnalysis(data.analysis);
    } catch (err: any) {
      console.error(err);
      setDiagnosticError(err.message || "Failed to analyze X4 script logs via Gemini.");
    } finally {
      setDiagnosingLogs(false);
    }
  };

  // 1-Click Auto-Fix application handler
  const handleApplyAutoFix = (fix: any) => {
    if (!setWorkspace || !saveCheckpoint) {
      console.warn("Auto-fix not supported in this frame state.");
      return;
    }

    if (fix.type === 'update_node_property' && fix.nodeId && fix.propertyKey) {
      saveCheckpoint();
      setWorkspace(prev => {
        const updatedNodes = prev.nodes.map(n => {
          if (n.id === fix.nodeId) {
            return {
              ...n,
              properties: {
                ...n.properties,
                [fix.propertyKey]: fix.propertyValue
              }
            };
          }
          return n;
        });
        return {
          ...prev,
          nodes: updatedNodes
        };
      });

      // Show temporary green banner
      setSuccessfulFixApplied(`Successfully repaired property '${fix.propertyKey}' to '${fix.propertyValue}'!`);
      setTimeout(() => setSuccessfulFixApplied(null), 4000);

      // Remove the issue from current active state diagnostics to give immediate gratification
      if (logAnalysis) {
        setLogAnalysis(prev => {
          if (!prev) return null;
          return {
            ...prev,
            issues: prev.issues.filter(issue => issue.autoFix?.nodeId !== fix.nodeId || issue.autoFix?.propertyKey !== fix.propertyKey)
          };
        });
      }
    }
  };

  const insertDemoX4Log = () => {
    const defaultCueName = workspace.nodes.find(n => n.type === 'cue')?.properties?.name || "My_Custom_Cue";
    const demoText = `[General] 2045.29: ==========================================
[General] 2045.29: X4: Foundations v6.20 Hotfix 1 (512390)
[General] 2045.29: Command Line: -debug all -logfile uidata.log -reloaddirector
[General] 2045.29: ==========================================
[MD Engine] Error: Parsing XML file extensions\\${workspace.name || 'X4_My_Custom_Mod'}\\director\\${workspace.name || 'X4_My_Custom_Mod'}.xml
*** Context:md.${defaultCueName}: cue has active state but 'instantiate' attribute is currently 'false'. Re-instantiation will fail on game reloads! Correct setting is recommended to be 'true' for persistent script triggers.
[MD Engine] Warning: Property 'faction' has unrecognized faction code 'ARGON_MILITARY' in cue '${defaultCueName}'. X4 standard code is 'argon'.
*** Context:md.Spawn_Escort_Ships: missing macro definition 'ship_arg_s_fighter_01_a'. Verify model path.`;
    setLogInput(demoText);
  };

  // File picker handler for debug.log
  const handleLogFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      setLogInput(text);
    };
    reader.readAsText(file);
  };

  // Quick light XML syntax highlighter function
  const highlightXML = (rawXML: string) => {
    return rawXML
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/(&lt;\/?[a-zA-Z0-9_:-]+)(\s|&gt;)/g, '<span class="text-cyan-400 font-semibold">$1</span>$2')
      .replace(/([a-zA-Z0-9_:-]+)="([^"]*)"/g, '<span class="text-purple-400">$1</span>=<span class="text-emerald-300">"$2"</span>')
      .replace(/(&lt;!--.*?--&gt;)/g, '<span class="text-slate-500 font-mono italic">$1</span>');
  };

  const errors = diagnostics.filter(d => d.severity === 'error');
  const warnings = diagnostics.filter(d => d.severity === 'warning');

  return (
    <div id="code_preview_container" className="flex-1 bg-[#0a0c10] flex flex-col h-full overflow-hidden text-slate-300 border-l border-white/5 font-mono">
      {/* Code Tab options bar */}
      <div className="flex border-b border-white/5 bg-black/45 justify-between items-center px-3 py-2 shrink-0">
        <div className="flex gap-1.5 overflow-x-auto">
          <button
            onClick={() => setActiveTab('md')}
            className={`px-2 py-1 rounded text-[10px] font-mono font-medium transition-all flex items-center gap-1 shrink-0 cursor-pointer ${
              activeTab === 'md'
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            DIRECTOR.xml
          </button>
          <button
            onClick={() => setActiveTab('ui')}
            className={`px-2 py-1 rounded text-[10px] font-mono font-medium transition-all flex items-center gap-1 shrink-0 cursor-pointer ${
              activeTab === 'ui'
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
            }`}
          >
            <FileJson className="w-3.5 h-3.5" />
            UI_LAYOUT.xml
          </button>
          <button
            onClick={() => setActiveTab('analyzer')}
            className={`px-2 py-1 rounded text-[10px] font-mono font-medium transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === 'analyzer'
                ? 'bg-amber-500/10 text-amber-500 border border-amber-500/40 font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
            }`}
          >
            <Brain className="w-3.5 h-3.5 animate-pulse text-amber-500" />
            MD SCANNER
          </button>
          <button
            onClick={() => setActiveTab('playtest')}
            className={`px-2 py-1 rounded text-[10px] font-mono font-medium transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === 'playtest'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/40 font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-emerald-400" />
            PLAYTEST WORKSPACE
          </button>
        </div>

        {/* Sync copy triggers */}
        <div id="tool_actions" className="flex items-center gap-1.5 shrink-0">
          {activeTab !== 'analyzer' && activeTab !== 'playtest' ? (
            <>
              <button
                onClick={copyToClipboard}
                className="px-2 py-1 bg-slate-900 border border-white/10 rounded font-mono text-[10px] text-slate-300 hover:text-cyan-400 flex items-center gap-1 hover:bg-slate-800 transition-all active:scale-[0.98] cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    COPIED
                  </>
                ) : (
                  <>
                    <Clipboard className="w-3 h-3" />
                    COPY
                  </>
                )}
              </button>
              <button
                onClick={downloadFile}
                className="px-2 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded font-mono text-[10px] text-cyan-400 hover:text-white flex items-center gap-1 hover:bg-cyan-500/25 transition-all active:scale-[0.98] cursor-pointer"
                title="Download XML file"
              >
                <Download className="w-3 h-3" />
                DL
              </button>
            </>
          ) : activeTab === 'analyzer' ? (
            analysisResult && (
              <button
                onClick={triggerAnalysis}
                disabled={analyzing}
                className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-500 rounded font-mono text-[10px] flex items-center gap-1 transition-all disabled:opacity-50 cursor-pointer"
                title="Re-run plain English description update on structural changes"
              >
                <RefreshCw className={`w-3 h-3 ${analyzing ? "animate-spin" : ""}`} />
                ANALYZE
              </button>
            )
          ) : (
            dirHandle && (
              <button
                onClick={() => saveToDirectory(dirHandle, true)}
                disabled={syncStatus === 'syncing'}
                className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded font-mono text-[10px] flex items-center gap-1 transition-all cursor-pointer"
              >
                <Save className={`w-3 h-3 ${syncStatus === 'syncing' ? 'animate-pulse' : ''}`} />
                SYNC FILES
              </button>
            )
          )}
        </div>
      </div>

      {/* Main Content Display View */}
      <div className="flex-1 overflow-y-auto bg-[#06070a]/90 flex flex-col relative text-xs">
        {activeTab === 'analyzer' && (
          <div className="p-4 space-y-4 font-sans select-text">
            
            {/* STALE ANALYSIS OR FRESH TRIGGER WARNING HEADER */}
            {isAnalysisStale && (
              <div className="flex items-center justify-between gap-2 p-2 rounded border border-amber-500/20 bg-amber-500/5 text-amber-300 text-[11px] font-mono shrink-0 animate-fade-in">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping inline-block" />
                  <span>Structural changes detected.</span>
                </div>
                <button 
                  onClick={triggerAnalysis} 
                  className="px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold rounded uppercase text-[9px] transition-all"
                >
                  Update Summary
                </button>
              </div>
            )}

            {/* ERROR DISPLAY AREA */}
            {analysisError && (
              <div className="p-3.5 bg-red-500/5 border border-red-500/20 rounded-md text-red-300 leading-relaxed">
                <div className="flex items-center gap-2 font-mono font-bold text-[11px] uppercase tracking-wider mb-1">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  Scanner Error Flags
                </div>
                <p className="text-[11px] font-medium font-sans">{analysisError}</p>
                <button
                  onClick={triggerAnalysis}
                  className="mt-3.5 w-full py-1.5 bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 rounded text-red-200 font-semibold font-mono text-[10px] uppercase transition-all"
                >
                  Retry Diagnostic Analysis
                </button>
              </div>
            )}

            {/* INTRO EMPTY STATE: TRIGGER SCRIPT SUMMARY SCAN */}
            {!analysisResult && !analyzing && !analysisError && (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 py-8 space-y-5 animate-fade-in max-w-sm mx-auto">
                <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/30 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.05)]">
                  <Brain className="w-7 h-7 text-amber-500 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-tight text-white mb-1 uppercase font-mono">Cognitive Script Summary</h3>
                  <p className="text-[11px] text-slate-400 leading-relaxed font-sans font-medium">
                    Reads the physical visual node network configurations, inputs, custom properties, and graphical links to build a comprehensive step-by-step summary in human-friendly plain English.
                  </p>
                </div>
                
                <div className="w-full bg-black/35 rounded border border-white/5 p-3 space-y-2 text-left text-[10px] font-mono text-slate-400 leading-relaxed">
                  <div className="flex items-start gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>Instant logic sequence chart summaries.</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>Tracks capital wings, sound cues, menus, and HUD panels designed.</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>Highlights tactical playtesting suggestions.</span>
                  </div>
                </div>

                <button
                  onClick={triggerAnalysis}
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-500/90 text-black font-bold font-mono tracking-tight text-xs uppercase duration-150 transform rounded-lg shadow-lg active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  ANALYZE WORKSPACE
                </button>
              </div>
            )}

            {/* SCANNING ACTIVE LOADER VIEW */}
            {analyzing && (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 py-12 space-y-4 animate-pulse max-w-sm mx-auto">
                <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
                <div>
                  <h3 className="text-xs font-mono font-bold uppercase text-white tracking-widest">Compiling Summary Output...</h3>
                  <p className="text-[10px] uppercase font-mono text-slate-500 mt-1">
                    De-serializing visual logic nodes and links...
                  </p>
                </div>
              </div>
            )}

            {/* RESULTS SCREEN BREAKDOWN DISPLAY */}
            {analysisResult && !analyzing && !analysisError && (
              <div className="space-y-4 text-[11px] leading-relaxed animate-fade-in font-sans">
                
                {/* 1. OVERALL SCRIPT OVERVIEW BANNER */}
                <div className="bg-amber-500/[0.04] border border-amber-500/25 p-3.5 rounded-lg space-y-2 relative overflow-hidden">
                  <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[8px] font-mono font-bold tracking-wider uppercase select-none">
                    <Sparkles className="w-2.5 h-2.5" /> Summary
                  </div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Mod Description Summary</div>
                  <p className="text-slate-200 text-xs font-medium leading-relaxed font-sans">{analysisResult.summary}</p>
                </div>

                {/* 2. TRIGGER CONDITION SECTION */}
                <div className="bg-slate-900/60 border border-white/5 p-3 rounded-lg space-y-1.5">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Activation Trigger</div>
                  <div className="text-slate-300 leading-relaxed font-medium">{analysisResult.triggerCondition}</div>
                </div>

                {/* 3. STEP-BY-STEP CHRONOLOGY TIMELINE */}
                <div className="space-y-2.5">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono px-0.5">Logical Execution Flowchart</div>
                  
                  {analysisResult.flowSteps && analysisResult.flowSteps.length > 0 ? (
                    <div className="relative pl-3.5 border-l border-white/10 ml-1.5 space-y-4">
                      {analysisResult.flowSteps.map((step, idx) => (
                        <div key={idx} className="relative group">
                          {/* Dot item tracker absolute positioned */}
                          <div className="absolute -left-[19.5px] top-1.5 w-2 h-2 rounded-full border border-amber-500/40 bg-[#0a0c10] group-hover:bg-amber-500 transition-colors" />
                          
                          <div className="bg-[#12141a]/60 border border-white/5 p-2.5 rounded hover:border-white/10 transition-all space-y-1">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="font-bold text-slate-200">{step.nodeLabel}</span>
                              <span className="font-mono text-slate-500 font-bold">&lt;{step.xmlTag}&gt;</span>
                            </div>
                            <p className="text-slate-400 text-[10.5px] leading-relaxed font-sans">{step.plainEnglishAction}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 text-center text-slate-500 bg-black/20 rounded border border-white/5 italic">
                      No active logical flowchart steps calculated. Add event or action nodes.
                    </div>
                  )}
                </div>

                {/* 4. ENTITY & WIDGET REGISTRY TABLE */}
                <div className="bg-slate-900/40 border border-white/5 rounded-lg overflow-hidden space-y-2 p-3">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Mod Spawn Registry</div>
                  
                  {analysisResult.entityRegistry && analysisResult.entityRegistry.length > 0 ? (
                    <div className="space-y-2">
                      {analysisResult.entityRegistry.map((ent, idx) => (
                        <div key={idx} className="bg-black/20 p-2 rounded-md border border-white/[0.03] flex justify-between items-start gap-2.5">
                          <div className="space-y-0.5 flex-1">
                            <span className="font-mono text-[10px] text-cyan-400 font-bold tracking-tight block">{ent.name}</span>
                            <p className="text-slate-400 text-[10px] leading-relaxed">{ent.detail}</p>
                          </div>
                          <span className="px-1.5 py-0.5 rounded bg-cyan-900/20 text-cyan-400 border border-cyan-500/10 text-[8px] font-mono font-bold uppercase select-none shrink-0">
                            {ent.type}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-500 italic p-1">No physical assets or customized widgets registered.</div>
                  )}
                </div>

                {/* 5. TACTICAL DEVELOPMENT TIPS */}
                <div className="bg-amber-500/[0.02] border border-amber-500/10 p-3 rounded-lg space-y-2">
                  <div className="text-[10px] font-bold text-amber-500/90 uppercase tracking-wider font-mono flex items-center gap-1">
                    <HelpCircle className="w-3.5 h-3.5" /> Playtester Guidance & Safety
                  </div>
                  
                  {analysisResult.tacticalInsights && analysisResult.tacticalInsights.length > 0 ? (
                    <ul className="space-y-1.5 pl-3 list-disc text-slate-400 text-[10.5px]">
                      {analysisResult.tacticalInsights.map((insight, idx) => (
                        <li key={idx} className="leading-relaxed font-sans text-slate-300">{insight}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[10px] text-slate-500">Workspace is fully optimized. Clear for standard testing.</p>
                  )}
                </div>

              </div>
            )}

          </div>
        )}

        {/* PLAYTEST LIVE DEBUGGER MODE GUTS */}
        {activeTab === 'playtest' && (
          <div className="p-4 space-y-5 font-sans select-text">
            
            {/* LINK COMPONENT & LOG STATUS */}
            <div className="bg-black/55 border border-white/10 p-4 rounded-xl space-y-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white font-mono flex items-center gap-2">
                    <Folder className="w-4 h-4 text-emerald-400" />
                    Ingame File Syncer
                  </h3>
                  <p className="text-[11px] text-slate-400 leading-normal">
                    Writes XML files directly to your live X4 extensions folder on updates.
                  </p>
                </div>
                
                {dirHandle ? (
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono text-[9px] font-bold flex items-center gap-1 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    LINKED
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-red-500/10 text-slate-400 border border-white/10 font-mono text-[9px] font-bold flex items-center gap-1 shrink-0">
                    OFFLINE
                  </span>
                )}
              </div>

              {/* ACTION BUTTON SYSTEM */}
              {dirHandle ? (
                <div className="space-y-3">
                  <div className="p-2.5 bg-[#0a0c10] border border-white/5 rounded-md font-mono text-[10px] flex justify-between items-center text-slate-400 gap-2">
                    <span className="truncate" title="Direct location handle connection">📍 X4 Extensions/.../{dirName}</span>
                    <button 
                      onClick={handleLinkDirectory} 
                      className="text-[9px] text-cyan-400 font-bold hover:underline shrink-0"
                    >
                      Change Folder
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between gap-4">
                    <label className="flex items-center gap-2 text-[10.5px] text-slate-300 cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={autoSaveEnabled} 
                        onChange={(e) => setAutoSaveEnabled(e.target.checked)}
                        className="rounded accent-emerald-500 text-black border-white/20"
                      />
                      <span>Auto-sync on changes</span>
                    </label>

                    <button
                      onClick={() => saveToDirectory(dirHandle, true)}
                      disabled={syncStatus === 'syncing'}
                      className="px-3 py-1 bg-emerald-500 hover:bg-emerald-600 text-black font-bold font-mono text-[10px] rounded transition-all flex items-center gap-1"
                    >
                      <Save className="w-3 h-3" />
                      Save XML
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={handleLinkDirectory}
                    className="w-full py-2 bg-emerald-600/15 border border-emerald-500/40 hover:bg-emerald-600/30 text-emerald-400 rounded-md font-mono text-[11px] font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Folder className="w-4 h-4 text-emerald-400" />
                    LINK LOCAL X4 EXTENSIONS FOLDER
                  </button>
                  <p className="text-[10px] text-slate-500 leading-relaxed italic">
                    Note: If browser iframe constraints block linking, click the project URL at top-to-bottom right to load this app in a standalone tab! You can also use copy/paste log mechanics below.
                  </p>
                </div>
              )}

              {/* SYNC INDICATORS banner */}
              {syncStatus === 'syncing' && (
                <div className="p-2 bg-slate-900 border border-white/10 rounded font-mono text-[10px] text-slate-400 flex items-center justify-center gap-2 animate-pulse">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                  Writing XML packages to disk...
                </div>
              )}
              {syncStatus === 'success' && (
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded font-mono text-[10px] text-emerald-400 flex items-center justify-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Files synced successfully! Mod is updated.
                </div>
              )}
              {syncStatus === 'error' && (
                <div className="p-3 bg-red-500/5 border border-red-500/20 rounded font-sans text-[11px] text-red-300 leading-normal space-y-1">
                  <div className="font-mono font-bold text-[10px] text-red-400 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    DISK WRITE REFUSED
                  </div>
                  <p>{syncErrorMsg}</p>
                </div>
              )}
            </div>

            {/* ERROR LOADER & DEBUG FILE INPUT TRIGGER */}
            <div className="bg-black/55 border border-white/10 p-4 rounded-xl space-y-4">
              <div className="space-y-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-white font-mono flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-cyan-400" />
                    Game Debug Log Watcher
                  </span>
                  <button 
                    onClick={insertDemoX4Log}
                    className="text-[9px] bg-cyan-900/40 hover:bg-cyan-900/75 border border-cyan-500/20 px-2 py-0.5 rounded text-cyan-400 font-bold transition-all shrink-0 cursor-pointer"
                  >
                    Load Demo Log
                  </button>
                </h3>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Paste lines from <code className="text-cyan-400">debug.log</code>, or load it with the picker below to analyze MD engine issues.
                </p>
              </div>

              {/* LOG TEXTAREA BUFFER */}
              <div className="space-y-2">
                <textarea
                  value={logInput}
                  onChange={(e) => setLogInput(e.target.value)}
                  placeholder="Paste X4 Foundations debug trace here (e.g. cue failures, properties missing in extensions...)"
                  className="w-full h-32 p-2 bg-[#08090d] border border-white/10 text-emerald-400 rounded-md font-mono text-[10px] focus:outline-none focus:border-cyan-500 select-text leading-tight leading-relaxed"
                />

                <div className="flex items-center justify-between gap-3">
                  {/* File Upload Watcher Input */}
                  <label className="px-2 py-1 bg-slate-900 border border-white/10 hover:border-white/20 hover:bg-slate-800 text-[10px] font-mono text-slate-300 rounded cursor-pointer transition-all flex items-center gap-1.5">
                    <Upload className="w-3 h-3 text-cyan-400" />
                    <span>Browse debug.log</span>
                    <input 
                      type="file" 
                      accept=".log,.txt" 
                      className="hidden" 
                      onChange={handleLogFileChange} 
                    />
                  </label>

                  {logInput.trim() && (
                    <button
                      onClick={handleTriggerLogAnalysis}
                      disabled={diagnosingLogs}
                      className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-mono font-bold text-[10px] rounded transition-all flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${diagnosingLogs ? 'animate-spin' : ''}`} />
                      AI DIAGNOSE TRACES
                    </button>
                  )}
                </div>
              </div>

              {/* ERROR/SUCCESS STATUS ON ANALYSIS INGESTION */}
              {successfulFixApplied && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold rounded-lg leading-relaxed flex items-center gap-2 text-[11px] animate-bounce">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{successfulFixApplied}</span>
                </div>
              )}

              {diagnosticError && (
                <div className="p-3 bg-red-500/5 border border-red-500/20 text-red-300 rounded-lg shrink-0">
                  <span className="font-bold tracking-tight text-red-400 uppercase text-[9px] block">Error Reading Logs</span>
                  <p className="text-[11px] text-slate-400 font-sans mt-0.5">{diagnosticError}</p>
                </div>
              )}
            </div>

            {/* DIAGNOSING ACTION IN PROCESS SCREEN */}
            {diagnosingLogs && (
              <div className="flex flex-col items-center justify-center p-8 bg-black/35 rounded-xl border border-white/5 space-y-3">
                <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin" />
                <div className="text-center">
                  <span className="font-mono text-[10px] uppercase font-bold text-slate-200 tracking-wider">Compiling Trace Solutions...</span>
                  <p className="text-[9px] uppercase font-mono text-slate-600 mt-0.5">Gemini searching for modding code bugs...</p>
                </div>
              </div>
            )}

            {/* RESULTS FROM TRACE ANALYSIS */}
            {logAnalysis && !diagnosingLogs && (
              <div className="space-y-3.5">
                <div className="px-1 border-l-2 border-cyan-500 space-y-1">
                  <h4 className="text-[11px] font-bold text-white uppercase tracking-wider font-mono">
                    AI Playtest Diagnosis
                  </h4>
                  <p className="text-[10px] text-slate-400 leading-normal">
                    {logAnalysis.summaryOfGameMDReload}
                  </p>
                </div>

                {logAnalysis.issues && logAnalysis.issues.length > 0 ? (
                  <div className="space-y-3">
                    {logAnalysis.issues.map((issue) => {
                      const isErr = issue.severity === 'error';
                      return (
                        <div 
                          key={issue.id} 
                          className={`p-3.5 rounded-xl border leading-relaxed space-y-3 relative overflow-hidden ${
                            isErr 
                              ? 'bg-red-500/[0.02] border-red-500/15' 
                              : 'bg-yellow-500/[0.01] border-yellow-500/15'
                          }`}
                        >
                          {/* Severity badge */}
                          <div className="flex items-center justify-between text-[10px]">
                            <span className={`font-mono uppercase font-black text-[9px] px-1.5 py-0.5 rounded border ${
                              isErr 
                                ? 'bg-red-500/10 text-red-400 border-red-500/20' 
                                : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                            }`}>
                              [{issue.severity}] {issue.title}
                            </span>
                            
                            {issue.affectedNodeId && (
                              <span className="text-[9px] bg-slate-900 border border-white/5 px-1.5 py-0.5 rounded text-slate-400 font-mono">
                                Node matched
                              </span>
                            )}
                          </div>

                          {/* Log segment explanation */}
                          <div className="space-y-1">
                            <span className="text-[9px] uppercase font-bold text-slate-500 font-mono">Trace Match</span>
                            <pre className="p-1 px-1.5 bg-black/45 border border-white/[0.04] text-[9.5px] font-mono text-slate-400 rounded overflow-x-auto whitespace-pre-wrap leading-tight leading-relaxed font-bold">
                              {issue.errorLogSnippet}
                            </pre>
                          </div>

                          {/* Explanation of why failed */}
                          <div className="space-y-1 text-[11px]">
                            <span className="text-[9px] uppercase font-bold text-slate-500 font-mono">Why context fails</span>
                            <p className="text-slate-300 font-medium font-sans leading-relaxed">
                              {issue.explanation}
                            </p>
                          </div>

                          {/* Effect in game */}
                          <div className="p-2 bg-black/25 rounded border border-white/[0.03] space-y-0.5 text-[10.5px]">
                            <span className="text-[9px] uppercase font-bold text-slate-400 font-mono block">Ingame Impact</span>
                            <p className="text-slate-400 font-sans">{issue.impact}</p>
                          </div>

                          {/* Suggested repair action */}
                          <div className="space-y-1 text-[10.5px]">
                            <span className="text-[9px] uppercase font-bold text-slate-500 font-mono">Playbook repair advice</span>
                            <p className="text-slate-300 font-sans leading-relaxed">{issue.suggestedAction}</p>
                          </div>

                          {/* 1-Click AutoFix Action Button! */}
                          {issue.autoFix && (
                            <button
                              onClick={() => handleApplyAutoFix(issue.autoFix)}
                              className="mt-1.5 w-full py-2 bg-emerald-500 hover:bg-emerald-400 hover:border-emerald-300 border border-emerald-600 text-black font-mono font-bold text-[10.5px] uppercase rounded-lg shadow-[0_4px_12px_rgba(16,185,129,0.15)] transition-all flex items-center justify-center gap-1.5"
                            >
                              <Wrench className="w-3.5 h-3.5 text-black" />
                              Apply AI 1-Click Repair
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 text-center text-slate-500 bg-black/20 rounded border border-white/5 italic flex flex-col items-center justify-center gap-2">
                    <CheckCircle className="w-6 h-6 text-emerald-500" />
                    <span className="font-sans text-[11px] text-slate-400 leading-normal font-medium">
                      All traces passed! Clear game state compilation achieved. Re-run or trace when logs contain director warning cues.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* INSTRUCTIONS ON HOT RELOADING DIRECTOR ON USER MACHINE */}
            <div className="bg-[#121620]/45 border border-cyan-500/10 p-3.5 rounded-xl space-y-2">
              <h5 className="text-[10px] uppercase font-bold font-mono tracking-wider text-cyan-400 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" />
                Egosoft Live Hot-Reload Guide
              </h5>
              <div className="text-[10px] text-slate-400 leading-relaxed font-sans font-medium space-y-2">
                <p>
                  1. Launch X4 with parameters: <code className="text-cyan-400 font-mono">-debug all -reloaddirector</code>
                </p>
                <p>
                  2. Whenever you update and compiled files with MD Studio, you can type this command inside the game console to instantly flash the changes:
                </p>
                <div className="p-1 px-2 bg-slate-900/80 border border-white/5 rounded font-mono text-[9px] font-bold text-center block text-white">
                  /reloaddirector
                </div>
              </div>
            </div>

          </div>
        )}

        {activeTab !== 'analyzer' && activeTab !== 'playtest' && (
          /* Default MD and UI XML highlighter code display */
          <div className="flex-1 p-4 overflow-y-auto font-mono text-xs leading-relaxed bg-[#06070a]/90 relative">
            <pre 
              className="whitespace-pre overflow-x-auto pr-10"
              dangerouslySetInnerHTML={{ __html: highlightXML(currentCode) }}
            />
          </div>
        )}
      </div>

      {/* X4 Engine Pre-Validation Diagnostics Monitor */}
      {activeTab !== 'analyzer' && activeTab !== 'playtest' && (
        <div className="border-t border-white/5 bg-black/45 p-4 space-y-3 font-mono text-xs max-h-56 overflow-y-auto shrink-0 font-bold">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <div className="flex items-center gap-1.5 text-slate-300 font-bold tracking-tight text-[11px]">
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              EGOSOFT SCHEMA XML VALIDATOR (DIAGNOSTICS)
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500 block" /> {errors.length} Errors
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-yellow-500 block" /> {warnings.length} Warnings
              </span>
            </div>
          </div>

          {diagnostics.length === 0 ? (
            <div className="text-emerald-400/90 text-[11px] leading-relaxed flex items-center gap-2.5 bg-emerald-500/5 p-2 rounded border border-emerald-500/10 font-sans font-medium">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>No compilation warning flags detected. Your Mission Director XML coordinates match safe X4 game load definitions!</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              {diagnostics.map((diag, index) => {
                const itemStyle = diag.severity === 'error' 
                  ? 'bg-red-500/5 text-red-300 border-red-500/15' 
                  : (diag.severity === 'warning' ? 'bg-yellow-500/5 text-yellow-300 border-yellow-500/15' : 'bg-blue-500/5 text-blue-300 border-blue-500/15');
                
                return (
                  <div key={index} className={`p-2 rounded border text-[11px] leading-relaxed flex items-start gap-2 ${itemStyle}`}>
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                    <div>
                      <span className="font-bold tracking-tight text-white uppercase block text-[9px] mb-0.5">
                        [{diag.severity}] ID: {diag.category.toUpperCase()}
                      </span>
                      {diag.message}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
