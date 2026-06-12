/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Terminal, CheckCircle, AlertTriangle, Sparkles, Boxes, RefreshCw, FileCode, X, Layers, Crown } from 'lucide-react';
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

  // Extension Doctor — cross-mod conflict scan over the whole installed extensions/ folder.
  const [extScan, setExtScan] = useState<any>(null);
  const [extScanning, setExtScanning] = useState(false);
  const [extError, setExtError] = useState<string | null>(null);

  // Click-through file viewer for Extension Doctor findings (openTargets chips).
  const [extFile, setExtFile] = useState<{ path: string; name: string; content: string } | null>(null);
  const [extFileLoading, setExtFileLoading] = useState<string | null>(null);
  const [extFileError, setExtFileError] = useState<string | null>(null);

  const openExtensionFile = async (path: string) => {
    setExtFileLoading(path);
    setExtFileError(null);
    try {
      const res = await fetch('/api/agent/extension-file?path=' + encodeURIComponent(path));
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Failed to load file (${res.status})`);
      setExtFile(data);
    } catch (err: any) {
      setExtFileError(err.message || 'Failed to load extension file.');
    } finally {
      setExtFileLoading(null);
    }
  };

  // T4.4 Inc 2 — per-element override drill-down for cross-mod collision findings.
  // Fetches /api/agent/override-map (engine: src/lib/overrideMap.ts) for the
  // finding's contested base path: who rewrites what, who wins by load order.
  const [ovMap, setOvMap] = useState<any>(null);
  const [ovLoading, setOvLoading] = useState<string | null>(null);
  const [ovError, setOvError] = useState<string | null>(null);

  const openOverrideMap = async (file: string) => {
    setOvLoading(file);
    setOvError(null);
    try {
      const res = await fetch('/api/agent/override-map?file=' + encodeURIComponent(file));
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Override map failed (${res.status})`);
      setOvMap(data);
    } catch (err: any) {
      setOvError(err.message || 'Override map failed.');
    } finally {
      setOvLoading(null);
    }
  };

  const runExtensionScan = async () => {
    setExtScanning(true);
    setExtError(null);
    try {
      const res = await fetch('/api/agent/extension-doctor');
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Scan failed (${res.status})`);
      setExtScan(data);
    } catch (err: any) {
      setExtError(err.message || 'Extension scan failed.');
    } finally {
      setExtScanning(false);
    }
  };

  const sevStyle = (s: string) =>
    s === 'error' ? 'bg-red-500/5 text-red-350 border-red-500/20'
      : s === 'warning' ? 'bg-amber-500/5 text-amber-300 border-amber-500/25'
        : 'bg-blue-500/5 text-blue-300 border-blue-500/20';

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

      {/* CROSS-MOD EXTENSION DOCTOR */}
      <div className="bg-[#12141a]/90 border border-white/5 rounded-lg p-3 space-y-2.5 shrink-0">
        <div className="flex items-center justify-between border-b border-white/5 pb-2">
          <div className="flex items-center gap-1.5 text-slate-300 font-semibold tracking-tight text-[11px]">
            <Boxes className="w-4 h-4 text-cyan-400" />
            EXTENSION DOCTOR
          </div>
          {extScan && (
            <span className="text-[9px] font-bold text-slate-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
              {extScan.extensionsScanned} MODS
            </span>
          )}
        </div>
        <p className="text-[9.5px] text-slate-400 font-sans leading-normal">
          Scans every installed extension for missing dependencies, duplicate ids, and cross-mod file/patch conflicts.
        </p>
        <button
          onClick={runExtensionScan}
          disabled={extScanning}
          className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 px-3 py-2 rounded-md border border-cyan-500/30 cursor-pointer uppercase transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${extScanning ? 'animate-spin' : ''}`} />
          {extScanning ? 'Scanning Extensions...' : 'Scan Installed Extensions'}
        </button>

        {extError && (
          <div className="text-red-300 text-[10px] bg-red-500/5 border border-red-500/20 rounded p-2 font-sans">{extError}</div>
        )}

        {extScan && (
          <>
            <div className="grid grid-cols-3 gap-2 text-[10px] font-bold">
              <div className="flex items-center gap-1.5 text-slate-200 bg-red-500/10 p-1.5 rounded border border-red-500/20">
                <span className="w-2 h-2 rounded-full bg-red-500 block shrink-0" /> {extScan.counts?.error ?? 0} Err
              </div>
              <div className="flex items-center gap-1.5 text-slate-200 bg-amber-500/10 p-1.5 rounded border border-amber-500/20">
                <span className="w-2 h-2 rounded-full bg-amber-500 block shrink-0" /> {extScan.counts?.warning ?? 0} Warn
              </div>
              <div className="flex items-center gap-1.5 text-slate-200 bg-blue-500/10 p-1.5 rounded border border-blue-500/20">
                <span className="w-2 h-2 rounded-full bg-blue-500 block shrink-0" /> {extScan.counts?.info ?? 0} Info
              </div>
            </div>
            <div className="space-y-2 font-sans max-h-64 overflow-y-auto scrollbar-thin pr-1">
              {(!extScan.findings || extScan.findings.length === 0) ? (
                <div className="text-emerald-400/90 text-[10px] flex items-center gap-2 bg-emerald-500/5 p-3 rounded-lg border border-emerald-500/10 font-medium">
                  <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                  No cross-mod conflicts across {extScan.enabledCount} enabled extensions.
                </div>
              ) : extScan.findings.map((f: any, i: number) => (
                <div key={i} className={`p-2.5 rounded-lg border text-[10.5px] leading-relaxed flex items-start gap-2 ${sevStyle(f.severity)}`}>
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="space-y-1 min-w-0">
                    <span className="font-mono font-bold tracking-tight text-white uppercase block text-[8px] leading-none mb-1">
                      [{f.severity}] {f.code}
                    </span>
                    {f.filePath && (
                      <span className="font-mono text-[9px] text-slate-300 block bg-black/35 px-1 py-0.5 rounded border border-white/5 truncate max-w-full">{f.filePath}</span>
                    )}
                    <p className="text-slate-300 leading-normal">{f.message}</p>
                    {Array.isArray(f.openTargets) && f.openTargets.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {f.openTargets.map((t: any, j: number) => (
                          <button
                            key={j}
                            onClick={() => openExtensionFile(t.path)}
                            disabled={extFileLoading !== null}
                            title={t.path}
                            className="flex items-center gap-1 font-mono text-[8.5px] text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 px-1.5 py-0.5 rounded border border-cyan-500/25 cursor-pointer transition-all disabled:opacity-50 max-w-full"
                          >
                            <FileCode className={`w-2.5 h-2.5 shrink-0 ${extFileLoading === t.path ? 'animate-pulse' : ''}`} />
                            <span className="truncate">{t.label || t.path}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {f.domain === 'xml_patches' && f.filePath && (
                      <button
                        onClick={() => openOverrideMap(f.filePath)}
                        disabled={ovLoading !== null}
                        title={`Per-element override map for ${f.filePath}: who rewrites what, who wins`}
                        className="flex items-center gap-1 font-mono text-[8.5px] text-fuchsia-300 bg-fuchsia-500/10 hover:bg-fuchsia-500/20 px-1.5 py-0.5 rounded border border-fuchsia-500/25 cursor-pointer transition-all disabled:opacity-50 mt-1"
                      >
                        <Layers className={`w-2.5 h-2.5 shrink-0 ${ovLoading === f.filePath ? 'animate-pulse' : ''}`} />
                        OVERRIDE MAP
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {extFileError && (
              <div className="text-red-300 text-[10px] bg-red-500/5 border border-red-500/20 rounded p-2 font-sans">{extFileError}</div>
            )}
            {ovError && (
              <div className="text-red-300 text-[10px] bg-red-500/5 border border-red-500/20 rounded p-2 font-sans">{ovError}</div>
            )}
          </>
        )}
      </div>

      {/* Read-only extension file viewer modal */}
      {extFile && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6"
          onClick={() => setExtFile(null)}
        >
          <div
            className="bg-[#0d0f14] border border-cyan-500/25 rounded-lg shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col min-h-0"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <FileCode className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="font-mono text-[11px] text-slate-200 font-semibold truncate" title={extFile.path}>{extFile.path}</span>
                <span className="text-[8px] font-bold text-slate-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20 shrink-0 uppercase">Read-only</span>
              </div>
              <button
                onClick={() => setExtFile(null)}
                className="text-slate-400 hover:text-white p-1 rounded hover:bg-white/10 transition-all shrink-0 cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <pre className="flex-1 overflow-auto scrollbar-thin font-mono text-[10.5px] leading-relaxed text-slate-300 p-4 whitespace-pre min-h-0 select-text">
              {extFile.content}
            </pre>
          </div>
        </div>
      )}

      {/* Override-map drill-down modal (T4.4 Inc 2) */}
      {ovMap && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6"
          onClick={() => setOvMap(null)}
        >
          <div
            className="bg-[#0d0f14] border border-fuchsia-500/25 rounded-lg shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col min-h-0"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Layers className="w-4 h-4 text-fuchsia-400 shrink-0" />
                <span className="font-mono text-[11px] text-slate-200 font-semibold truncate" title={ovMap.targetFile}>{ovMap.targetFile}</span>
                <span
                  className={`text-[8px] font-bold px-1.5 py-0.5 rounded border shrink-0 uppercase ${ovMap.resolution === 'base' ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' : 'text-amber-300 bg-amber-500/10 border-amber-500/25'}`}
                  title={ovMap.resolution === 'base' ? 'Node identity resolved against the real vanilla file (loose or packed .cat/.dat)' : 'Vanilla content unavailable — entries grouped by selector string only (T4.1 VFS will sharpen this)'}
                >
                  {ovMap.resolution === 'base' ? 'BASE-RESOLVED' : 'SELECTOR-STRING'}
                </span>
              </div>
              <button
                onClick={() => setOvMap(null)}
                className="text-slate-400 hover:text-white p-1 rounded hover:bg-white/10 transition-all shrink-0 cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-4 py-2 border-b border-white/5 shrink-0 font-mono text-[9px] text-slate-400 flex flex-wrap items-center gap-1">
              LOAD ORDER:
              {(ovMap.loadOrder || []).map((m: string, i: number) => (
                <React.Fragment key={m}>
                  {i > 0 && <span className="text-slate-600">→</span>}
                  <span className="text-slate-300 bg-black/35 px-1 py-0.5 rounded border border-white/5">{m}</span>
                </React.Fragment>
              ))}
              <span className="ml-auto text-slate-500">
                {ovMap.counts?.contested ?? 0} contested · {ovMap.counts?.merged ?? 0} merged · {ovMap.counts?.single ?? 0} single
              </span>
            </div>
            <div className="flex-1 overflow-auto scrollbar-thin p-3 space-y-2 min-h-0 font-sans">
              {(ovMap.entries || []).length === 0 ? (
                <div className="text-slate-400 text-[10px] p-3">No overriding claims found for this file.</div>
              ) : (ovMap.entries || []).map((e: any, i: number) => (
                <div
                  key={i}
                  className={`p-2.5 rounded-lg border text-[10px] space-y-1.5 ${e.contested ? 'bg-red-500/5 border-red-500/20' : e.merged ? 'bg-emerald-500/5 border-emerald-500/15' : 'bg-white/[0.02] border-white/5'}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-[10px] text-slate-200 font-semibold truncate" title={e.node}>{e.node}</span>
                    <span className="text-[7.5px] font-bold uppercase text-slate-400 bg-black/35 px-1 py-0.5 rounded border border-white/5 shrink-0">{e.kind}</span>
                    {e.contested && (
                      <span className="text-[7.5px] font-bold uppercase text-red-300 bg-red-500/10 px-1 py-0.5 rounded border border-red-500/25 shrink-0" title="2+ mods, at least one replace/remove/full-file — load order decides">CONTESTED</span>
                    )}
                    {e.merged && (
                      <span className="text-[7.5px] font-bold uppercase text-emerald-300 bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/20 shrink-0" title="add+add — X4 merges appends, low risk">MERGED</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {(e.claims || []).map((c: any, j: number) => (
                      <span
                        key={j}
                        title={c.sel}
                        className={`font-mono text-[8.5px] px-1.5 py-0.5 rounded border ${c.folder === e.winner ? 'text-fuchsia-200 bg-fuchsia-500/15 border-fuchsia-500/30' : 'text-slate-300 bg-black/35 border-white/10'}`}
                      >
                        {c.folder}:{c.op}
                      </span>
                    ))}
                    <span className="flex items-center gap-1 font-mono text-[8.5px] text-fuchsia-300 ml-auto shrink-0" title="Loaded last — this mod's change survives">
                      <Crown className="w-2.5 h-2.5" /> {e.winner}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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

              const navigable = !!diag.sourceRef;
              const navigateToSource = () => {
                if (!diag.sourceRef) return;
                window.dispatchEvent(new CustomEvent('navigate-to-source', { detail: diag.sourceRef }));
              };

              return (
                <div
                  key={index}
                  onClick={navigable ? navigateToSource : undefined}
                  title={navigable ? 'Jump to source in the editor' : undefined}
                  className={`p-2.5 rounded-lg border text-[10.5px] leading-relaxed flex items-start gap-2 ${itemStyle} ${navigable ? 'cursor-pointer hover:bg-white/5 transition-all' : ''}`}
                >
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
                      <span className="font-mono text-[8px] text-cyan-300/90 block mt-1">
                        SOURCE: {diag.sourceRef.kind}{diag.sourceRef.label ? ` / ${diag.sourceRef.label}` : ''}{diag.sourceRef.id ? ` / ${diag.sourceRef.id}` : ''} →
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
