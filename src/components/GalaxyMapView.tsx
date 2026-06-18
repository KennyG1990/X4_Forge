/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * #64 Phase 1 UI: read-only galaxy/sector map bound to /api/agent/galaxy-map.
 * This is a viewer for already-authored game data, not the deferred sector editor.
 */

import React from 'react';
import { AlertTriangle, CheckCircle2, Crosshair, Loader2, Map as MapIcon, Search, Target } from 'lucide-react';
import type { GalaxyCluster, GalaxyMap, GalaxySector } from '../lib/galaxyMap';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; map: GalaxyMap };

const VIEW_W = 1000;
const VIEW_H = 620;

function shortMacro(name: string): string {
  return name.replace(/_macro$/i, '').replace(/^Cluster_/i, 'C');
}

function formatCoord(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}Mm`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}km`;
  return `${Math.round(value)}m`;
}

function scaleMap(map: GalaxyMap) {
  const spanX = Math.max(1, map.bounds.maxX - map.bounds.minX);
  const spanZ = Math.max(1, map.bounds.maxZ - map.bounds.minZ);
  const pad = 50;
  const usableW = VIEW_W - pad * 2;
  const usableH = VIEW_H - pad * 2;
  const scale = Math.min(usableW / spanX, usableH / spanZ);
  const offsetX = (VIEW_W - spanX * scale) / 2;
  const offsetY = (VIEW_H - spanZ * scale) / 2;

  return {
    point(pos: { x: number; z: number }) {
      return {
        x: offsetX + (pos.x - map.bounds.minX) * scale,
        y: offsetY + (map.bounds.maxZ - pos.z) * scale,
      };
    },
  };
}

export default function GalaxyMapView() {
  const [state, setState] = React.useState<LoadState>({ status: 'loading' });
  const [query, setQuery] = React.useState('');
  const [selectedMacro, setSelectedMacro] = React.useState<string | null>(null);
  const [showLabels, setShowLabels] = React.useState(true);

  const load = React.useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const response = await fetch('/api/agent/galaxy-map');
      if (!response.ok) throw new Error(`galaxy-map request failed: ${response.status}`);
      const map = await response.json() as GalaxyMap;
      setState({ status: 'ready', map });
      setSelectedMacro(map.sectors[0]?.macro || map.clusters[0]?.macro || null);
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Galaxy map request failed.' });
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const readyMap = state.status === 'ready' ? state.map : null;
  const scaler = React.useMemo(() => readyMap ? scaleMap(readyMap) : null, [readyMap]);
  const filteredSectors = React.useMemo(() => {
    if (!readyMap) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return readyMap.sectors;
    return readyMap.sectors.filter(sector =>
      sector.macro.toLowerCase().includes(needle) || sector.cluster.toLowerCase().includes(needle)
    );
  }, [query, readyMap]);
  const selectedSector = readyMap?.sectors.find(sector => sector.macro === selectedMacro) || null;
  const selectedCluster = readyMap?.clusters.find(cluster => cluster.macro === selectedMacro || cluster.macro === selectedSector?.cluster) || null;

  const clusterRadius = (cluster: GalaxyCluster): number => Math.max(7, Math.min(18, 7 + cluster.sectors.length * 2));
  const isSectorVisible = (sector: GalaxySector): boolean => filteredSectors.some(item => item.macro === sector.macro);

  return (
    <div data-testid="galaxy-map-view" className="h-full min-h-0 bg-[#0b0d12] text-slate-200 flex flex-col">
      <header className="shrink-0 border-b border-white/10 bg-black/30 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <MapIcon className="w-5 h-5 text-cyan-400 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold font-mono uppercase text-cyan-300">Galaxy Map</h2>
            <p className="text-[11px] font-mono text-slate-500 truncate">Read-only base + extension sector placement from /api/agent/galaxy-map</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowLabels(v => !v)}
            className={`h-8 px-3 rounded border text-[11px] font-mono uppercase ${showLabels ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200' : 'border-white/10 bg-black/30 text-slate-400 hover:text-white'}`}
            title="Toggle cluster and sector labels"
          >
            Labels
          </button>
          <button
            onClick={load}
            className="h-8 px-3 rounded border border-white/10 bg-black/30 text-[11px] font-mono uppercase text-slate-300 hover:text-white hover:border-cyan-500/40"
            title="Reload galaxy map data"
          >
            Reload
          </button>
        </div>
      </header>

      {state.status === 'loading' && (
        <div className="flex-1 flex items-center justify-center text-slate-400 font-mono text-sm">
          <Loader2 className="w-5 h-5 mr-2 animate-spin text-cyan-400" /> Loading galaxy map...
        </div>
      )}

      {state.status === 'error' && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-xl rounded border border-rose-500/30 bg-rose-500/10 p-4 text-rose-100">
            <div className="flex items-center gap-2 font-mono text-sm font-bold uppercase">
              <AlertTriangle className="w-4 h-4" /> Galaxy map unavailable
            </div>
            <p className="mt-2 text-sm text-rose-100/90">{state.message}</p>
          </div>
        </div>
      )}

      {readyMap && scaler && (
        <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_310px]">
          <section className="min-w-0 min-h-0 relative overflow-hidden bg-[#090b10]">
            <div className="absolute left-3 top-3 z-10 flex gap-2">
              <div data-testid="galaxy-map-counts" className="rounded border border-white/10 bg-black/70 px-3 py-2 font-mono text-[11px] text-slate-300">
                <span className="text-cyan-300">{readyMap.counts.clusters}</span> clusters
                <span className="mx-2 text-slate-600">|</span>
                <span className="text-amber-300">{readyMap.counts.sectors}</span> sectors
                <span className="mx-2 text-slate-600">|</span>
                <span className="text-emerald-300">{readyMap.counts.placedClusters}</span> placed
                {readyMap.sources && (
                  <>
                    <span className="mx-2 text-slate-600">|</span>
                    <span className="text-fuchsia-300">{readyMap.sources.extensionFiles}</span> extension files
                  </>
                )}
              </div>
              <div className="rounded border border-white/10 bg-black/70 px-3 py-2 font-mono text-[11px] text-slate-400">
                X {formatCoord(readyMap.bounds.minX)} to {formatCoord(readyMap.bounds.maxX)}
                <span className="mx-2 text-slate-600">|</span>
                Z {formatCoord(readyMap.bounds.minZ)} to {formatCoord(readyMap.bounds.maxZ)}
              </div>
            </div>

            <svg data-testid="galaxy-map-svg" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full h-full block">
              <defs>
                <radialGradient id="sectorGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#0e7490" stopOpacity="0.15" />
                </radialGradient>
              </defs>
              <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="#090b10" />
              {[0, 1, 2, 3, 4].map(i => (
                <g key={i} opacity="0.22">
                  <line x1={i * VIEW_W / 4} y1="0" x2={i * VIEW_W / 4} y2={VIEW_H} stroke="#1f2937" strokeWidth="1" />
                  <line x1="0" y1={i * VIEW_H / 4} x2={VIEW_W} y2={i * VIEW_H / 4} stroke="#1f2937" strokeWidth="1" />
                </g>
              ))}

              {readyMap.clusters.map(cluster => {
                const cp = scaler.point({ x: cluster.pos.x, z: cluster.pos.z });
                return cluster.sectors.filter(isSectorVisible).map(sector => {
                  const sp = scaler.point({ x: sector.pos.x, z: sector.pos.z });
                  return <line key={`${cluster.macro}-${sector.macro}`} x1={cp.x} y1={cp.y} x2={sp.x} y2={sp.y} stroke="#334155" strokeWidth="1" opacity="0.55" />;
                });
              })}

              {readyMap.clusters.map(cluster => {
                const p = scaler.point({ x: cluster.pos.x, z: cluster.pos.z });
                const selected = selectedCluster?.macro === cluster.macro;
                return (
                  <g key={cluster.macro} onClick={() => setSelectedMacro(cluster.macro)} className="cursor-pointer">
                    <circle cx={p.x} cy={p.y} r={clusterRadius(cluster) + (selected ? 5 : 0)} fill={selected ? '#f59e0b' : '#1f2937'} opacity={selected ? '0.45' : '0.8'} />
                    <circle cx={p.x} cy={p.y} r={clusterRadius(cluster)} fill="#111827" stroke={selected ? '#fbbf24' : '#64748b'} strokeWidth={selected ? 3 : 1.5} />
                    {showLabels && (
                      <text x={p.x + 12} y={p.y - 10} fill={selected ? '#fde68a' : '#94a3b8'} fontSize="11" fontFamily="monospace">{shortMacro(cluster.macro)}</text>
                    )}
                  </g>
                );
              })}

              {readyMap.sectors.filter(isSectorVisible).map(sector => {
                const p = scaler.point({ x: sector.pos.x, z: sector.pos.z });
                const selected = selectedMacro === sector.macro;
                return (
                  <g key={sector.macro} onClick={() => setSelectedMacro(sector.macro)} className="cursor-pointer">
                    <circle cx={p.x} cy={p.y} r={selected ? 10 : 6} fill={selected ? '#fbbf24' : 'url(#sectorGlow)'} stroke={selected ? '#fef3c7' : '#22d3ee'} strokeWidth={selected ? 2.5 : 1.5} />
                    {showLabels && (selected || filteredSectors.length <= 40) && (
                      <text x={p.x + 9} y={p.y + 4} fill={selected ? '#fde68a' : '#cbd5e1'} fontSize="10" fontFamily="monospace">{shortMacro(sector.macro)}</text>
                    )}
                  </g>
                );
              })}
            </svg>
          </section>

          <aside className="min-h-0 border-l border-white/10 bg-[#10131a] flex flex-col">
            <div className="p-3 border-b border-white/10 space-y-3">
              <div className="flex items-center gap-2 rounded border border-white/10 bg-black/30 px-2 h-9">
                <Search className="w-4 h-4 text-slate-500 shrink-0" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Filter sectors or clusters"
                  className="min-w-0 flex-1 bg-transparent outline-none text-sm text-slate-200 placeholder:text-slate-600"
                />
              </div>
              <div data-testid="galaxy-map-base-note" className="flex items-start gap-2 rounded border border-amber-500/20 bg-amber-500/10 px-2 py-2 text-[11px] text-amber-100">
                <CheckCircle2 className="w-4 h-4 mt-0.5 text-amber-300 shrink-0" />
                <span>
                  {readyMap.sources
                    ? `Merged ${readyMap.sources.galaxyDiffsApplied} galaxy diff(s) and ${readyMap.sources.clusterMacroFilesApplied} cluster macro file(s). Phase 2 editing remains deferred.`
                    : 'Base universe loaded. Extension merge metadata unavailable.'}
                </span>
              </div>
            </div>

            <div className="p-3 border-b border-white/10">
              <div className="flex items-center gap-2 text-[11px] font-mono uppercase text-slate-400 mb-2">
                <Target className="w-3.5 h-3.5" /> Selection
              </div>
              {selectedSector ? (
                <div data-testid="galaxy-map-selection" className="space-y-1 font-mono text-[12px]">
                  <div className="text-cyan-200">{selectedSector.macro}</div>
                  <div className="text-slate-500">{selectedSector.cluster}</div>
                  <div className="text-slate-300">X {formatCoord(selectedSector.pos.x)} | Y {formatCoord(selectedSector.pos.y)} | Z {formatCoord(selectedSector.pos.z)}</div>
                </div>
              ) : selectedCluster ? (
                <div data-testid="galaxy-map-selection" className="space-y-1 font-mono text-[12px]">
                  <div className="text-amber-200">{selectedCluster.macro}</div>
                  <div className="text-slate-500">{selectedCluster.sectors.length} sector(s)</div>
                  <div className="text-slate-300">X {formatCoord(selectedCluster.pos.x)} | Y {formatCoord(selectedCluster.pos.y)} | Z {formatCoord(selectedCluster.pos.z)}</div>
                </div>
              ) : (
                <div className="text-[12px] text-slate-500">No sector selected.</div>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-auto p-3">
              <div className="flex items-center gap-2 text-[11px] font-mono uppercase text-slate-400 mb-2">
                <Crosshair className="w-3.5 h-3.5" /> Sectors ({filteredSectors.length})
              </div>
              <div className="space-y-1">
                {filteredSectors.map(sector => (
                  <button
                    key={sector.macro}
                    onClick={() => setSelectedMacro(sector.macro)}
                    className={`w-full min-h-9 rounded border px-2 py-1 text-left font-mono text-[11px] transition-colors ${
                      selectedMacro === sector.macro
                        ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-100'
                        : 'border-white/10 bg-black/20 text-slate-300 hover:border-cyan-500/30 hover:text-white'
                    }`}
                  >
                    <div className="truncate">{shortMacro(sector.macro)}</div>
                    <div className="truncate text-[10px] text-slate-500">{shortMacro(sector.cluster)}</div>
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
