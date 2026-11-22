/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { 
  Search, 
  X, 
  GitFork, 
  Layout, 
  FileCode,
  CornerDownLeft,
  ArrowRight
} from 'lucide-react';
import { ModWorkspace, MDNode, UIWidget } from '../types';

interface GlobalSearchProps {
  workspace: ModWorkspace;
  modalOpen: boolean;
  workspaceView: 'blueprint' | 'ui-designer' | 'aiscripts' | 'libraries' | 'xmlpatch' | 'contracts' | 'translation' | 'wiki' | 'project' | 'galaxy';
  setWorkspaceView: (view: 'blueprint' | 'ui-designer' | 'aiscripts' | 'libraries' | 'xmlpatch' | 'contracts' | 'translation' | 'wiki' | 'project' | 'galaxy') => void;
  setActiveSidebarTab: (tab: 'script' | 'ui' | 'config' | 'filesystem') => void;
  setSelectedNode: (node: MDNode | null) => void;
  setSelectedWidget: (widget: UIWidget | null) => void;
}

const DEFAULT_PATCHES: any[] = [
  {
    id: 'patch_1',
    sel: '/macros/macro[@name="ship_arg_s_fighter_01_a_macro"]/properties/cargo',
    action: 'replace',
    content: '<cargo size="450" />',
    note: 'Double Fighter cargo hold capacity for mining loops'
  },
  {
    id: 'patch_2',
    sel: '/macros/macro[@name="ship_arg_s_fighter_01_a_macro"]/properties/shield',
    action: 'add',
    content: '<rebuild rate="15" delay="2s" />',
    note: 'Add super-shield auxiliary regeneration layers'
  }
];

export default function GlobalSearch({
  workspace,
  modalOpen,
  workspaceView: _workspaceView,
  setWorkspaceView,
  setActiveSidebarTab,
  setSelectedNode,
  setSelectedWidget
}: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const searchId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const openSearch = useCallback(() => {
    setIsOpen(true);
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    // On compact layouts the input cannot receive focus until the panel is visible.
    if (isOpen) inputRef.current?.focus({ preventScroll: true });
  }, [isOpen]);

  // Global browser keyboard shortcuts: Ctrl+K or / to focus search input
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (modalOpen || e.defaultPrevented || e.isComposing || e.altKey) return;
      const command = (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'k';
      const slash = e.key === '/' && !e.ctrlKey && !e.metaKey &&
        !(e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'));
      if ((!command && !slash) || document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]')) return;
      e.preventDefault();
      openSearch();
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [modalOpen, openSearch]);

  useEffect(() => {
    if (!isOpen) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', dismissOutside);
    return () => document.removeEventListener('pointerdown', dismissOutside);
  }, [isOpen]);

  // Compile XML patches list including defaults
  const xmlPatches = useMemo(() => {
    return workspace.xmlPatches && workspace.xmlPatches.length > 0 
      ? workspace.xmlPatches 
      : DEFAULT_PATCHES;
  }, [workspace.xmlPatches]);

  // Combined search results
  const results = useMemo(() => {
    if (!query.trim()) return [];

    const lcQuery = query.toLowerCase();
    const matches: Array<{
      id: string;
      category: 'node' | 'widget' | 'patch';
      title: string;
      subtitle: string;
      meta?: string;
      originalData: any;
    }> = [];

    // Filter Canvas Nodes
    if (workspace.nodes) {
      workspace.nodes.forEach(node => {
        const matchesLabel = node.label?.toLowerCase().includes(lcQuery);
        const matchesTag = node.xmlTag?.toLowerCase().includes(lcQuery);
        const matchesType = node.type?.toLowerCase().includes(lcQuery);
        const matchesComment = node.comment?.toLowerCase().includes(lcQuery);

        if (matchesLabel || matchesTag || matchesType || matchesComment) {
          matches.push({
            id: `node_${node.id}`,
            category: 'node',
            title: node.label || `<${node.xmlTag}>`,
            subtitle: `${node.type.toUpperCase()}: <${node.xmlTag}>`,
            meta: node.comment || undefined,
            originalData: node
          });
        }
      });
    }

    // Filter UI Widgets
    if (workspace.uiWidgets) {
      workspace.uiWidgets.forEach(widget => {
        const matchesLabel = widget.label?.toLowerCase().includes(lcQuery);
        const matchesType = widget.type?.toLowerCase().includes(lcQuery);

        if (matchesLabel || matchesType) {
          matches.push({
            id: `widget_${widget.id}`,
            category: 'widget',
            title: widget.label || `HUD ${widget.type.toUpperCase()}`,
            subtitle: `HUD WIDGET [${widget.type.toUpperCase()}]`,
            meta: `x: ${widget.x}, y: ${widget.y}, w: ${widget.w}px, h: ${widget.h}px`,
            originalData: widget
          });
        }
      });
    }

    // Filter XML Patch blocks
    xmlPatches.forEach(patch => {
      const matchesNote = patch.note?.toLowerCase().includes(lcQuery);
      const matchesSel = patch.sel?.toLowerCase().includes(lcQuery);
      const matchesContent = patch.content?.toLowerCase().includes(lcQuery);
      const matchesTarget = patch.targetFile?.toLowerCase().includes(lcQuery);

      if (matchesNote || matchesSel || matchesContent || matchesTarget) {
        matches.push({
          id: `patch_${patch.id}`,
          category: 'patch',
          title: patch.note || 'XML Patch Block',
          subtitle: `ACTION: ${patch.action.toUpperCase()} ${patch.targetFile ? `(${patch.targetFile})` : ''}`,
          meta: patch.sel,
          originalData: patch
        });
      }
    });

    return matches;
  }, [query, workspace.nodes, workspace.uiWidgets, xmlPatches]);

  // Reset selected index when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelectResult = (item: typeof results[0]) => {
    setIsOpen(false);
    setQuery('');
    launcherRef.current?.focus({ preventScroll: true });

    if (item.category === 'node') {
      const node = item.originalData as MDNode;
      setSelectedNode(node);
      setWorkspaceView('blueprint');
      setActiveSidebarTab('script');
    } else if (item.category === 'widget') {
      const widget = item.originalData as UIWidget;
      setSelectedWidget(widget);
      setWorkspaceView('ui-designer');
      setActiveSidebarTab('ui');
    } else if (item.category === 'patch') {
      setWorkspaceView('xmlpatch');
      setActiveSidebarTab('config');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const direction = e.key === 'ArrowDown' ? 1 : -1;
      setSelectedIndex(prev => (prev + direction + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        handleSelectResult(results[selectedIndex]);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-8 shrink-0 select-none lg:w-52 min-[2150px]:w-80"
      onBlur={event => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
      }}
      onKeyDown={event => {
        if (event.key !== 'Escape' || !isOpen) return;
        event.preventDefault();
        setIsOpen(false);
        launcherRef.current?.focus({ preventScroll: true });
        inputRef.current?.blur();
      }}
    >
      <button
        ref={launcherRef}
        type="button"
        aria-label="Search workspace"
        aria-expanded={isOpen}
        aria-controls={searchId}
        aria-keyshortcuts="Control+K Meta+K /"
        title="Search workspace (Ctrl+K, Cmd+K, or /)"
        onClick={() => isOpen ? setIsOpen(false) : openSearch()}
        className="flex h-8 w-8 items-center justify-center rounded border border-white/10 bg-black/40 text-slate-300 hover:border-cyan-500/40 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-400 lg:hidden"
      >
        <Search aria-hidden="true" className="h-4 w-4" />
      </button>
      <div
        id={searchId}
        data-testid="workspace-search-panel"
        className={`fixed left-2 top-12 z-50 w-[min(380px,calc(100vw-1rem))] lg:static lg:block lg:w-full ${isOpen ? 'block' : 'hidden'}`}
      >
        {/* Search Input Box */}
        <div className="relative flex items-center h-8 bg-[#0a0c10] lg:bg-[#0a0c10]/80 border border-white/10 hover:border-cyan-500/40 focus-within:border-cyan-500 rounded-lg px-2.5 transition-all">
          <Search className="w-3.5 h-3.5 text-slate-500 pr-0.5 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            aria-label="Search workspace"
            placeholder="Search workspace…"
            className="min-w-0 flex-1 bg-transparent border-none text-[11px] font-mono text-white placeholder-slate-500 focus:outline-none pl-1"
          />

          {/* Helper badge or cancel icon */}
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          ) : (
            <div className="hidden sm:flex items-center gap-1 opacity-40 select-none font-mono text-[9px] bg-white/5 border border-white/15 px-1 py-0.5 rounded text-slate-400">
              <span className="text-[10px]">⌘</span>K
            </div>
          )}
        </div>

        {/* dropdown filtered dropdown panel details  */}
        {isOpen && query.trim() && (
          <div className="mt-1.5 w-full lg:absolute lg:left-0 lg:w-[380px] bg-[#0c0f16] border border-cyan-500/25 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.8),0_0_15px_rgba(6,182,212,0.15)] rounded-xl overflow-hidden font-mono z-50 animate-in fade-in slide-in-from-top-1 duration-100">

            <div className="p-2 border-b border-white/5 bg-[#0f131d]/60 flex items-center justify-between">
              <span className="text-[9px] text-cyan-400/80 font-black tracking-widest uppercase">Matched Search Targets ({results.length})</span>
              <span className="text-[8px] text-slate-500">Navigate: ↑↓ Enter</span>
            </div>

            <div className="max-h-[min(20rem,calc(100dvh-9rem))] overflow-y-auto custom-scrollbar p-1.5 space-y-1.5">
              {results.length === 0 ? (
                <div className="p-8 text-center text-slate-500 italic text-[11px] font-mono leading-normal">
                  No nodes, UI widgets or XML patches match.
                </div>
              ) : (
                results.map((item, index) => {
                  const isSelected = index === selectedIndex;
                  return (
                    <div
                      key={item.id}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => handleSelectResult(item)}
                      className={`p-2 rounded-lg border flex items-start gap-2.5 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-cyan-500/10 border-cyan-500/40 text-white'
                          : 'bg-[#10141f]/40 border-transparent text-slate-300 hover:border-white/5 hover:bg-[#121825]/45'
                      }`}
                    >
                      {/* Category specific dynamic icon representation */}
                      <div className={`p-1.5 rounded shrink-0 ${
                        item.category === 'node'
                          ? 'bg-blue-500/10 text-blue-400'
                          : item.category === 'widget'
                          ? 'bg-yellow-500/10 text-yellow-400'
                          : 'bg-emerald-500/10 text-emerald-400'
                      }`}>
                        {item.category === 'node' ? (
                          <GitFork className="w-3.5 h-3.5" />
                        ) : item.category === 'widget' ? (
                          <Layout className="w-3.5 h-3.5" />
                        ) : (
                          <FileCode className="w-3.5 h-3.5" />
                        )}
                      </div>

                      {/* text content and sub headers */}
                      <div className="flex-1 min-w-0 pr-1 flex flex-col gap-0.5">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="font-bold text-[11px] truncate">{item.title}</span>
                          <span className={`text-[8px] px-1.5 py-0.5 font-bold rounded uppercase select-none tracking-wider shrink-0 ${
                            item.category === 'node'
                              ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                              : item.category === 'widget'
                              ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20'
                              : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                          }`}>
                            {item.category === 'node' ? 'Node' : item.category === 'widget' ? 'Widget' : 'Patch'}
                          </span>
                        </div>

                        <span className="text-[9px] text-slate-400 font-bold truncate tracking-tight">{item.subtitle}</span>

                        {item.meta && (
                          <span className="text-[8px] text-slate-500 select-all truncate bg-black/20 p-0.5 px-1.5 rounded mt-0.5 font-mono max-w-full">
                            {item.meta}
                          </span>
                        )}
                      </div>

                      {/* Go visual indicator */}
                      {isSelected && (
                        <div className="self-center text-cyan-400 shrink-0 select-none animate-pulse pr-1">
                          <ArrowRight className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {results.length > 0 && (
              <div className="p-2 border-t border-white/5 bg-[#0a0d14] flex items-center justify-between text-[8px] text-slate-500">
                <span>Supports XML and layout matching</span>
                <div className="flex items-center gap-1 select-none">
                  <CornerDownLeft className="w-2.5 h-2.5" />
                  <span>Select & Navigate</span>
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
