import React from 'react';
import { Brain, Sparkles, RefreshCw, Compass, Activity, HelpCircle, AlertTriangle } from 'lucide-react';
import { ModWorkspace } from '../types';

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

/** Coerce any model-returned value into a safe, renderable string.
 *  Guards against the model returning an object/array where a string is expected
 *  (React throws "Objects are not valid as a React child" otherwise). */
function asText(value: any): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value); } catch { return String(value); }
}

interface MDScannerProps {
  workspace: ModWorkspace;
  analysisResult: ScriptAnalysis | null;
  analyzing: boolean;
  analysisError: string | null;
  triggerAnalysis: () => Promise<void>;
  isAnalysisStale: boolean;
  cancelAnalysis?: () => void;
}

export default function MDScanner({
  workspace,
  analysisResult,
  analyzing,
  analysisError,
  triggerAnalysis,
  isAnalysisStale,
  cancelAnalysis
}: MDScannerProps) {
  return (
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
            className="px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-[9px] uppercase font-bold text-amber-300 transition-all font-sans cursor-pointer hover:scale-105 active:scale-95"
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
            className="mt-3.5 w-full py-1.5 bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 rounded text-red-200 font-semibold font-mono text-[10px] uppercase transition-all cursor-pointer"
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
            <h3 className="text-sm font-bold tracking-tight text-white mb-2 uppercase font-mono">Cognitive Script Summary</h3>
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
          {cancelAnalysis && (
            <button
              onClick={cancelAnalysis}
              className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 rounded text-[10px] font-mono font-bold uppercase transition-all cursor-pointer"
            >
              Cancel
            </button>
          )}
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
            <p className="text-slate-200 text-xs font-medium leading-relaxed font-sans">{asText(analysisResult.summary)}</p>
          </div>

          {/* 2. TRIGGER CONDITION SECTION */}
          <div className="bg-slate-900/60 border border-white/5 p-3 rounded-lg space-y-1.5">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Activation Trigger</div>
            <div className="text-slate-300 leading-relaxed font-medium">{asText(analysisResult.triggerCondition)}</div>
          </div>

          {/* 3. STEP-BY-STEP CHRONOLOGY TIMELINE */}
          <div className="space-y-2.5">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono px-0.5">Logical Execution Flowchart</div>
            
            {Array.isArray(analysisResult.flowSteps) && analysisResult.flowSteps.length > 0 ? (
              <div className="relative pl-3.5 border-l border-white/10 ml-1.5 space-y-4">
                {analysisResult.flowSteps.map((step: any, idx) => (
                  <div key={idx} className="relative group">
                    {/* Dot item tracker absolute positioned */}
                    <div className="absolute -left-[19.5px] top-1.5 w-2 h-2 rounded-full border border-amber-500/40 bg-[#0a0c10] group-hover:bg-amber-500 transition-colors" />

                    <div className="bg-[#12141a]/60 border border-white/5 p-2.5 rounded hover:border-white/10 transition-all space-y-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-bold text-slate-200">{asText(step?.nodeLabel)}</span>
                        <span className="font-mono text-slate-500 font-bold">&lt;{asText(step?.xmlTag)}&gt;</span>
                      </div>
                      <p className="text-slate-400 text-[10.5px] leading-relaxed font-sans">{asText(step?.plainEnglishAction)}</p>
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
            
            {Array.isArray(analysisResult.entityRegistry) && analysisResult.entityRegistry.length > 0 ? (
              <div className="space-y-2">
                {analysisResult.entityRegistry.map((ent: any, idx) => (
                  <div key={idx} className="bg-black/20 p-2 rounded-md border border-white/[0.03] flex justify-between items-start gap-2.5">
                    <div className="space-y-0.5 flex-1 text-left">
                      <span className="font-mono text-[10px] text-cyan-400 font-bold tracking-tight block">{asText(ent?.name)}</span>
                      <p className="text-slate-400 text-[10px] leading-relaxed">{asText(ent?.detail)}</p>
                    </div>
                    <span className="px-1.5 py-0.5 rounded bg-cyan-900/20 text-cyan-400 border border-cyan-500/10 text-[8px] font-mono font-bold uppercase select-none shrink-0 text-center">
                      {asText(ent?.type)}
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
            
            {Array.isArray(analysisResult.tacticalInsights) && analysisResult.tacticalInsights.length > 0 ? (
              <ul className="space-y-1.5 pl-3 list-disc text-slate-400 text-[10.5px]">
                {analysisResult.tacticalInsights.map((insight: any, idx) => (
                  <li key={idx} className="leading-relaxed font-sans text-slate-300">{asText(insight)}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[10px] text-slate-500">Workspace is fully optimized. Clear for standard testing.</p>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
