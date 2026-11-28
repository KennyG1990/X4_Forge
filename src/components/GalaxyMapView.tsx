/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * #64 Phase 1 UI: read-only galaxy/sector map bound to the active X4 corpus + extensions.
 * This is a viewer for already-authored game data, not the deferred sector editor.
 */

import React from 'react';
import { AlertTriangle, CheckCircle2, Crosshair, Loader2, Map as MapIcon, RefreshCw, Search, Tag, Target } from 'lucide-react';
import type { GalaxyCluster, GalaxyMap, GalaxySector } from '../lib/galaxyMap';
import { PanelHeader } from './ui';

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
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || `Galaxy map request failed (${response.status}).`);
      }
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
      sector.macro.toLowerCase().includes(needle) || sector.cluster.toLowerCase().includes(needle),
    );
  }, [query, readyMap]);
  const selectedSector = readyMap?.sectors.find(sector => sector.macro === selectedMacro) || null;
  const selectedCluster = readyMap?.clusters.find(cluster => cluster.macro === selectedMacro || cluster.macro === selectedSector?.cluster) || null;

  const clusterRadius = (cluster: GalaxyCluster): number => Math.max(7, Math.min(18, 7 + cluster.sectors.length * 2));
  const isSectorVisible = (sector: GalaxySector): boolean => filteredSectors.some(item => item.macro === sector.macro);

  return (
    <div data-testid="galaxy-map-view" className="h-full min-h-0 bg-[#0c0e12] text-[#eef2f7] flex flex-col">
      <PanelHeader
        title="Galaxy Map"
        subtitle="Read-only base and extension sector placement from the active X4 corpus"
        icon={<MapIcon className="w-4 h-4 text-[#93c5fd]" />}
        actions={
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowLabels(v => !v)}
              className={`h-7 px-2.5 rounded-md border inline-flex items-center gap-1.5 text-[11px] font-medium transition-colors cursor-pointer ${
                showLabels
                  ? 'border-[#3b82f6]/50 bg-[#3b82f6]/15 text-[#93c5fd]'
                  : 'border-[#262c36] bg-[#0a0c10] text-[#a0aab8] hover:text-[#eef2f7]'
              }`}
              title="Toggle cluster and sector labels"
            >
              <Tag className="w-3 h-3" />
              <span>Labels</span>
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="h-7 px-2.5 rounded-md border border-[#262c36] bg-[#0a0c10] text-[11px] font-medium text-[#cbd5e1] hover:text-[#eef2f7] hover:border-[#3b82f6]/45 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Reload galaxy map data"
            >
              <RefreshCw className={`w-3 h-3 ${state.status === 'loading' ? 'animate-spin' : ''}`} />
              <span>Reload</span>
            </button>
          </div>
        }
      />

      {state.status === 'loading' && (
        <div className="flex-1 flex items-center justify-center text-[#a0aab8] text-xs">
          <Loader2 className="w-4 h-4 mr-2 animate-spin text-[#93c5fd]" />
          <span>Loading galaxy map…</span>
        </div>
      )}

      {state.status === 'error' && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-xl rounded-lg border border-rose-500/35 bg-rose-500/10 p-4 text-rose-100 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>Galaxy map unavailable</span>
            </div>
            <p className="text-xs text-rose-200/90 leading-relaxed">{state.message}</p>
          </div>
        </div>
      )}

      {readyMap && scaler && (
        <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_310px]">
          <section className="min-w-0 min-h-0 relative overflow-hidden bg-[#0a0c10]">
            <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-2">
              <div data-testid="galaxy-map-counts" className="rounded-md border border-[#262c36] bg-[#11141a]/90 px-3 py-1.5 font-mono text-[11px] text-[#cbd5e1]">
                <span className="text-[#93c5fd]">{readyMap.counts.clusters}</span> clusters
                <span className="mx-2 text-[#687385]">|</span>
                <span className="text-amber-300">{readyMap.counts.sectors}</span> sectors
                <span className="mx-2 text-[#687385]">|</span>
                <span className="text-emerald-300">{readyMap.counts.placedClusters}</span> placed
                {readyMap.sources && (
                  <>
                    <span className="mx-2 text-[#687385]">|</span>
                    <span className="text-violet-300">{readyMap.sources.extensionFiles}</span> extension files
                  </>
                )}
              </div>
              <div className="rounded-md border border-[#262c36] bg-[#11141a]/90 px-3 py-1.5 font-mono text-[11px] text-[#a0aab8]">
                X {formatCoord(readyMap.bounds.minX)} to {formatCoord(readyMap.bounds.maxX)}
                <span className="mx-2 text-[#687385]">|</span>
                Z {formatCoord(readyMap.bounds.minZ)} to {formatCoord(readyMap.bounds.maxZ)}
              </div>
            </div>

            <svg data-testid="galaxy-map-svg" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full h-full block">
              <defs>
                <radialGradient id="sectorGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.2" />
                </radialGradient>
              </defs>
              <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="#0a0c10" />
              {[0, 1, 2, 3, 4].map(i => (
                <g key={i} opacity="0.24">
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
                    <circle cx={p.x} cy={p.y} r={clusterRadius(cluster)} fill="#11141a" stroke={selected ? '#fbbf24' : '#64748b'} strokeWidth={selected ? 3 : 1.5} />
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
                    <circle cx={p.x} cy={p.y} r={selected ? 10 : 6} fill={selected ? '#fbbf24' : 'url(#sectorGlow)'} stroke={selected ? '#fef3c7' : '#3b82f6'} strokeWidth={selected ? 2.5 : 1.5} />
                    {showLabels && (selected || filteredSectors.length <= 40) && (
                      <text x={p.x + 9} y={p.y + 4} fill={selected ? '#fde68a' : '#cbd5e1'} fontSize="10" fontFamily="monospace">{shortMacro(sector.macro)}</text>
                    )}
                  </g>
                );
              })}
            </svg>
          </section>

          <aside className="min-h-0 border-l border-[#262c36] bg-[#11141a] flex flex-col">
            <div className="p-3 border-b border-[#262c36] space-y-2.5">
              <div className="flex items-center gap-2 rounded-md border border-[#262c36] bg-[#0a0c10] px-2.5 h-8 focus-within:border-[#3b82f6]">
                <Search className="w-3.5 h-3.5 text-[#687385] shrink-0" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Filter sectors or clusters"
                  className="min-w-0 flex-1 bg-transparent outline-none text-xs text-[#eef2f7] placeholder:text-[#687385]"
                />
              </div>
              <div data-testid="galaxy-map-base-note" className="flex items-start gap-2 rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-100 leading-relaxed">
                <CheckCircle2 className="w-4 h-4 mt-0.5 text-amber-300 shrink-0" />
                <span>
                  {readyMap.sources
                    ? `Merged ${readyMap.sources.galaxyDiffsApplied} galaxy diff(s) and ${readyMap.sources.clusterMacroFilesApplied} cluster macro file(s). Editing remains read-only here.`
                    : 'Base universe loaded. Extension merge metadata unavailable.'}
                </span>
              </div>
            </div>

            <div className="p-3 border-b border-[#262c36]">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#eef2f7] mb-2">
                <Target className="w-3.5 h-3.5 text-[#93c5fd]" />
                <span>Selection</span>
              </div>
              {selectedSector ? (
                <div data-testid="galaxy-map-selection" className="space-y-1 font-mono text-xs">
                  <div className="text-[#93c5fd] break-all">{selectedSector.macro}</div>
                  <div className="text-[#687385] break-all">{selectedSector.cluster}</div>
                  <div className="text-[#cbd5e1]">X {formatCoord(selectedSector.pos.x)} | Y {formatCoord(selectedSector.pos.y)} | Z {formatCoord(selectedSector.pos.z)}</div>
                </div>
              ) : selectedCluster ? (
                <div data-testid="galaxy-map-selection" className="space-y-1 font-mono text-xs">
                  <div className="text-amber-300 break-all">{selectedCluster.macro}</div>
                  <div className="text-[#687385]">{selectedCluster.sectors.length} sector(s)</div>
                  <div className="text-[#cbd5e1]">X {formatCoord(selectedCluster.pos.x)} | Y {formatCoord(selectedCluster.pos.y)} | Z {formatCoord(selectedCluster.pos.z)}</div>
                </div>
              ) : (
                <div className="text-xs text-[#687385]">No sector selected.</div>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-auto p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#eef2f7] mb-2">
                <Crosshair className="w-3.5 h-3.5 text-[#93c5fd]" />
                <span>Sectors ({filteredSectors.length})</span>
              </div>
              <div className="space-y-1">
                {filteredSectors.map(sector => (
                  <button
                    key={sector.macro}
                    type="button"
                    onClick={() => setSelectedMacro(sector.macro)}
                    className={`w-full min-h-9 rounded-md border px-2.5 py-1.5 text-left font-mono text-[11px] transition-colors cursor-pointer ${
                      selectedMacro === sector.macro
                        ? 'border-[#3b82f6]/55 bg-[#3b82f6]/15 text-[#eef2f7]'
                        : 'border-[#262c36] bg-[#0a0c10] text-[#cbd5e1] hover:border-[#3b82f6]/40 hover:text-[#eef2f7]'
                    }`}
                  >
                    <div className="truncate">{shortMacro(sector.macro)}</div>
                    <div className="truncate text-[11px] text-[#687385]">{shortMacro(sector.cluster)}</div>
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
