/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Terminal, CheckCircle, AlertTriangle, Sparkles } from 'lucide-react';
import { ModWorkspace, PackageDiagnostic, generateMDXML } from '../types';

interface PackageModDoctorProps {
  workspace: ModWorkspace;
  diagnostics: PackageDiagnostic[];
  diagnosticSource: 'checking' | 'package' | 'local';
}

export default function PackageModDoctor({
  workspace,
  diagnostics,
  diagnosticSource
}: PackageModDoctorProps) {
  const errors = diagnostics.filter(d => d.severity === 'error');
  const warnings = diagnostics.filter(d => d.severity === 'warning');

  const sendDiagnosticsToAI = () => {
    if (diagnostics.length === 0) return;
    const list = diagnostics.map((d, i) =>
      `${i + 1}. [${d.severity}] ${(d.domain || d.category || '')}: ${d.message}` +
      (d.filePath ? ` (file: ${d.filePath})` : '') +
      (d.sourceRef ? ` (source: ${d.sourceRef.kind}${d.sourceRef.label ? '/' + d.sourceRef.label : ''})` : '')
    ).join('\n');

    let currentCode = '';
    try {
      currentCode = generateMDXML(workspace);
    } catch (_) {}

    const prompt = `My X4 Foundations mod "${workspace.name || 'mod'}" has these Mod Doctor validation issues:\n\n${list}\n\n${currentCode ? `Here is the current Mission Director logic XML:\n\`\`\`xml\n${currentCode}\n\`\`\`\n\n` : ''}For each issue, explain plainly what's wrong and exactly how to fix it (which node, property, or value to change). Keep it concise.`;
    window.dispatchEvent(new CustomEvent('open-ai-chat', { detail: { prompt } }));
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#080a0e] p-3 space-y-3 shrink-0 select-none font-mono text-xs">
      {/* Header Info Card */}
      <div className="bg-[#12141a]/90 border border-white/5 rounded-lg p-3 space-y-2.5">
        <div className="flex items-center justify-between border-b border-white/5 pb-2">
          <div className="flex items-center gap-1.5 text-slate-300 font-semibold tracking-tight text-[11px]">
            <Terminal className="w-4 h-4 text-cyan-400 animate-pulse" />
            PACKAGE DIAGNOSTICS
          </div>
          <span className="text-[9px] font-bold text-slate-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
            {diagnosticSource === 'checking' ? 'CHECKING...' : diagnosticSource === 'package' ? 'API INTEGRATED' : 'LOCAL ENGINE'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[10px] font-bold">
          <div className="flex items-center gap-2 text-slate-200 bg-red-500/10 p-2 rounded border border-red-500/20">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse block shrink-0" />
            <span>{errors.length} Errors</span>
          </div>
          <div className="flex items-center gap-2 text-slate-200 bg-amber-500/10 p-2 rounded border border-amber-500/20">
            <span className="w-2 h-2 rounded-full bg-amber-500 block shrink-0" />
            <span>{warnings.length} Warnings</span>
          </div>
        </div>

        {diagnostics.length > 0 && (
          <button
            onClick={sendDiagnosticsToAI}
            className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 px-3 py-2 rounded-md border border-cyan-500/30 cursor-pointer uppercase transition-all"
            title="Ask AI Copilot for fixes"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
            Ask AI Assistant For Fixes
          </button>
        )}
      </div>

      {/* Issues list container */}
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0 pr-1 transition-all scrollbar-thin">
        {diagnostics.length === 0 ? (
          <div className="text-emerald-400/90 text-[10.5px] leading-normal flex flex-col items-center justify-center text-center gap-2 bg-emerald-500/5 p-4 rounded-lg border border-emerald-500/10 font-sans font-medium h-32">
            <CheckCircle className="w-7 h-7 text-emerald-400 shrink-0 mb-1" />
            <span className="font-mono font-bold uppercase text-[9px] text-emerald-300 tracking-wider">Mod Status Clean</span>
            <span>All generated mod files comply with X4 system validation schemas.</span>
          </div>
        ) : (
          <div className="space-y-2 font-sans">
            {diagnostics.map((diag, index) => {
              const itemStyle = diag.severity === 'error'
                ? 'bg-red-500/5 text-red-350 border-red-500/20'
                : (diag.severity === 'warning' ? 'bg-amber-500/5 text-amber-300 border-amber-500/25' : 'bg-blue-500/5 text-blue-300 border-blue-500/20');

              return (
                <div key={index} className={`p-2.5 rounded-lg border text-[10.5px] leading-relaxed flex items-start gap-2 ${itemStyle}`}>
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                  <div className="space-y-1">
                    <span className="font-mono font-bold tracking-tight text-white uppercase block text-[8px] leading-none mb-1">
                      [{diag.severity}] {diag.domain ? `${diag.domain.toUpperCase()} / ` : ''}{diag.code || diag.category.toUpperCase()}
                    </span>
                    {diag.filePath && (
                      <span className="font-mono text-[9px] text-slate-300 block bg-black/35 px-1 py-0.5 rounded border border-white/5 truncate max-w-full">
                        {diag.filePath}
                      </span>
                    )}
                    <p className="text-slate-300 leading-normal">{diag.message}</p>
                    {diag.sourceRef && (
                      <span className="font-mono text-[8px] text-slate-400 block mt-1">
                        SOURCE: {diag.sourceRef.kind}{diag.sourceRef.label ? ` / ${diag.sourceRef.label}` : ''}{diag.sourceRef.id ? ` / ${diag.sourceRef.id}` : ''}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
