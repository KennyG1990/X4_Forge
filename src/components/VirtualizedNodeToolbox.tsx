import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Star } from 'lucide-react';
import {
  buildNodeToolboxEntries,
  parseToolboxPreference,
  type NodeTemplate,
  type NodeToolboxMode,
  type NodeToolboxType,
} from '../lib/nodeToolbox';

const FAVORITES_KEY = 'x4_forge_node_toolbox_favorites';
const RECENTS_KEY = 'x4_forge_node_toolbox_recents';
const ROW_HEIGHT = 60;
const VIEWPORT_HEIGHT = 208;
const OVERSCAN = 2;

interface VirtualizedNodeToolboxProps {
  templates: NodeTemplate[];
  nodeType: NodeToolboxType;
  onAddNode: (template: NodeTemplate) => void;
}

function readPreference(key: string): string[] {
  try { return parseToolboxPreference(localStorage.getItem(key)); } catch { return []; }
}

function persistPreference(key: string, value: string[]) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* preference failure never blocks authoring */ }
}

function badgeColors(type: NodeTemplate['type']): string {
  if (type === 'cue') return 'bg-purple-500/12 text-purple-300 border-purple-500/25';
  if (type === 'event') return 'bg-amber-500/12 text-amber-300 border-amber-500/30';
  if (type === 'condition') return 'bg-sky-500/12 text-sky-300 border-sky-500/25';
  if (type === 'action') return 'bg-emerald-500/12 text-emerald-300 border-emerald-500/25';
  return 'bg-[#3b82f6]/12 text-[#93c5fd] border-[#3b82f6]/30';
}

function shortTypeLabel(type: NodeTemplate['type']): string {
  if (type === 'cue') return 'Cue';
  if (type === 'event') return 'Evnt';
  if (type === 'condition') return 'Cond';
  if (type === 'action') return 'Act';
  return type.slice(0, 1).toUpperCase() + type.slice(1, 4);
}

export default function VirtualizedNodeToolbox({ templates, nodeType, onAddNode }: VirtualizedNodeToolboxProps) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<NodeToolboxMode>('curated');
  const [favorites, setFavorites] = useState<string[]>(() => readPreference(FAVORITES_KEY));
  const [recents, setRecents] = useState<string[]>(() => readPreference(RECENTS_KEY).slice(0, 8));
  const [scrollTop, setScrollTop] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);

  const entries = useMemo(() => buildNodeToolboxEntries({
    templates,
    nodeType,
    query,
    mode,
    favorites,
    recents,
  }), [templates, nodeType, query, mode, favorites, recents]);

  useEffect(() => {
    setScrollTop(0);
    if (viewportRef.current) viewportRef.current.scrollTop = 0;
  }, [nodeType, query, mode]);

  useEffect(() => persistPreference(FAVORITES_KEY, favorites), [favorites]);
  useEffect(() => persistPreference(RECENTS_KEY, recents), [recents]);

  const visibleCount = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT);
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(entries.length, start + visibleCount + OVERSCAN * 2);
  const visible = entries.slice(start, end);

  const addNode = (template: NodeTemplate) => {
    setRecents(current => [template.xmlTag, ...current.filter(tag => tag !== template.xmlTag)].slice(0, 8));
    onAddNode(template);
  };

  const toggleFavorite = (xmlTag: string) => {
    setFavorites(current => current.includes(xmlTag)
      ? current.filter(tag => tag !== xmlTag)
      : [xmlTag, ...current].slice(0, 100));
  };

  return (
    <div className="space-y-2" data-testid="node-toolbox">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-[#687385]" />
        <input
          data-testid="node-toolbox-search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search by intent or XML tag…"
          className="w-full rounded border border-[#262c36] bg-[#0a0c10] py-1.5 pl-8 pr-2.5 text-[11px] text-[#eef2f7] placeholder-[#687385] outline-none focus:border-[#3b82f6]"
        />
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <button
          type="button"
          data-testid="node-toolbox-mode"
          onClick={() => setMode(current => current === 'curated' ? 'all' : 'curated')}
          className="rounded border border-[#3b82f6]/35 bg-[#3b82f6]/12 px-2 py-1 font-medium text-[#93c5fd] hover:bg-[#3b82f6]/20 cursor-pointer"
          title="Curated shows measured common standalone nodes; All keeps the complete schema vocabulary available."
        >
          {mode === 'curated' ? 'Curated · Show all' : 'All · Show curated'}
        </button>
        <span data-testid="node-toolbox-count" className="font-mono text-[#a0aab8]">{entries.length} results</span>
      </div>
      <div
        ref={viewportRef}
        data-testid="node-toolbox-viewport"
        className="relative overflow-y-auto pr-1 custom-scrollbar border-y border-[#262c36]"
        style={{ height: VIEWPORT_HEIGHT }}
        onScroll={event => setScrollTop(event.currentTarget.scrollTop)}
      >
        {entries.length === 0 ? (
          <div data-testid="node-toolbox-empty" className="flex h-full items-center justify-center px-3 text-center text-[11px] text-[#a0aab8]">
            No nodes match this filter. Clear the search or switch to All.
          </div>
        ) : (
          <div style={{ height: entries.length * ROW_HEIGHT, position: 'relative' }}>
            {visible.map((entry, visibleIndex) => {
              const index = start + visibleIndex;
              const template = entry.template;
              return (
                <div
                  key={template.xmlTag}
                  data-testid="node-toolbox-row"
                  data-node-tag={template.xmlTag}
                  className="absolute left-0 right-0 flex items-stretch gap-1 rounded border border-[#262c36] bg-[#11141a] hover:border-[#3b82f6]/50 hover:bg-[#171b23]"
                  style={{ top: index * ROW_HEIGHT + 2, height: ROW_HEIGHT - 4 }}
                >
                  <button
                    type="button"
                    data-testid={`node-toolbox-add-${template.xmlTag}`}
                    onClick={() => addNode(template)}
                    className="min-w-0 flex-1 cursor-pointer px-2 text-left group"
                  >
                    <span className="block truncate text-xs font-semibold leading-snug text-[#eef2f7] group-hover:text-white">{template.label}</span>
                    <span className="mt-1 block truncate text-[11px] font-mono leading-none text-[#687385]">&lt;{template.xmlTag}&gt;</span>
                  </button>
                  <div className="flex shrink-0 items-center gap-1 pr-1.5">
                    <span className={`rounded border px-1.5 py-0.5 text-[11px] font-mono leading-none ${badgeColors(template.type)}`}>
                      {shortTypeLabel(template.type)}
                    </span>
                    <button
                      type="button"
                      data-testid={`node-toolbox-favorite-${template.xmlTag}`}
                      aria-label={`${entry.favorite ? 'Remove' : 'Add'} ${template.label} ${entry.favorite ? 'from' : 'to'} favorites`}
                      aria-pressed={entry.favorite}
                      onClick={() => toggleFavorite(template.xmlTag)}
                      className={`rounded p-1 cursor-pointer ${entry.favorite ? 'text-amber-300' : 'text-[#687385] hover:text-amber-300'}`}
                    >
                      <Star className="h-3.5 w-3.5" fill={entry.favorite ? 'currentColor' : 'none'} />
                    </button>
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

