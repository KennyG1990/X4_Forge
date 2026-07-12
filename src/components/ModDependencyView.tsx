/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * #71 — multi-mod project view. Renders the dependency graph across ALL installed
 * extensions (from GET /api/agent/mod-dependency-graph, engine src/lib/modDependencyGraph.ts):
 * the resolved load order, each mod's dependencies + dependents, missing-required (breaks the
 * load) vs missing-optional (soft), and any dependency cycles (which X4 has no valid order for).
 * Read-only; fetches on mount. The Doctor only folds cycles into its findings — this is the
 * full ecosystem overview.
 */

import { useEffect, useState } from 'react';
import { Boxes, AlertTriangle, ArrowDownUp, Link2, RefreshCw, CheckCircle2 } from 'lucide-react';
import { fetchJson } from '../lib/apiHelper';

interface DepNode {
  folder: string; id: string; name?: string; version?: string; enabled: boolean;
  resolvedDeps: { id: string; folder: string; optional: boolean }[];
  missingRequired: string[]; missingOptional: string[]; dependents: string[];
}
interface DepIssue { folder: string; modId: string; kind: string; detail: string; cyclePath?: string[] }
interface DepGraph {
  success: boolean; error?: string; extensionsRoot?: string;
  nodes: DepNode[]; loadOrder: string[]; cycles: string[][]; issues: DepIssue[];
  counts: { mods: number; missingRequired: number; missingOptional: number; cycles: number };
}

export default function ModDependencyView() {
  const [graph, setGraph] = useState<DepGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    setLoading(true); setErr(null);
    // Audit #4: fetchJson surfaces the server's real message (a blind r.json() showed
    // "SyntaxError: Unexpected token '<'" whenever the API was mid-restart).
    fetchJson<DepGraph>('/api/agent/mod-dependency-graph', undefined, 'Failed to load the mod dependency graph.')
      .then((d: DepGraph) => {
        if (d && d.success) setGraph(d);
        else setErr(d?.error || 'Failed to load the mod dependency graph.');
      })
      .catch(e => setErr(e?.message || String(e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const orderIndex = (folder: string) => {
    const i = graph?.loadOrder.indexOf(folder) ?? -1;
    return i < 0 ? 999 : i;
  };
  const nodes = (graph?.nodes || []).slice().sort((a, b) => orderIndex(a.folder) - orderIndex(b.folder));

  return (
    <div data-testid="mod-dependency-view" className="h-full overflow-auto bg-[#0b0d12] text-slate-200 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Boxes className="w-5 h-5 text-cyan-400" />
        <h2 className="text-sm font-bold font-mono uppercase tracking-wider text-cyan-300">Installed Mod Ecosystem</h2>
        {graph && (
          <span className="text-[11px] text-slate-500 font-mono">
            {graph.counts.mods} mods · load order resolved
          </span>
        )}
        <button
          onClick={load}
          className="ml-auto flex items-center gap-1 rounded border border-white/10 px-2 py-0.5 text-[11px] text-slate-400 hover:text-slate-200 hover:border-white/20"
          title="Re-scan the extensions folder"
        >
          <RefreshCw className="w-3 h-3" /> Rescan
        </button>
      </div>

      {loading && <div className="text-[12px] text-slate-500 italic">Scanning installed extensions…</div>}
      {err && (
        <div className="rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
          {err}
        </div>
      )}

      {graph && !loading && (
        <>
          {/* status banner */}
          <div
            data-testid="mod-eco-status"
            className={`flex items-center gap-2 rounded border px-3 py-2 text-[12px] ${
              graph.counts.cycles === 0 && graph.counts.missingRequired === 0
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
            }`}
          >
            {graph.counts.cycles === 0 && graph.counts.missingRequired === 0
              ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            <span>
              {graph.counts.cycles === 0 && graph.counts.missingRequired === 0
                ? 'All dependencies resolve and there are no cycles — the install has a valid load order.'
                : `${graph.counts.missingRequired} missing required dep(s), ${graph.counts.cycles} cycle(s). ${graph.counts.missingOptional} missing optional.`}
            </span>
          </div>

          {/* cycles (hardest failure) */}
          {graph.cycles.length > 0 && (
            <div className="rounded border border-rose-500/30 bg-rose-500/10 p-2">
              <div className="text-[10px] font-bold font-mono uppercase text-rose-300 mb-1">Dependency cycles</div>
              <ul className="space-y-1">
                {graph.cycles.map((cyc, i) => (
                  <li key={i} className="text-[12px] font-mono text-rose-200">{cyc.join(' → ')}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* resolved load order */}
            <section className="rounded border border-white/10 bg-black/30 p-3">
              <h3 className="flex items-center gap-1.5 text-[11px] font-bold font-mono uppercase text-slate-400 mb-2">
                <ArrowDownUp className="w-3 h-3" /> Load order
              </h3>
              <ol className="space-y-0.5">
                {graph.loadOrder.map((f, i) => (
                  <li key={f} className="text-[12px] font-mono text-slate-300">
                    <span className="text-slate-600 mr-2">{String(i + 1).padStart(2, '0')}</span>{f}
                  </li>
                ))}
              </ol>
            </section>

            {/* per-mod dependency detail */}
            <section className="rounded border border-white/10 bg-black/30 p-3 lg:col-span-2">
              <h3 className="flex items-center gap-1.5 text-[11px] font-bold font-mono uppercase text-slate-400 mb-2">
                <Link2 className="w-3 h-3" /> Mods &amp; dependencies
              </h3>
              <div className="space-y-2 max-h-[60vh] overflow-auto">
                {nodes.map(n => (
                  <div key={n.folder} className="rounded border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
                    <div className="flex items-center gap-2 text-[12px] font-mono">
                      <span className="text-slate-200">{n.id}</span>
                      {n.version && <span className="text-slate-600">v{n.version}</span>}
                      {!n.enabled && <span className="text-amber-400 text-[10px]">disabled</span>}
                      {n.folder !== n.id && <span className="text-slate-600 text-[10px]">({n.folder})</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-mono">
                      {n.resolvedDeps.map(d => (
                        <span key={d.id} className="text-emerald-300/80" title={d.optional ? 'optional' : 'required'}>
                          → {d.id}{d.optional ? '?' : ''}
                        </span>
                      ))}
                      {n.missingRequired.map(d => (
                        <span key={d} className="text-rose-300" title="required but not installed">✕ {d}</span>
                      ))}
                      {n.missingOptional.map(d => (
                        <span key={d} className="text-amber-300/80" title="optional, not installed">○ {d}</span>
                      ))}
                      {n.resolvedDeps.length === 0 && n.missingRequired.length === 0 && n.missingOptional.length === 0 && (
                        <span className="text-slate-600">no dependencies</span>
                      )}
                      {n.dependents.length > 0 && (
                        <span className="text-slate-500" title="mods that depend on this one">
                          ← needed by {n.dependents.length}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
