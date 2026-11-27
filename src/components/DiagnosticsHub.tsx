/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ModWorkspace } from '../types';
import { getAIHeaders, handleApiResponse } from '../lib/apiHelper';
import MDScanner from './MDScanner';

interface DiagnosticsHubProps {
  workspace: ModWorkspace;
  /** A4.10 — gates the optional AI-polish affordance inside MDScanner. */
  aiEnabled?: boolean;
}

/**
 * Self-contained deterministic Script Explanation & optional AI-polish wrapper
 * for the Diagnostics → Scripts view. Tracks workspace staleness by reference
 * (O(1)) so large workspaces never block renders with synchronous JSON.stringify.
 */
export default function DiagnosticsHub({
  workspace,
  aiEnabled = false,
}: DiagnosticsHubProps) {
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const analyzedWorkspaceRef = React.useRef<ModWorkspace | null>(null);
  const analysisAbortRef = React.useRef<AbortController | null>(null);

  const isAnalysisStale = analysisResult !== null && analyzedWorkspaceRef.current !== workspace;

  const triggerAnalysis = async () => {
    setAnalyzing(true);
    setAnalysisError(null);
    const controller = new AbortController();
    analysisAbortRef.current = controller;
    try {
      const response = await fetch('/api/gemini/analyze', {
        method: 'POST',
        headers: getAIHeaders(),
        body: JSON.stringify({ workspace }),
        signal: controller.signal,
      });
      const data = await handleApiResponse(response, 'Failed to establish telemetry connection to server.');
      setAnalysisResult(data.analysis);
      analyzedWorkspaceRef.current = workspace;
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setAnalysisError('Analysis cancelled.');
      } else {
        console.error(err);
        setAnalysisError(err?.message || 'Failed to catalog script outline. Verify telemetry status.');
      }
    } finally {
      analysisAbortRef.current = null;
      setAnalyzing(false);
    }
  };

  const cancelAnalysis = () => {
    analysisAbortRef.current?.abort();
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#0c0e12]">
      {analysisResult && (
        <div className="flex bg-[#11141a] border-b border-white/[0.08] justify-end px-3 py-1.5 shrink-0">
          <button
            type="button"
            onClick={triggerAnalysis}
            disabled={analyzing}
            className="px-2.5 py-1 bg-amber-500/12 hover:bg-amber-500/20 border border-amber-500/35 text-amber-300 rounded text-[11px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
            title="Re-run analysis"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${analyzing ? 'animate-spin' : ''}`} />
            Re-Analyze
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto bg-[#0c0e12] min-h-0">
        <MDScanner
          workspace={workspace}
          analysisResult={analysisResult}
          analyzing={analyzing}
          analysisError={analysisError}
          triggerAnalysis={triggerAnalysis}
          isAnalysisStale={isAnalysisStale}
          cancelAnalysis={cancelAnalysis}
          aiEnabled={aiEnabled}
        />
      </div>
    </div>
  );
}
