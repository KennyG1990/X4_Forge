/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';

interface IndexItem {
  id: string;
  name?: string;
  detail?: string;
  sourceFile?: string;
}

interface ObjectIndexPickerProps {
  value: string;
  onChange: (value: string) => void;
  /** Which object-index kind to search (ship/station/ware/faction/sound/job/macro). */
  kind: string;
  placeholder?: string;
  /**
   * Optional prefix to strip from an index id before storing/displaying it. E.g. factions
   * are indexed as `faction.argon` but the MD compiler stores the short code `argon` (it
   * emits `faction.${code}`). With stripPrefix="faction." the picker offers all real
   * factions yet stores the value the compiler expects.
   */
  stripPrefix?: string;
  /** API endpoint to query (default the object index). Must return `{ items: [{id,name}] }`
   *  and accept `?kind=&q=&limit=`. Used to reuse this picker for e.g. patch targets. */
  endpoint?: string;
}

/**
 * Searchable typeahead backed by the LIVE installed-game object index
 * (`/api/agent/object-index`) instead of a small hardcoded list. The user can pick a
 * real id (a wrong reference can't be typed by accident) but free text is still allowed
 * so MD variables like `$ship` / `player.ship` remain valid entries.
 */
export default function ObjectIndexPicker({ value, onChange, kind, placeholder, stripPrefix, endpoint = '/api/agent/object-index' }: ObjectIndexPickerProps) {
  const strip = (id: string) => (stripPrefix && id.startsWith(stripPrefix) ? id.slice(stripPrefix.length) : id);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<IndexItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced search whenever the dropdown is open and the query changes.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${endpoint}?kind=${encodeURIComponent(kind)}&q=${encodeURIComponent(query.trim())}&limit=25`
        );
        const data = await res.json();
        if (!cancelled) setItems(Array.isArray(data.items) ? data.items : []);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, kind, open]);

  // Close on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (id: string) => {
    onChange(id);
    setQuery(id);
    setOpen(false);
  };

  // X4 text-reference names look like "{20203,201}" — not human-readable, so hide them.
  const isTextRef = (s?: string) => !s || /^\{[\d,]+\}$/.test(s);

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search className="w-3 h-3 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={value}
          spellCheck={false}
          onChange={e => { onChange(e.target.value); setQuery(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => { setQuery(value || ''); setOpen(true); }}
          placeholder={placeholder || `Search ${kind}… or type a variable`}
          className="w-full pl-6 pr-2 py-1.5 rounded bg-black/60 border border-white/10 text-white font-mono text-[11px] focus:outline-none focus:border-cyan-500"
        />
        {loading && <Loader2 className="w-3 h-3 text-cyan-400 animate-spin absolute right-2 top-1/2 -translate-y-1/2" />}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded border border-cyan-500/30 bg-[#0b0e14] shadow-2xl scrollbar-thin">
          {!loading && items.length === 0 && (
            <div className="px-2 py-1.5 text-[10px] text-slate-500">
              No matches in the game index. Free text is allowed (e.g. a variable).
            </div>
          )}
          {items.map(it => {
            const stored = strip(it.id);
            return (
              <button
                key={it.id}
                type="button"
                onMouseDown={e => { e.preventDefault(); pick(stored); }}
                className={`w-full text-left px-2 py-1.5 hover:bg-cyan-500/10 border-b border-white/5 last:border-0 ${
                  stored === value ? 'bg-cyan-500/10' : ''
                }`}
              >
                <span className="block font-mono text-[10.5px] text-cyan-300 truncate">{stored}</span>
                {!isTextRef(it.name) && it.name !== it.id && (
                  <span className="block text-[9px] text-slate-500 truncate">{it.name}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
