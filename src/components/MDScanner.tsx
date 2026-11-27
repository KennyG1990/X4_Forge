import React, { useMemo } from 'react';
import { Brain, Sparkles, RefreshCw, Compass, HelpCircle, AlertTriangle, ShieldCheck } from 'lucide-react';
import { ModWorkspace } from '../types';
import { explainWorkspace } from '../lib/mdExplain';

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

/** Coerce any value into a safe, renderable string. */
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
  /** A4.10/M-DET-2 — when false (AI tier off), the optional AI-polish affordance is absent.
   *  The deterministic explanation above always renders. */
  aiEnabled?: boolean;
}

export default function MDScanner({
  workspace,
  analysisResult,
  analyzing,
  analysisError,
  triggerAnalysis,
  cancelAnalysis,
  aiEnabled = false
}: MDScannerProps) {
  // DETERMINISTIC explanation — computed locally from the node graph, no AI, no credits,
  // instant, always current. Prose from the semantics registry; SEQUENCE from the edge-walk.
  const det = useMemo(
    () => explainWorkspace(workspace?.nodes || [], (workspace as any)?.links || []),
    // reason: the memo only consumes workspace.nodes/links; depending on the whole workspace object would recompute on unrelated field changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspace?.nodes, (workspace as any)?.links]
  );

  const hasContent = det.flowSteps.length > 0;
  const cov = det.coverage;

  return (
    <div className="p-3.5 space-y-4 font-sans select-text bg-[#0c0e12]">
      {/* HEADER — deterministic trust badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs font-semibold tracking-tight text-[#eef2f7]">Script Explanation</h3>
        </div>
        <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 text-[11px] font-mono font-medium select-none border border-emerald-500/25">
          <ShieldCheck className="w-3 h-3" /> Deterministic · No AI
        </span>
      </div>

      {!hasContent ? (
        <div className="h-full flex flex-col items-center justify-center text-center p-4 py-10 space-y-4 max-w-sm mx-auto">
          <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/25 rounded-full flex items-center justify-center">
            <Compass className="w-6 h-6 text-emerald-400" />
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
            This panel reads the node graph and explains, deterministically, what the mod is supposed to do —
            descriptions from the schema-backed semantics registry, execution order straight from the wires.
            No AI, no guessing. Add a cue with a trigger and actions to begin.
          </p>
        </div>
      ) : (
        <div className="space-y-4 text-[11px] leading-relaxed animate-fade-in">

          {/* coverage provenance */}
          <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2">
            <span>{cov.curated}/{cov.total} nodes from curated semantics</span>
            {cov.fallback > 0 && (
              <span className="text-amber-300">· {cov.fallback} long-tail (generic fallback)</span>
            )}
          </div>

          {/* 1. SUMMARY */}
          <div className="bg-[#11141a] border border-emerald-500/25 p-3.5 rounded-lg space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-400">Mod Description Summary</div>
            <p className="text-slate-100 text-xs font-medium leading-relaxed">{asText(det.summary)}</p>
          </div>

          {/* 2. ACTIVATION TRIGGER */}
          <div className="bg-[#11141a] border border-white/[0.08] p-3 rounded-lg space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-400">Activation Trigger</div>
            <div className="text-slate-200 leading-relaxed font-medium">{asText(det.triggerCondition)}</div>
          </div>

          {/* 3. LOGICAL EXECUTION FLOWCHART — order from the edge-walk */}
          <div className="space-y-2.5">
            <div className="text-[11px] font-semibold text-slate-400 px-0.5">Logical Execution Flowchart</div>
            <div className="relative pl-3.5 border-l border-white/[0.08] ml-1.5 space-y-2.5">
              {det.flowSteps.map((step, idx) => (
                <div key={idx} className="relative group" style={{ marginLeft: `${(step.depth || 0) * 12}px` }}>
                  <div className={`absolute -left-[19.5px] top-2 w-2 h-2 rounded-full border ${step.role === 'cue' ? 'border-blue-400/60 bg-blue-500/20' : step.role === 'trigger' ? 'border-amber-400/50 bg-[#0c0e12]' : 'border-emerald-400/40 bg-[#0c0e12]'} group-hover:scale-125 transition-transform`} />
                  <div className="bg-[#11141a] border border-white/[0.08] p-2.5 rounded hover:border-white/15 transition-colors space-y-1">
                    <div className="flex items-center justify-between text-[11px] gap-2">
                      <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <span className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${step.role === 'cue' ? 'bg-blue-500/15 text-blue-300' : step.role === 'trigger' ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{step.role}</span>
                        {asText(step.nodeLabel)}
                      </span>
                      <span className="font-mono text-slate-400">&lt;{asText(step.xmlTag)}&gt;</span>
                    </div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">{asText(step.plainEnglishAction)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 4. ASSET REGISTRY */}
          <div className="bg-[#11141a] border border-white/[0.08] rounded-lg space-y-2 p-3">
            <div className="text-[11px] font-semibold text-slate-400">Referenced Assets</div>
            {det.entityRegistry.length > 0 ? (
              <div className="space-y-2">
                {det.entityRegistry.map((ent, idx) => (
                  <div key={idx} className="bg-[#0a0c10] p-2.5 rounded-md border border-white/[0.08] flex justify-between items-start gap-2.5">
                    <div className="space-y-0.5 flex-1 text-left">
                      <span className="font-mono text-[11px] text-blue-300 font-semibold block">{asText(ent.name)}</span>
                      <p className="text-slate-400 text-[11px] leading-relaxed">{asText(ent.detail)}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 text-[11px] font-mono font-medium select-none shrink-0 text-center">
                      {asText(ent.type)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[11px] text-slate-400 italic p-1">No referenced assets detected.</div>
            )}
          </div>

          {/* 5. DETERMINISTIC NOTES — registry-sourced facts, not AI critique */}
          {det.tacticalInsights.length > 0 && (
            <div className="bg-amber-500/[0.04] border border-amber-500/20 p-3 rounded-lg space-y-2">
              <div className="text-[11px] font-semibold text-amber-300 flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5" /> Deterministic Notes
              </div>
              <ul className="space-y-1.5 pl-4 list-disc text-slate-300 text-[11px]">
                {det.tacticalInsights.map((insight, idx) => (
                  <li key={idx} className="leading-relaxed">{asText(insight)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ---- OPTIONAL AI POLISH — explicitly subordinate, non-authoritative; ABSENT when AI tier is off (M-DET-2) ---- */}
      {aiEnabled && (
      <div className="pt-2.5 border-t border-white/[0.08] space-y-2">
        <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Optional AI prose
        </div>

        {analyzing ? (
          <div className="flex items-center justify-between gap-2 p-2.5 rounded border border-amber-500/20 bg-amber-500/[0.04]">
            <span className="flex items-center gap-2 text-[11px] font-mono text-amber-300">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Polishing into prose…
            </span>
            {cancelAnalysis && (
              <button onClick={cancelAnalysis} className="px-2 py-0.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 rounded text-[11px] font-medium cursor-pointer">Cancel</button>
            )}
          </div>
        ) : analysisError ? (
          <div className="p-2.5 bg-red-500/10 border border-red-500/25 rounded text-red-300 text-[11px]">
            <div className="flex items-center gap-1.5 font-semibold mb-1"><AlertTriangle className="w-3.5 h-3.5" /> AI error</div>
            <p>{analysisError}</p>
            <button onClick={triggerAnalysis} className="mt-2 px-2 py-0.5 bg-red-500/15 border border-red-500/30 rounded text-red-200 text-[11px] font-medium cursor-pointer">Retry</button>
          </div>
        ) : analysisResult ? (
          <div className="bg-amber-500/[0.04] border border-amber-500/20 p-3 rounded-lg space-y-1.5">
            <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-300">
              <Brain className="w-3.5 h-3.5" /> AI polish — non-authoritative, verify against the explanation above
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed">{asText(analysisResult.summary)}</p>
            {Array.isArray(analysisResult.tacticalInsights) && analysisResult.tacticalInsights.length > 0 && (
              <ul className="space-y-1 pl-4 list-disc text-slate-400 text-[11px] pt-1">
                {analysisResult.tacticalInsights.map((t, i) => <li key={i}>{asText(t)}</li>)}
              </ul>
            )}
            <button onClick={triggerAnalysis} className="text-[11px] font-mono text-amber-300 hover:text-amber-200 underline cursor-pointer pt-1">Re-run AI polish</button>
          </div>
        ) : (
          <>
            <button
              onClick={triggerAnalysis}
              disabled={!hasContent}
              className="w-full py-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-200 rounded text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" /> Polish into prose with AI
            </button>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Optional. Spends AI credits and produces non-authoritative prose for a Nexus page or summary — the
              deterministic explanation above remains the source of truth.
            </p>
          </>
        )}
      </div>
      )}
    </div>
  );
}
