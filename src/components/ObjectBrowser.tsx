/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  Database, 
  Check, 
  Copy, 
  Compass, 
  Layers, 
  Globe, 
  Volume2, 
  Scroll, 
  FileCode,
  RefreshCw 
} from 'lucide-react';
import { X4_FACTIONS, X4_SHIP_MACROS, X4_STATION_MACROS, X4_SOUND_EFFECTS } from '../types';

interface X4IndexedObject {
  id: string;
  name: string;
  kind: 'ship' | 'station' | 'ware' | 'faction' | 'sound' | 'job' | 'aiscript' | 'md_element' | 'macro';
  sourceFile: string;
  detail?: string;
}

interface X4ObjectIndexResponse {
  generatedAt: string;
  roots: string[];
  scannedFiles: number;
  skippedFiles: number;
  truncated: boolean;
  counts: Record<string, number>;
  items: X4IndexedObject[];
}

export default function ObjectBrowser() {
  const [refSearch, setRefSearch] = useState<string>('');
  const [refType, setRefType] = useState<'ship' | 'station' | 'ware' | 'faction' | 'sound' | 'job' | 'aiscript' | 'md_element' | 'macro'>('ship');
  const [objectIndex, setObjectIndex] = useState<X4ObjectIndexResponse | null>(null);
  const [objectIndexLoading, setObjectIndexLoading] = useState<boolean>(false);
  const [objectIndexError, setObjectIndexError] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const loadObjectIndex = async () => {
    setObjectIndexLoading(true);
    setObjectIndexError('');
    try {
      const params = new URLSearchParams({
        kind: refType,
        q: refSearch,
        limit: '500'
      });
      const response = await fetch(`/api/agent/object-index?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load local X4 object index.');
      }
      setObjectIndex(data);
    } catch (err: any) {
      setObjectIndexError(err.message || 'Failed to load local X4 object index.');
      setObjectIndex(null);
    } finally {
      setObjectIndexLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(loadObjectIndex, 250);
    return () => window.clearTimeout(timer);
  }, [refType, refSearch]);

  const categories = useMemo(() => [
    { value: 'ship', label: 'Ships', count: objectIndex?.counts?.ship ?? X4_SHIP_MACROS.length },
    { value: 'station', label: 'Stations', count: objectIndex?.counts?.station ?? X4_STATION_MACROS.length },
    { value: 'ware', label: 'Wares', count: objectIndex?.counts?.ware ?? 0 },
    { value: 'faction', label: 'Factions', count: objectIndex?.counts?.faction ?? X4_FACTIONS.length },
    { value: 'sound', label: 'Sounds', count: objectIndex?.counts?.sound ?? X4_SOUND_EFFECTS.length },
    { value: 'job', label: 'Jobs', count: objectIndex?.counts?.job ?? 0 },
    { value: 'aiscript', label: 'AI Scripts', count: objectIndex?.counts?.aiscript ?? 0 },
    { value: 'md_element', label: 'MD Elements', count: objectIndex?.counts?.md_element ?? 0 },
  ], [objectIndex]);

  const filteredReferences = useMemo(() => {
    let list: Array<{ id: string; name: string; desc?: string; sourceFile?: string }> = [];

    if (objectIndex?.items?.length) {
      list = objectIndex.items.map(item => ({
        id: item.id,
        name: item.name,
        desc: `${item.kind}${item.detail ? ` - ${item.detail}` : ''}`,
        sourceFile: item.sourceFile
      }));
      return list;
    }

    if (refType === 'faction') {
      list = X4_FACTIONS.map(f => ({ 
        id: `faction.${f}`, 
        name: f.toUpperCase(), 
        desc: "Faction Code Key" 
      }));
    } else if (refType === 'ship') {
      list = X4_SHIP_MACROS.map(s => {
        const parts = s.split(' ');
        const id = parts[0];
        const name = parts.slice(1).join(' ').replace(/[()]/g, '') || s;
        return { 
          id, 
          name, 
          desc: "Ship Component Design Macro" 
        };
      });
    } else if (refType === 'station') {
      list = X4_STATION_MACROS.map(st => {
        const parts = st.split(' ');
        const id = parts[0];
        const name = parts.slice(1).join(' ').replace(/[()]/g, '') || st;
        return { 
          id, 
          name, 
          desc: "Modular Station Layout Macro" 
        };
      });
    } else if (refType === 'sound') {
      list = X4_SOUND_EFFECTS.map(sn => ({ 
        id: `sound.${sn}`, 
        name: sn.replace(/_/g, ' ').toUpperCase(), 
        desc: "Engine Audio Loop Cue" 
      }));
    }

    return list.filter(item => 
      item.id.toLowerCase().includes(refSearch.toLowerCase()) || 
      item.name.toLowerCase().includes(refSearch.toLowerCase()) ||
      (item.desc && item.desc.toLowerCase().includes(refSearch.toLowerCase()))
    );
  }, [refType, refSearch, objectIndex]);

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Category selector */}
      <div className="flex flex-col gap-1.5 bg-[#161a24]/50 p-2.5 rounded-lg border border-white/5 font-mono">
        <label className="text-[9px] uppercase font-black tracking-wider text-slate-400">Index Category</label>
        <select
          value={refType}
          onChange={(e) => { setRefType(e.target.value as any); setRefSearch(''); }}
          className="w-full bg-[#0a0c10] border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
        >
          {categories.map(cat => (
            <option key={cat.value} value={cat.value}>
              {cat.label} ({cat.count})
            </option>
          ))}
        </select>
      </div>

      {/* Filter and metadata */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            value={refSearch}
            onChange={(e) => setRefSearch(e.target.value)}
            placeholder="Search entries..."
            className="w-full bg-[#080a0f] border border-white/10 rounded-lg px-2.5 py-1.5 pl-8 text-xs font-mono text-white focus:outline-none focus:border-amber-500 placeholder-slate-650"
          />
        </div>

        <div className="flex items-center justify-between text-[9px] font-mono text-slate-500 px-1">
          <span>
            {objectIndexLoading ? 'Indexing XML...' : objectIndex ? `Generated ${new Date(objectIndex.generatedAt).toLocaleTimeString()}` : 'Hardcoded fallback active'}
          </span>
          <button
            onClick={loadObjectIndex}
            disabled={objectIndexLoading}
            className="px-2 py-0.5 border border-white/10 rounded text-slate-300 hover:text-white hover:border-amber-500/40 disabled:opacity-50 cursor-pointer flex items-center gap-1 transition-all"
          >
            <RefreshCw className={`w-2.5 h-2.5 ${objectIndexLoading ? 'animate-spin' : ''}`} />
            REFRESH
          </button>
        </div>
      </div>

      {/* Scanned files brief info card */}
      <div className="p-2 border border-[#df9825]/10 bg-amber-500/[0.02] rounded text-[10px] leading-relaxed text-slate-400 font-mono">
        {objectIndex
          ? `Indexed ${objectIndex.scannedFiles} XML files from ${objectIndex.roots.length} root folder.`
          : objectIndexError || 'Scanning workspace for X4 indices...'}
      </div>

      {/* Grid container scrolls list of references */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 -mr-1">
        {filteredReferences.length === 0 ? (
          <div className="py-8 text-center text-slate-500 italic text-xs font-mono bg-black/10 rounded-lg border border-white/[0.02]">
            No objects fit this filter.
          </div>
        ) : (
          <div className="space-y-2 max-h-[calc(100vh-290px)] overflow-y-auto pr-1">
            {filteredReferences.map(ref => (
              <div 
                key={ref.id}
                className="bg-[#121622] border border-white/[0.03] rounded-lg p-2.5 hover:border-amber-500/20 hover:bg-[#141a28] flex items-center justify-between group transition-all"
              >
                <div className="flex flex-col gap-0.5 pr-2 overflow-hidden min-w-0">
                  <span className="font-bold text-white text-xs font-mono truncate cursor-text selection:bg-amber-500/30" title={ref.name}>
                    {ref.name}
                  </span>
                  <span className="text-[10px] text-amber-500 font-mono select-all truncate shrink-0" title={ref.id}>
                    {ref.id}
                  </span>
                  {ref.desc && (
                    <span className="text-[9px] text-slate-500 font-sans truncate tracking-wider font-semibold uppercase leading-none mt-0.5">
                      {ref.desc}
                    </span>
                  )}
                  {ref.sourceFile && (
                    <span className="text-[8px] text-slate-600 font-mono truncate" title={ref.sourceFile}>
                      {ref.sourceFile}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyCode(ref.id, ref.id)}
                  className="p-1.5 rounded bg-white/[0.02] border border-white/5 group-hover:border-amber-500/30 group-hover:text-amber-400 hover:bg-amber-500/10 transition-all cursor-pointer shrink-0"
                  title="Copy reference string to Clipboard"
                >
                  {copiedId === ref.id ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-400" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
