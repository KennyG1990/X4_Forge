/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';

// Module-level cache so switching panels doesn't refetch the same index query
// (the index itself is SQLite-cached server-side; this kills the UI round-trip).
const OBJECT_INDEX_CACHE = new Map<string, any>();
import {
  Search,
  Check,
  Copy,
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
  const [refType, setRefType] = useState<'ship' | 'station' | 'ware' | 'faction' | 'sound' | 'job' | 'aiscript' | 'md_element' | 'macro' | 'override_order'>('ship');
  const [objectIndex, setObjectIndex] = useState<X4ObjectIndexResponse | null>(null);
  const [overrideOrderItems, setOverrideOrderItems] = useState<Array<{ scriptKind: string; scriptId: string; source: string; path: string; line: number; orderId: string; targetObject: string | null; immediate: boolean; override: string }>>([]);
  const [overrideOrderTotal, setOverrideOrderTotal] = useState<number>(0);
  const [objectIndexLoading, setObjectIndexLoading] = useState<boolean>(false);
  const [objectIndexError, setObjectIndexError] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const loadObjectIndex = async () => {
    if (refType === 'override_order') {
      setObjectIndexLoading(true);
      setObjectIndexError('');
      try {
        const params = new URLSearchParams();
        if (refSearch.trim()) params.set('q', refSearch.trim());
        const response = await fetch(`/api/agent/reference/override-orders?${params.toString()}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load canonical X4 override-order issuers.');
        }
        setOverrideOrderItems(Array.isArray(data.items) ? data.items : []);
        setOverrideOrderTotal(typeof data.total === 'number' ? data.total : 0);
      } catch (err: any) {
        setObjectIndexError(err?.message || 'Failed to load canonical X4 override-order issuers.');
        setOverrideOrderItems([]);
      } finally {
        setObjectIndexLoading(false);
      }
      return;
    }

    // QoL panel cache: serve the last result for this query instantly (no
    // spinner flash on remount), then refresh in the background.
    const cacheKey = refType + '|' + refSearch;
    const cached = OBJECT_INDEX_CACHE.get(cacheKey);
    if (cached) {
      setObjectIndex(cached);
      setObjectIndexLoading(false);
    } else {
      setObjectIndexLoading(true);
    }
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
      OBJECT_INDEX_CACHE.set(refType + '|' + refSearch, data);
      if (OBJECT_INDEX_CACHE.size > 40) {
        OBJECT_INDEX_CACHE.delete(OBJECT_INDEX_CACHE.keys().next().value as string);
      }
    } catch (err) {
      setObjectIndexError(err.message || 'Failed to load local X4 object index.');
      setObjectIndex(null);
    } finally {
      setObjectIndexLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(loadObjectIndex, 250);
    return () => window.clearTimeout(timer);
    // reason: loadObjectIndex is a non-memoized component-body function; the debounced load should re-fire only when the query inputs (refType/refSearch) change, not every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    { value: 'override_order', label: 'Override Orders (FF-28)', count: overrideOrderTotal },
  ], [objectIndex, overrideOrderTotal]);

  const filteredReferences = useMemo(() => {
    let list: Array<{ id: string; name: string; desc?: string; sourceFile?: string }> = [];

    if (refType === 'override_order') {
      return overrideOrderItems.map(item => ({
        id: `${item.path}:${item.line}`,
        name: `${item.orderId} (${item.scriptKind}: ${item.scriptId})`,
        desc: `override=${item.override}${item.immediate ? ' · immediate' : ''}${item.targetObject ? ` · object=${item.targetObject}` : ''} · ${item.source}`,
        sourceFile: `${item.path}:${item.line}`,
      }));
    }

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
  }, [refType, refSearch, objectIndex, overrideOrderItems]);

  return (
    <div data-testid="object-browser" className="flex flex-col h-full p-3 space-y-3 bg-[#0c0e12] text-[#eef2f7]">
      {/* Category selector */}
      <div className="flex flex-col gap-1.5 bg-[#11141a] p-2.5 rounded-lg border border-[#262c36]">
        <label className="text-[11px] font-medium text-[#a0aab8]">Index Category</label>
        <select
          value={refType}
          onChange={(e) => { setRefType(e.target.value as any); setRefSearch(''); }}
          className="w-full bg-[#0a0c10] border border-[#262c36] rounded px-2.5 py-1.5 text-xs text-[#eef2f7] focus:outline-none focus:border-[#3b82f6] font-mono"
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
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-[#687385]" />
          <input
            type="text"
            value={refSearch}
            onChange={(e) => setRefSearch(e.target.value)}
            placeholder="Search entries..."
            className="w-full bg-[#0a0c10] border border-[#262c36] rounded-lg px-2.5 py-1.5 pl-8 text-xs font-mono text-[#eef2f7] placeholder-[#687385] focus:outline-none focus:border-[#3b82f6]"
          />
        </div>

        <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-[#a0aab8] px-0.5">
          <span className="truncate">
            {objectIndexLoading ? 'Indexing XML...' : objectIndex ? `Generated ${new Date(objectIndex.generatedAt).toLocaleTimeString()}` : 'Hardcoded fallback active'}
          </span>
          <button
            onClick={loadObjectIndex}
            disabled={objectIndexLoading}
            className="shrink-0 px-2 py-0.5 bg-[#11141a] border border-[#262c36] rounded text-[#cbd5e1] hover:text-[#eef2f7] hover:border-[#3b82f6]/50 disabled:opacity-50 cursor-pointer flex items-center gap-1 transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${objectIndexLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Scanned files brief info card */}
      <div className="p-2.5 border border-[#262c36] bg-[#11141a] rounded text-[11px] leading-relaxed text-[#a0aab8] font-mono">
        {objectIndex
          ? `Indexed ${objectIndex.scannedFiles} XML files from ${objectIndex.roots.length} root folder.`
          : objectIndexError || 'Scanning workspace for X4 indices...'}
      </div>

      {/* Grid container scrolls list of references */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 -mr-1 min-h-0">
        {filteredReferences.length === 0 ? (
          <div className="py-8 text-center text-[#687385] italic text-xs font-mono bg-[#11141a] rounded-lg border border-[#262c36]">
            No objects fit this filter.
          </div>
        ) : (
          <div className="space-y-2 max-h-[calc(100vh-290px)] overflow-y-auto pr-1">
            {filteredReferences.map(ref => (
              <div 
                key={ref.id}
                className="bg-[#11141a] border border-[#262c36] rounded-lg p-2.5 hover:border-[#3b82f6]/50 hover:bg-[#171b23] flex items-center justify-between group transition-colors"
              >
                <div className="flex flex-col gap-0.5 pr-2 overflow-hidden min-w-0">
                  <span className="font-semibold text-[#eef2f7] text-xs font-mono truncate cursor-text selection:bg-[#3b82f6]/30" title={ref.name}>
                    {ref.name}
                  </span>
                  <span className="text-[11px] text-[#93c5fd] font-mono select-all truncate shrink-0" title={ref.id}>
                    {ref.id}
                  </span>
                  {ref.desc && (
                    <span className="text-[11px] text-[#a0aab8] font-sans truncate leading-snug mt-0.5">
                      {ref.desc}
                    </span>
                  )}
                  {ref.sourceFile && (
                    <span className="text-[11px] text-[#687385] font-mono truncate" title={ref.sourceFile}>
                      {ref.sourceFile}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyCode(ref.id, ref.id)}
                  className="p-1.5 rounded bg-[#0a0c10] border border-[#262c36] group-hover:border-[#3b82f6]/40 group-hover:text-[#93c5fd] hover:bg-[#3b82f6]/15 transition-colors cursor-pointer shrink-0"
                  title="Copy reference string to Clipboard"
                >
                  {copiedId === ref.id ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-[#a0aab8] group-hover:text-[#93c5fd]" />
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
