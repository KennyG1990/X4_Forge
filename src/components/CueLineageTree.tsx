/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tier 2 / T2.2 — visual cue-lineage tree with structural broken-lineage highlighting.
 *
 * Renders the result of `analyzeCueLineage` (src/lib/cueLineage.ts): the cue tree
 * (root cues → sub-cues), each cue's trigger / listen / signal edges, and the structural
 * findings. Broken lineage (dangling local cue refs, duplicate/unnamed cues, isolated
 * cues, dangling links) is surfaced in red/amber. Pure read-only analysis — no scope
 * boundary crossed; it only reads the in-memory node graph.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GitBranch, AlertTriangle, AlertCircle, Zap, Ear, Radio, ChevronRight, CheckCircle2, Activity, FileText } from 'lucide-react';
import { ModWorkspace } from '../types';
import { analyzeCueLineage, type CueLineageCueInfo } from '../lib/cueLineage';
import { parseLogTelemetry, type CueTelemetry } from '../lib/logTelemetry';

interface CueLineageTreeProps {
  workspace: ModWorkspace;
}

export default function CueLineageTree({ workspace }: CueLineageTreeProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [logText, setLogText] = useState('');
  const [showLog, setShowLog] = useState(false);
  const result = useMemo(
    () => analyzeCueLineage(workspace.nodes || [], workspace.links || []),
    [workspace.nodes, workspace.links]
  );

  const { cues, findings } = result;
  const errors = findings.filter(f => f.severity === 'error');
  const warnings = findings.filter(f => f.severity === 'warning');

  // refs that don't resolve to a local cue (for inline red highlighting)
  const danglingRefs = useMemo(
    () => new Set(findings.filter(f => f.code === 'dangling_cue_ref' && f.ref).map(f => f.ref as string)),
    [findings]
  );

  const byId = useMemo(() => new Map(cues.map(c => [c.id, c])), [cues]);
  const roots = cues.filter(c => c.parentId === null);
  const pastedTele = useMemo(() => {
    if (!logText.trim()) return new Map<string, CueTelemetry>();
    const t = parseLogTelemetry(logText, cues.map(c => c.name).filter(Boolean));
    return new Map(t.cues.map(c => [c.name, c]));
  }, [logText, cues]);

  // LIVE binding (watcher consolidation): subscribe to the SAME backend
  // debuglog feed the Playtest watcher uses (game-log/status discovers the
  // configured x4LogPath; log-file-tail reads + parses it server-side), so the
  // app has exactly ONE log watcher. The paste box stays as an offline IMPORT
  // for logs from other machines/sessions — an input, not a second watcher.
  const [liveMode, setLiveMode] = useState(false);
  const [liveTele, setLiveTele] = useState<Map<string, CueTelemetry> | null>(null);
  const [liveStatus, setLiveStatus] = useState('');
  const liveTick = useRef(0);

  useEffect(() => {
    if (!liveMode) { setLiveTele(null); setLiveStatus(''); return; }
    let stopped = false;
    const poll = async () => {
      const tick = ++liveTick.current;
      try {
        const st = await fetch('/api/agent/game-log/status').then(r => r.json());
        const logPath = st && st.selectedLogPath;
        if (!logPath) {
          if (!stopped && tick === liveTick.current) {
            setLiveTele(null);
            setLiveStatus('no debuglog found — configure the X4 log path (see the Playtest watcher)');
          }
          return;
        }
        const tail = await fetch('/api/agent/log-file-tail', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: logPath, cueNames: cues.map(c => c.name).filter(Boolean) })
        }).then(r => r.json());
        if (stopped || tick !== liveTick.current) return;
        if (tail.success && tail.telemetry) {
          setLiveTele(new Map((tail.telemetry.cues || []).map((c: CueTelemetry) => [c.name, c])));
          setLiveStatus('live · ' + String(logPath).split(/[\\/]/).pop() + ' · ' + ((tail.telemetry.entries || []).length) + ' recent entries');
        } else {
          setLiveStatus(tail.error || 'tail failed');
        }
      } catch (e: any) {
        if (!stopped) setLiveStatus('feed unavailable: ' + String((e && e.message) || e));
      }
    };
    poll();
    const t = window.setInterval(poll, 10000);
    return () => { stopped = true; window.clearInterval(t); };
  }, [liveMode, cues]);

  // Live feed wins while enabled; pasted text is the offline fallback.
  const cueTele = liveMode && liveTele ? liveTele : pastedTele;

  const renderCue = (cue: CueLineageCueInfo, depth: number): React.ReactNode => {
    const tele = cue.name ? cueTele.get(cue.name) : undefined;
    const rowTint = tele ? (tele.errors > 0 ? 'border-l-2 border-red-500 bg-red-500/5' : 'border-l-2 border-emerald-500 bg-emerald-500/5') : '';
    return (
    <div key={cue.id}>
      <div
        className={`flex items-start gap-1.5 py-1 px-1.5 rounded hover:bg-white/5 ${rowTint}`}
        style={{ paddingLeft: 6 + depth * 16 }}
      >
        <GitBranch className="w-3 h-3 text-cyan-500/70 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <span className={`font-mono text-[11px] font-bold ${cue.name ? 'text-slate-200' : 'text-amber-400'}`}>
            {cue.name || '(unnamed cue)'}
          </span>
          <span className="ml-1.5 inline-flex flex-wrap gap-1 align-middle">
            {cue.hasTriggerEvent && (
              <span className="inline-flex items-center gap-0.5 text-[8.5px] text-emerald-400/90" title="has a trigger event">
                <Zap className="w-2.5 h-2.5" />trigger
              </span>
            )}
            {cue.listensTo.map((n, i) => (
              <span key={'l' + i} className={`inline-flex items-center gap-0.5 text-[8.5px] ${danglingRefs.has(n) ? 'text-red-400 font-bold' : 'text-cyan-400/90'}`} title={danglingRefs.has(n) ? 'listens for a cue that does not exist' : 'listens for cue'}>
                <Ear className="w-2.5 h-2.5" />{n}{danglingRefs.has(n) ? ' ✕' : ''}
              </span>
            ))}
            {cue.signals.map((n, i) => (
              <span key={'s' + i} className={`inline-flex items-center gap-0.5 text-[8.5px] ${danglingRefs.has(n) ? 'text-red-400 font-bold' : 'text-violet-400/90'}`} title={danglingRefs.has(n) ? 'signals a cue that does not exist' : 'signals cue'}>
                <Radio className="w-2.5 h-2.5" />{n}{danglingRefs.has(n) ? ' ✕' : ''}
              </span>
            ))}
            {tele && (
              <span className={`inline-flex items-center gap-0.5 text-[8.5px] font-bold ${tele.errors > 0 ? 'text-red-400' : 'text-emerald-400'}`} title="appearances in the bound log">
                <Activity className="w-2.5 h-2.5" />{tele.hits}×{tele.errors > 0 ? ` ${tele.errors}✕` : ''}
              </span>
            )}
          </span>
        </div>
      </div>
      {cue.childIds.map(cid => { const child = byId.get(cid); return child ? renderCue(child, depth + 1) : null; })}
    </div>
    );
  };

  return (
    <div className="border-b border-white/5 bg-[#0a0c11]">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-left hover:bg-white/5 transition-colors"
      >
        <ChevronRight className={`w-3.5 h-3.5 text-slate-500 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
        <GitBranch className="w-3.5 h-3.5 text-cyan-400" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">Cue Lineage Tree</span>
        <span className="ml-1 text-[9px] text-slate-500 font-mono">{cues.length} cue{cues.length === 1 ? '' : 's'}</span>
        <span className="ml-auto flex items-center gap-2 text-[9px] font-mono font-bold">
          {errors.length > 0 && <span className="text-red-400 flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" />{errors.length}</span>}
          {warnings.length > 0 && <span className="text-amber-400 flex items-center gap-0.5"><AlertCircle className="w-3 h-3" />{warnings.length}</span>}
          {errors.length === 0 && warnings.length === 0 && cues.length > 0 && <span className="text-emerald-400 flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" />clean</span>}
        </span>
      </button>

      {!collapsed && (
        <div className="px-2 pb-3">
          {cues.length === 0 ? (
            <p className="text-[10px] text-slate-600 italic px-2 py-3">No cues in this workspace yet.</p>
          ) : (
            <>
              {findings.length > 0 && (
                <div className="mx-1 mb-2 rounded border border-white/10 bg-black/40 divide-y divide-white/5">
                  {findings.map((f, i) => (
                    <div key={i} className={`flex items-start gap-1.5 px-2 py-1.5 text-[10px] ${f.severity === 'error' ? 'text-red-400' : 'text-amber-400'}`}>
                      {f.severity === 'error' ? <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> : <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />}
                      <span className="leading-snug">{f.message}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mx-1 rounded border border-white/5 bg-black/20 py-1">
                {roots.length > 0 ? roots.map(c => renderCue(c, 0)) : cues.map(c => renderCue(c, 0))}
              </div>
              <div className="px-2 pt-2 text-[8.5px] text-slate-600 leading-relaxed">
                Structural analysis only — flags dangling local cue refs, duplicate/unnamed cues, isolated cues, and broken links. Cross-script (<code className="text-slate-500">md.Script.Cue</code>) refs are treated as external.
              </div>
              <div className="mx-1 mt-2 border-t border-white/5 pt-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => setLiveMode(v => !v)}
                    title="Watch the live X4 debuglog — the same feed the Playtest watcher uses — and light up cues in real time"
                    className={`flex items-center gap-1 text-[9px] font-bold uppercase ${liveMode ? 'text-emerald-300' : 'text-slate-400 hover:text-emerald-300'}`}
                  >
                    <Radio className={`w-3 h-3 ${liveMode ? 'animate-pulse' : ''}`} />{liveMode ? 'Live: ON' : 'Bind live game log'}
                  </button>
                  <button onClick={() => setShowLog(v => !v)} className="flex items-center gap-1 text-[9px] font-bold uppercase text-violet-300 hover:text-violet-200">
                    <Activity className="w-3 h-3" />{showLog ? 'Hide' : 'Import'} offline log{cueTele.size > 0 ? ` (${cueTele.size} lit)` : ''}
                  </button>
                </div>
                {liveMode && (
                  <div className="mt-1 text-[8.5px] font-mono text-slate-500 truncate" title={liveStatus}>
                    {liveStatus || 'connecting to debuglog feed…'}
                  </div>
                )}
                {showLog && (
                  <div className="mt-1.5 space-y-1">
                    <textarea value={logText} onChange={e => setLogText(e.target.value)} spellCheck={false}
                      placeholder={"Paste X4 debug-log text. Lines naming a cue (or [MDStudio] cue=<Name>) light it up; errors turn it red."}
                      className="w-full h-24 p-2 rounded bg-black/60 border border-white/10 text-slate-300 font-mono text-[10px] leading-snug outline-none resize-y" />
                    <div className="flex items-center gap-2">
                      <label className="text-[9px] text-cyan-400 hover:text-cyan-300 cursor-pointer flex items-center gap-1">
                        <FileText className="w-3 h-3" />Load .log file
                        <input type="file" accept=".log,.txt" className="hidden" onChange={e => { const fl = e.target.files?.[0]; if (fl) { const rd = new FileReader(); rd.onload = () => setLogText(String(rd.result || '')); rd.readAsText(fl); } }} />
                      </label>
                      {logText && <button onClick={() => setLogText('')} className="text-[9px] text-slate-500 hover:text-red-400">clear</button>}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
