/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * #71 — multi-mod project view. Renders the dependency graph across ALL installed
 * extensions (from GET /api/agent/mod-dependency-graph, engine src/lib/modDependencyGraph.ts):
 * the resolved load order, each mod's dependencies + dependents, missing-required (breaks the
 * load) vs missing-optional (soft), and any dependency cycles (which X4 has no valid order for).
 * Read-only; fetches on mount.
 */

import { useEffect, useState } from 'react';
import { Boxes, AlertTriangle, ArrowDownUp, Link2, RefreshCw, CheckCircle2 } from 'lucide-react';
import { fetchJson } from '../lib/apiHelper';
import { StatusPill } from './ui';

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

export interface ModDependencyViewProps {
  embedded?: boolean;
}

export default function ModDependencyView({ embedded = false }: ModDependencyViewProps) {
  const [graph, setGraph] = useState<DepGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setErr(null);
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

  const rootClass = embedded
    ? 'rounded-lg border border-[#262c36] bg-[#11141a] text-[#eef2f7] p-3.5 space-y-3'
    : 'h-full overflow-auto bg-[#0c0e12] text-[#eef2f7] p-4 space-y-4';

  return (
    <section data-testid="mod-dependency-view" className={rootClass}>
      <div className="flex flex-wrap items-center gap-2">
        <Boxes className="w-4 h-4 text-[#93c5fd] shrink-0" />
        <h3 className="text-[13px] font-semibold text-[#eef2f7]">Installed Mod Ecosystem</h3>
        {graph && (
          <StatusPill tone="info">
            {graph.counts.mods} mods · load order resolved
          </StatusPill>
        )}
        <button
          type="button"
          onClick={load}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-[#262c36] bg-[#0a0c10] hover:border-[#3b82f6]/45 px-2.5 py-1 text-[11px] font-medium text-[#cbd5e1] hover:text-[#eef2f7] transition-colors cursor-pointer"
          title="Re-scan the extensions folder"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          <span>Rescan</span>
        </button>
      </div>

      {loading && <div className="text-xs text-[#687385] italic">Scanning installed extensions…</div>}
      {err && (
        <div className="rounded-md border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {err}
        </div>
      )}

      {graph && !loading && (
        <>
          <div
            data-testid="mod-eco-status"
            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
              graph.counts.cycles === 0 && graph.counts.missingRequired === 0
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
            }`}
          >
            {graph.counts.cycles === 0 && graph.counts.missingRequired === 0
              ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              : <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />}
            <span>
              {graph.counts.cycles === 0 && graph.counts.missingRequired === 0
                ? 'All dependencies resolve and there are no cycles — the install has a valid load order.'
                : `${graph.counts.missingRequired} missing required dep(s), ${graph.counts.cycles} cycle(s). ${graph.counts.missingOptional} missing optional.`}
            </span>
          </div>

          {graph.cycles.length > 0 && (
            <div className="rounded-md border border-rose-500/35 bg-rose-500/10 p-3 space-y-1.5">
              <div className="text-[11px] font-semibold text-rose-300">Dependency cycles</div>
              <ul className="space-y-1">
                {graph.cycles.map((cyc, i) => (
                  <li key={i} className="text-xs font-mono text-rose-200">{cyc.join(' → ')}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
            <section className="rounded-lg border border-[#262c36] bg-[#0a0c10] p-3">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-[#eef2f7] mb-2">
                <ArrowDownUp className="w-3.5 h-3.5 text-[#93c5fd]" />
                <span>Load order</span>
              </h4>
              <ol className="space-y-1 max-h-[60vh] overflow-auto">
                {graph.loadOrder.map((f, i) => (
                  <li key={f} className="text-xs font-mono text-[#cbd5e1]">
                    <span className="text-[#687385] mr-2">{String(i + 1).padStart(2, '0')}</span>{f}
                  </li>
                ))}
              </ol>
            </section>

            <section className="rounded-lg border border-[#262c36] bg-[#0a0c10] p-3 lg:col-span-2">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-[#eef2f7] mb-2">
                <Link2 className="w-3.5 h-3.5 text-[#93c5fd]" />
                <span>Mods &amp; dependencies</span>
              </h4>
              <div className="space-y-2 max-h-[60vh] overflow-auto">
                {nodes.map(n => (
                  <div key={n.folder} className="rounded-md border border-[#262c36] bg-[#11141a] px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                      <span className="text-[#eef2f7] font-medium">{n.id}</span>
                      {n.version && <span className="text-[#687385]">v{n.version}</span>}
                      {!n.enabled && <span className="text-amber-300 text-[11px] font-sans">disabled</span>}
                      {n.folder !== n.id && <span className="text-[#687385] text-[11px]">({n.folder})</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-mono">
                      {n.resolvedDeps.map(d => (
                        <span key={d.id} className="text-emerald-300/90" title={d.optional ? 'optional' : 'required'}>
                          → {d.id}{d.optional ? '?' : ''}
                        </span>
                      ))}
                      {n.missingRequired.map(d => (
                        <span key={d} className="text-rose-300" title="required but not installed">✕ {d}</span>
                      ))}
                      {n.missingOptional.map(d => (
                        <span key={d} className="text-amber-300" title="optional, not installed">○ {d}</span>
                      ))}
                      {n.resolvedDeps.length === 0 && n.missingRequired.length === 0 && n.missingOptional.length === 0 && (
                        <span className="text-[#687385] font-sans">no dependencies</span>
                      )}
                      {n.dependents.length > 0 && (
                        <span className="text-[#a0aab8] font-sans" title="mods that depend on this one">
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
    </section>
  );
}
