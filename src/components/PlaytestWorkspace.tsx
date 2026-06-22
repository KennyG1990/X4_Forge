import React, { useEffect, useState } from 'react';
import { 
  Folder, 
  Terminal, 
  Upload, 
  Sparkles, 
  CheckCircle, 
  AlertTriangle, 
  Save, 
  RefreshCw, 
  Wrench, 
  Cpu
} from 'lucide-react';

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

interface GameLogIssue {
  severity: 'error' | 'warning';
  lineNumber: number;
  text: string;
  matchesActiveMod: boolean;
}

interface GameLogStatus {
  status: 'no_log' | 'stale' | 'clean' | 'warnings' | 'errors' | 'error';
  modId: string;
  summary?: string;
  selectedLogPath?: string;
  logUpdatedAt?: string;
  logBytes?: number;
  counts?: {
    allIssues: number;
    activeIssues: number;
    activeErrors: number;
    activeWarnings: number;
  };
  issues?: GameLogIssue[];
  recentGlobalIssues?: GameLogIssue[];
  error?: string;
}

// H9: honest log-status labels. This panel only reports what the X4 debug log
// shows for THIS mod — it is not a statement that the mod is deployed, loaded,
// or schema-valid. "clean" specifically means "no active-mod log issues".
const GAME_LOG_STATUS_LABELS: Record<GameLogStatus['status'], string> = {
  no_log: 'NO LOG FOUND',
  stale: 'LOG STALE',
  clean: 'NO LOG ISSUES',
  warnings: 'LOG WARNINGS',
  errors: 'LOG ERRORS',
  error: 'LOG READ ERROR',
};

interface PlaytestWorkspaceProps {
  activeModId: string;
  modWorkspacePath: string;
  syncStatus: 'idle' | 'syncing' | 'success' | 'error';
  syncErrorMsg: string;
  autoSaveEnabled: boolean;
  setAutoSaveEnabled: (value: boolean) => void;
  saveToDirectory: (showFeedback: boolean) => Promise<void>;
  logInput: string;
  setLogInput: (text: string) => void;
  diagnosingLogs: boolean;
  logAnalysis: LogAnalysisResult | null;
  diagnosticError: string | null;
  successfulFixApplied: string | null;
  handleTriggerLogAnalysis: () => Promise<void>;
  insertDemoX4Log: () => void;
  handleLogFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleApplyAutoFix: (fix: any) => void;
}

export default function PlaytestWorkspace({
  activeModId,
  modWorkspacePath,
  syncStatus,
  syncErrorMsg,
  autoSaveEnabled,
  setAutoSaveEnabled,
  saveToDirectory,
  logInput,
  setLogInput,
  diagnosingLogs,
  logAnalysis,
  diagnosticError,
  successfulFixApplied,
  handleTriggerLogAnalysis,
  insertDemoX4Log,
  handleLogFileChange,
  handleApplyAutoFix
}: PlaytestWorkspaceProps) {
  const [gameLogStatus, setGameLogStatus] = useState<GameLogStatus | null>(null);
  const [gameLogLoading, setGameLogLoading] = useState<boolean>(false);
  const [gameLogError, setGameLogError] = useState<string>('');

  const refreshGameLogStatus = async () => {
    setGameLogLoading(true);
    setGameLogError('');
    try {
      const response = await fetch(`/api/agent/game-log/status?modId=${encodeURIComponent(activeModId)}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to read X4 debug log status.');
      }
      setGameLogStatus(data);
    } catch (err) {
      setGameLogError(err.message || 'Failed to read X4 debug log status.');
    } finally {
      setGameLogLoading(false);
    }
  };

  useEffect(() => {
    refreshGameLogStatus();
    // Poll every 4s so the watcher feels live during an in-game test (was 15s, which read
    // as "not automatic"). The tail is byte-bounded, so a fast poll is cheap.
    const timer = window.setInterval(refreshGameLogStatus, 4000);
    return () => window.clearInterval(timer);
    // reason: refreshGameLogStatus is a non-memoized component-body function; the polling interval should reset only on activeModId change, not every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeModId]);

  const gameLogTone = gameLogStatus?.status === 'errors'
    ? 'border-red-500/30 bg-red-500/5 text-red-300'
    : gameLogStatus?.status === 'warnings'
      ? 'border-amber-500/30 bg-amber-500/5 text-amber-300'
      : gameLogStatus?.status === 'clean'
        ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
        : 'border-white/10 bg-slate-900/35 text-slate-300';

  return (
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
          
          {modWorkspacePath ? (
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
        {modWorkspacePath ? (
          <div className="space-y-3">
            <div className="p-2.5 bg-[#0a0c10] border border-white/5 rounded-md font-mono text-[10px] flex justify-between items-center text-slate-400 gap-2">
              <span className="truncate" title="Direct location handle connection">📍 Staging Workspace: {modWorkspacePath}</span>
            </div>
            
            <div className="flex items-center justify-between gap-4">
              <label className="flex items-center gap-2 text-[10.5px] text-slate-300 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={autoSaveEnabled} 
                  onChange={(e) => setAutoSaveEnabled(e.target.checked)}
                  className="rounded accent-emerald-500 text-black border-white/20 cursor-pointer"
                />
                <span>Auto-sync on changes</span>
              </label>

              <button
                onClick={() => saveToDirectory(true)}
                disabled={syncStatus === 'syncing'}
                className="px-3 py-1 bg-emerald-500 hover:bg-emerald-600 font-sans text-black font-bold text-[10px] rounded transition-all flex items-center gap-1 cursor-pointer hover:scale-105 active:scale-95"
              >
                <Save className="w-3 h-3" />
                Save XML
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[10px] text-slate-500 leading-relaxed italic">
              No workspace staging folder configured. Please open Settings to set your Mod Workspace Folder.
            </p>
          </div>
        )}

        {syncStatus === 'syncing' && (
          <div className="p-2 bg-slate-900 border border-white/10 rounded font-mono text-[10px] text-slate-400 flex items-center justify-center gap-2 animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
            Writing XML packages to disk...
          </div>
        )}
        {syncStatus === 'success' && (
          <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded font-mono text-[10px] text-emerald-400 flex items-center justify-center gap-1.5 animate-fade-in">
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
              className="text-[9px] bg-cyan-900/40 hover:bg-cyan-900/75 border border-cyan-500/20 px-2 py-0.5 rounded text-cyan-400 font-bold transition-all shrink-0 cursor-pointer font-sans"
            >
              Load Demo Log
            </button>
          </h3>
          <p className="text-[11px] text-slate-400 leading-normal">
            Paste lines from <code className="text-cyan-400">debug.log</code>, or load it with the picker below to analyze MD engine issues.
          </p>
        </div>

        <div className={`rounded-lg border p-3 space-y-2 ${gameLogTone}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <div className="font-mono text-[9px] uppercase font-black tracking-wider text-white" title="Reflects only this mod's entries in the X4 debug log — not whether the mod is deployed, loaded in-game, or schema-valid.">
                Active-Mod Log Status: {gameLogStatus ? (GAME_LOG_STATUS_LABELS[gameLogStatus.status] || gameLogStatus.status) : 'CHECKING'}
              </div>
              <p className="text-[10px] leading-relaxed text-slate-300">
                {gameLogError || gameLogStatus?.summary || 'Reading recent debuglog.txt output...'}
              </p>
            </div>
            <button
              onClick={refreshGameLogStatus}
              disabled={gameLogLoading}
              className="px-2 py-1 bg-black/30 border border-white/10 rounded font-mono text-[9px] text-slate-200 hover:text-white disabled:opacity-50 flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${gameLogLoading ? 'animate-spin' : ''}`} />
              REFRESH
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[9px] font-mono text-slate-400">
            <span className="truncate" title={activeModId}>MOD: {activeModId}</span>
            <span className="truncate" title={gameLogStatus?.selectedLogPath || ''}>
              LOG: {gameLogStatus?.selectedLogPath || 'not found'}
            </span>
            {gameLogStatus?.logUpdatedAt && <span className="truncate">UPDATED: {new Date(gameLogStatus.logUpdatedAt).toLocaleTimeString()}</span>}
            {gameLogStatus?.counts && <span>ACTIVE ISSUES: {gameLogStatus.counts.activeIssues}</span>}
          </div>

          {gameLogStatus?.issues && gameLogStatus.issues.length > 0 && (
            <div className="space-y-1 max-h-28 overflow-y-auto scrollbar-thin">
              {gameLogStatus.issues.slice(-3).map((issue, index) => (
                <pre key={`${issue.lineNumber}-${index}`} className="whitespace-pre-wrap rounded bg-black/35 border border-white/5 p-1.5 text-[9px] leading-tight text-slate-300 font-mono">
                  [{issue.severity}] {issue.text}
                </pre>
              ))}
            </div>
          )}
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
          <div className="text-center animate-pulse">
            <span className="font-mono text-[10px] uppercase font-bold text-slate-200 tracking-wider">Compiling Trace Solutions...</span>
            <p className="text-[9px] uppercase font-mono text-slate-600 mt-0.5">Gemini searching for modding code bugs...</p>
          </div>
        </div>
      )}

      {/* RESULTS FROM TRACE ANALYSIS */}
      {logAnalysis && !diagnosingLogs && (
        <div className="space-y-3.5 animate-fade-in">
          <div className="px-1 border-l-2 border-cyan-500 space-y-1 text-left">
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
                    className={`p-3.5 rounded-xl border leading-relaxed space-y-3 relative overflow-hidden text-left ${
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
                    <div className="space-y-1 text-[11.5px]">
                      <span className="text-[9px] uppercase font-bold text-slate-500 font-mono text-left block">Why context fails</span>
                      <p className="text-slate-300 font-medium font-sans leading-relaxed text-left">
                        {issue.explanation}
                      </p>
                    </div>

                    {/* Effect in game */}
                    <div className="p-2 bg-black/25 rounded border border-white/[0.03] space-y-0.5 text-[10.5px]">
                      <span className="text-[9px] uppercase font-bold text-slate-400 font-mono block text-left">Ingame Impact</span>
                      <p className="text-slate-400 font-sans text-left">{issue.impact}</p>
                    </div>

                    {/* Suggested repair action */}
                    <div className="space-y-1 text-[10.5px]">
                      <span className="text-[9px] uppercase font-bold text-slate-500 font-mono text-left block">Playbook repair advice</span>
                      <p className="text-slate-300 font-sans leading-relaxed text-left">{issue.suggestedAction}</p>
                    </div>

                    {/* 1-Click AutoFix Action Button! */}
                    {issue.autoFix && (
                      <button
                        onClick={() => handleApplyAutoFix(issue.autoFix)}
                        className="mt-1.5 w-full py-2 bg-emerald-500 hover:bg-emerald-400 hover:border-emerald-300 border border-emerald-600 text-black font-mono font-bold text-[10.5px] uppercase rounded-lg shadow-[0_4px_12px_rgba(16,185,129,0.15)] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
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
      <div className="bg-[#121620]/45 border border-cyan-500/10 p-3.5 rounded-xl space-y-2 text-left">
        <h5 className="text-[10px] uppercase font-bold font-mono tracking-wider text-cyan-400 flex items-center gap-1.5">
          <Cpu className="w-3.5 h-3.5" />
          Egosoft Live Hot-Reload Guide
        </h5>
        <div className="text-[10px] text-slate-400 leading-relaxed font-sans font-medium space-y-2">
          <p>
            1. Launch X4: Foundations with properties: <code className="text-cyan-400 font-mono font-bold select-all bg-black/45 px-1 py-0.5 rounded">-debug scripts -logfile debuglog.txt</code>
          </p>
          <p>
            2. Refresh/save compiled files, then fire this reload signal in your game's active developer terminal input:
          </p>
          <div className="p-1 px-2 bg-slate-900/80 border border-white/5 rounded font-mono text-[9.5px] font-bold text-center block text-white select-all">
            refreshmd
          </div>
        </div>
      </div>

    </div>
  );
}
