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
  Activity,
  Folder,
  Save,
  Wrench,
  Upload,
  Cpu
} from 'lucide-react';
import { ModWorkspace, generateMDXML, generateUIXML, validateModWorkspace, XMLDiagnostic, MDNode } from '../types';
import { getAIHeaders } from '../lib/apiHelper';
import MDScanner from './MDScanner';
import PlaytestWorkspace from './PlaytestWorkspace';

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
  const [codeActiveTab, setCodeActiveTab] = useState<'md' | 'ui'>('md');
  const [toolActiveTab, setToolActiveTab] = useState<'analyzer' | 'playtest'>('analyzer');
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
  const currentCode = codeActiveTab === 'md' ? mdCode : uiCode;

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
  }, [workspace, codeActiveTab, currentCode]);

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
    link.download = codeActiveTab === 'md' 
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
      setAnalysisError(err.message || "Failed to catalog script outline. Verify telemetry status.");
    } finally {
      setAnalyzing(false);
    }
  };

  const saveToDirectory = async (handle: any, showFeedback: boolean) => {
    if (!handle) return;
    if (showFeedback) {
      setSyncStatus('syncing');
    }
    try {
      const nameSanitized = (workspace.name || 'x4_md_studio_mod').replace(/[^a-z0-9_]/gi, '_').toLowerCase();
      
      // 1. Write core director XML
      const dirDir = await handle.getDirectoryHandle('director', { create: true });
      const mdFile = await dirDir.getFileHandle(`${nameSanitized}.xml`, { create: true });
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

      setSuccessfulFixApplied(`Successfully repaired property '${fix.propertyKey}' to '${fix.propertyValue}'!`);
      setTimeout(() => setSuccessfulFixApplied(null), 4000);

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
      
      {/* ================================================================ */}
      {/* SECTION 1: COMPILED XML FILE VIEWER                             */}
      {/* ================================================================ */}
      <div className="flex-[6] flex flex-col min-h-0 border-b border-white/10 overflow-hidden">
        {/* Upper Code Tab Option Bar */}
        <div className="flex border-b border-white/5 bg-black/45 justify-between items-center px-3.5 py-2 shrink-0 select-none">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setCodeActiveTab('md')}
              className={`px-3 py-1 rounded text-[10px] font-mono font-bold uppercase transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                codeActiveTab === 'md'
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <FileCode className="w-3.5 h-3.5 text-cyan-400" />
              DIRECTOR.xml
            </button>
            <button
              onClick={() => setCodeActiveTab('ui')}
              className={`px-3 py-1 rounded text-[10px] font-mono font-bold uppercase transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                codeActiveTab === 'ui'
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <FileJson className="w-3.5 h-3.5 text-cyan-400" />
              UI_LAYOUT.xml
            </button>
          </div>

          {/* Code Utility triggers */}
          <div id="code_actions" className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={copyToClipboard}
              className="px-2.5 py-1 bg-slate-900 border border-white/10 rounded font-mono text-[9px] text-slate-300 hover:text-cyan-400 flex items-center gap-1 hover:bg-slate-800 transition-all active:scale-[0.98] cursor-pointer"
              title="Copy compiled raw XML file to clipboard"
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
              className="px-2.5 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded font-mono text-[9px] text-cyan-400 hover:text-white flex items-center gap-1 hover:bg-cyan-500/25 transition-all active:scale-[0.98] cursor-pointer"
              title="Download compiled XML element"
            >
              <Download className="w-3 h-3" />
              DL
            </button>
          </div>
        </div>

        {/* XML preview raw contents display */}
        <div id="xml_code_viewport" className="flex-1 p-4 overflow-y-auto font-mono text-[11px] leading-relaxed bg-[#050608]/95 relative select-text min-h-0 scrollbar-thin">
          <pre 
            className="whitespace-pre overflow-x-auto pr-10 hover:text-white transition-colors duration-100 font-mono"
            dangerouslySetInnerHTML={{ __html: highlightXML(currentCode) }}
          />
        </div>

        {/* X4 Engine Pre-Validation Diagnostics Monitor */}
        <div className="border-t border-white/5 bg-black/45 px-3.5 py-2.5 space-y-2 font-mono text-xs max-h-48 overflow-y-auto shrink-0 transition-all scrollbar-thin">
          <div className="flex items-center justify-between border-b border-white/5 pb-1.5 select-none font-mono">
            <div className="flex items-center gap-1.5 text-slate-300 font-semibold tracking-tight text-[10px]">
              <Terminal className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              EGOSOFT SCHEMA XML VALIDATOR (DIAGNOSTICS)
            </div>
            <div className="flex items-center gap-2 text-[9px] font-bold">
              <span className="flex items-center gap-1 text-slate-350 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 block" /> {errors.length} Errors
              </span>
              <span className="flex items-center gap-1 text-slate-350 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 block" /> {warnings.length} Warnings
              </span>
            </div>
          </div>

          {diagnostics.length === 0 ? (
            <div className="text-emerald-400/90 text-[10px] leading-normal flex items-center gap-2 bg-emerald-500/5 p-2 rounded border border-emerald-500/10 font-sans font-medium">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>No syntax warning flags detected. Your visual coordinates match strict Schema expectations!</span>
            </div>
          ) : (
            <div className="space-y-1.5 font-sans">
              {diagnostics.map((diag, index) => {
                const itemStyle = diag.severity === 'error' 
                  ? 'bg-red-500/5 text-red-350 border-red-500/15' 
                  : (diag.severity === 'warning' ? 'bg-amber-500/5 text-amber-355 text-amber-305 border-amber-500/15' : 'bg-blue-500/5 text-blue-300 border-blue-500/15');
                
                return (
                  <div key={index} className={`p-1.5 rounded border text-[10px] leading-relaxed flex items-start gap-2 ${itemStyle}`}>
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
                    <div>
                      <span className="font-mono font-bold tracking-tight text-white uppercase block text-[8px] mb-0.5">
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
      </div>

      {/* ================================================================ */}
      {/* SECTION 2: LIVE SIMULATION DIAGNOSTICS & PLAYTEST HUB          */}
      {/* ================================================================ */}
      <div className="flex-[4] flex flex-col min-h-0 bg-[#080a0e] overflow-hidden select-none border-t border-[#df9825]/10">
        
        {/* Diagnostic Tool Segmented Header */}
        <div className="flex border-b border-white/5 bg-black/45 justify-between items-center px-3.5 py-1.5 shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none font-mono">
            <button
              onClick={() => setToolActiveTab('analyzer')}
              className={`px-3 py-1 rounded text-[10px] font-mono font-bold uppercase transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                toolActiveTab === 'analyzer'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Brain className="w-3.5 h-3.5 animate-pulse text-amber-500" />
              MD SCANNER
            </button>
            <button
              onClick={() => setToolActiveTab('playtest')}
              className={`px-3 py-1 rounded text-[10px] font-mono font-bold uppercase transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                toolActiveTab === 'playtest'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              PLAYTEST WORKSPACE
            </button>
          </div>

          {/* Action triggers specific to tabs */}
          <div id="tool_actions" className="flex items-center gap-1.5 shrink-0">
            {toolActiveTab === 'analyzer' ? (
              analysisResult && (
                <button
                  onClick={triggerAnalysis}
                  disabled={analyzing}
                  className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-500 rounded font-mono text-[9px] flex items-center gap-1 transition-all disabled:opacity-50 cursor-pointer font-bold uppercase"
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
                  className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded font-mono text-[9px] flex items-center gap-1 transition-all cursor-pointer font-bold uppercase"
                  title="Force immediate sync to disk"
                >
                  <Save className={`w-3 h-3 ${syncStatus === 'syncing' ? 'animate-pulse' : ''}`} />
                  SYNC FILES
                </button>
              )
            )}
          </div>
        </div>

        {/* Viewport display */}
        <div className="flex-1 overflow-y-auto bg-[#06070a]/95 flex flex-col relative text-xs min-h-0 scrollbar-thin">
          {toolActiveTab === 'analyzer' ? (
            <MDScanner
              workspace={workspace}
              analysisResult={analysisResult}
              analyzing={analyzing}
              analysisError={analysisError}
              triggerAnalysis={triggerAnalysis}
              isAnalysisStale={isAnalysisStale}
            />
          ) : (
            <PlaytestWorkspace
              dirHandle={dirHandle}
              dirName={dirName}
              syncStatus={syncStatus}
              syncErrorMsg={syncErrorMsg}
              autoSaveEnabled={autoSaveEnabled}
              setAutoSaveEnabled={setAutoSaveEnabled}
              saveToDirectory={saveToDirectory}
              handleLinkDirectory={handleLinkDirectory}
              logInput={logInput}
              setLogInput={setLogInput}
              diagnosingLogs={diagnosingLogs}
              logAnalysis={logAnalysis}
              diagnosticError={diagnosticError}
              successfulFixApplied={successfulFixApplied}
              handleTriggerLogAnalysis={handleTriggerLogAnalysis}
              insertDemoX4Log={insertDemoX4Log}
              handleLogFileChange={handleLogFileChange}
              handleApplyAutoFix={handleApplyAutoFix}
            />
          )}
        </div>

      </div>

    </div>
  );
}
