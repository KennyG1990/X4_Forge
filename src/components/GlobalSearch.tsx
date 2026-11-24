/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unified Omni-Search & Command Palette (Unit 39 — IDE Workbench).
 * - Unprefixed queries (Ctrl+K or /): searches all 8 Mod Entity families in the active
 *   workspace (MD Nodes, UI Widgets, XML Patches, AI Scripts, Wares, Jobs, Translations,
 *   Integration Contract endpoints, and Project Source Files) + secondary View/Wiki jumps.
 * - '>' prefix (or Ctrl+Shift+P): full Workbench Command Palette across all Workspace Views,
 *   Sidebar Tools, and Global Actions.
 */

import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  X,
  GitFork,
  Layout,
  FileCode,
  CornerDownLeft,
  ArrowRight,
  Terminal,
  Scroll,
  Package,
  Globe,
  Plug,
  BookOpen,
  Command,
} from 'lucide-react';
import { ModWorkspace, MDNode, UIWidget } from '../types';
import type { WorkspaceView } from '../lib/experienceMode';
import { SIDEBAR_NAV_ITEMS, WORKSPACE_NAV_ITEMS, type SidebarTab } from '../lib/studioLayout';
import { WIKI_TOPICS } from '../lib/forgeKnowledge';

interface GlobalSearchProps {
  workspace: ModWorkspace;
  modalOpen: boolean;
  workspaceView: WorkspaceView;
  setWorkspaceView: (view: WorkspaceView) => void;
  setActiveSidebarTab: (tab: SidebarTab) => void;
  setSelectedNode: (node: MDNode | null) => void;
  setSelectedWidget: (widget: UIWidget | null) => void;
  setFocusNodeRequest?: (req: { nodeId: string; timestamp: number } | null) => void;
  onRunGlobalCommand?: (commandId: string) => void;
}

type EntityCategory = 'node' | 'widget' | 'patch' | 'aiscript' | 'ware' | 'job' | 'translation' | 'contract' | 'file';

interface SearchResultItem {
  id: string;
  category: EntityCategory | 'command' | 'wiki';
  title: string;
  subtitle: string;
  meta?: string;
  originalData?: unknown;
}

const DEFAULT_PATCHES: Array<{ id: string; sel: string; action: string; content: string; note: string; targetFile?: string }> = [
  {
    id: 'patch_1',
    sel: '/macros/macro[@name="ship_arg_s_fighter_01_a_macro"]/properties/cargo',
    action: 'replace',
    content: '<cargo size="450" />',
    note: 'Double Fighter cargo hold capacity for mining loops',
  },
  {
    id: 'patch_2',
    sel: '/macros/macro[@name="ship_arg_s_fighter_01_a_macro"]/properties/shield',
    action: 'add',
    content: '<rebuild rate="15" delay="2s" />',
    note: 'Add super-shield auxiliary regeneration layers',
  },
];

export default function GlobalSearch({
  workspace,
  modalOpen,
  workspaceView: _workspaceView,
  setWorkspaceView,
  setActiveSidebarTab,
  setSelectedNode,
  setSelectedWidget,
  setFocusNodeRequest,
  onRunGlobalCommand,
}: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const searchId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const openSearch = useCallback((initialPrefix?: string) => {
    setIsOpen(true);
    if (initialPrefix !== undefined) setQuery(initialPrefix);
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    if (isOpen) inputRef.current?.focus({ preventScroll: true });
  }, [isOpen]);

  // Global browser keyboard shortcuts: Ctrl+K or / for Omni-Search; Ctrl+Shift+P for Command Palette (>)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (modalOpen || e.defaultPrevented || e.isComposing || e.altKey) return;
      const commandK = (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'k';
      const commandPalette = (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p';
      const slash = e.key === '/' && !e.ctrlKey && !e.metaKey &&
        !(e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'));
      if ((!commandK && !commandPalette && !slash) || document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]')) return;
      e.preventDefault();
      if (commandPalette) openSearch('>');
      else openSearch();
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

  const xmlPatches = useMemo(() => {
    return workspace.xmlPatches && workspace.xmlPatches.length > 0
      ? workspace.xmlPatches
      : DEFAULT_PATCHES;
  }, [workspace.xmlPatches]);

  const workbenchCommands = useMemo<SearchResultItem[]>(() => {
    const cmds: SearchResultItem[] = [
      { id: 'cmd_deploy', category: 'command', title: 'Compile & Deploy Wizard…', subtitle: 'Workbench Action · Preview & deploy mod', originalData: { action: 'deploy' } },
      { id: 'cmd_bottom_dock', category: 'command', title: 'Toggle Bottom Panel (Problems / Runtime / XML)', subtitle: 'Workbench Action · Ctrl+J', originalData: { action: 'toggle-bottom-dock' } },
      { id: 'cmd_right_inspector', category: 'command', title: 'Toggle Right Contextual Inspector', subtitle: 'Workbench Action · Selection properties & lineage', originalData: { action: 'toggle-right-inspector' } },
      { id: 'cmd_settings', category: 'command', title: 'Open Studio Settings', subtitle: 'Workbench Action · Paths, Corpus, Layout & AI', originalData: { action: 'settings' } },
      { id: 'cmd_sync', category: 'command', title: 'Sync / Import Mod Project…', subtitle: 'Workbench Action · Load folder or XML', originalData: { action: 'sync-mod' } },
      { id: 'cmd_release', category: 'command', title: 'Open Release Center (Nexus & Steam)', subtitle: 'Tool · Playtest & Release', originalData: { sidebar: 'playtest' } },
      { id: 'cmd_agent_bridge', category: 'command', title: 'Open Agent API & MCP Bridge', subtitle: 'Workbench Action · Keys, sync & history', originalData: { action: 'agent-api' } },
      { id: 'cmd_shortcuts', category: 'command', title: 'Keyboard Shortcuts Reference', subtitle: 'Workbench Action · ?', originalData: { action: 'shortcuts' } },
      ...WORKSPACE_NAV_ITEMS.map(item => ({
        id: `view_${item.id}`,
        category: 'command' as const,
        title: `Switch Editor: ${item.label}`,
        subtitle: `Workspace View (${item.shortLabel})`,
        originalData: { view: item.id, sidebar: item.sidebarTab },
      })),
      ...SIDEBAR_NAV_ITEMS.map(item => ({
        id: `tool_${item.id}`,
        category: 'command' as const,
        title: `Open Tool Panel: ${item.label}`,
        subtitle: 'Left Activity Rail Tool',
        originalData: { sidebar: item.id },
      })),
    ];
    return cmds;
  }, []);

  const isCommandMode = query.trimStart().startsWith('>');

  // Primary Mod Entity search results (exact count preserved for Matched Search Targets (N))
  const results = useMemo<SearchResultItem[]>(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];

    if (isCommandMode) {
      const cmdQuery = trimmed.slice(1).trim().toLowerCase();
      if (!cmdQuery) return workbenchCommands;
      return workbenchCommands.filter(cmd =>
        cmd.title.toLowerCase().includes(cmdQuery) || cmd.subtitle.toLowerCase().includes(cmdQuery)
      );
    }

    const lcQuery = trimmed.toLowerCase();
    const matches: SearchResultItem[] = [];

    // 1. Mission Director Nodes & Cues
    for (const node of workspace.nodes || []) {
      const propHit = Object.values(node.properties || {}).some(val => String(val ?? '').toLowerCase().includes(lcQuery));
      if (
        node.label?.toLowerCase().includes(lcQuery)
        || node.xmlTag?.toLowerCase().includes(lcQuery)
        || node.type?.toLowerCase().includes(lcQuery)
        || node.comment?.toLowerCase().includes(lcQuery)
        || propHit
      ) {
        matches.push({
          id: `node_${node.id}`,
          category: 'node',
          title: node.label || `<${node.xmlTag}>`,
          subtitle: `${node.type.toUpperCase()}: <${node.xmlTag}>`,
          meta: node.comment || (node.properties?.name ? String(node.properties.name) : undefined),
          originalData: node,
        });
      }
    }

    // 2. Legacy UI Widgets
    for (const widget of workspace.uiWidgets || []) {
      if (widget.label?.toLowerCase().includes(lcQuery) || widget.type?.toLowerCase().includes(lcQuery)) {
        matches.push({
          id: `widget_${widget.id}`,
          category: 'widget',
          title: widget.label || `HUD ${widget.type.toUpperCase()}`,
          subtitle: `HUD WIDGET [${widget.type.toUpperCase()}]`,
          meta: `x: ${widget.x}, y: ${widget.y}, w: ${widget.w}px, h: ${widget.h}px`,
          originalData: widget,
        });
      }
    }

    // 3. XML Patch Blocks
    for (const patch of xmlPatches) {
      if (
        patch.note?.toLowerCase().includes(lcQuery)
        || patch.sel?.toLowerCase().includes(lcQuery)
        || patch.content?.toLowerCase().includes(lcQuery)
        || patch.targetFile?.toLowerCase().includes(lcQuery)
      ) {
        matches.push({
          id: `patch_${patch.id}`,
          category: 'patch',
          title: patch.note || 'XML Patch Block',
          subtitle: `ACTION: ${patch.action.toUpperCase()} ${patch.targetFile ? `(${patch.targetFile})` : ''}`,
          meta: patch.sel,
          originalData: patch,
        });
      }
    }

    // 4. AI Behavior Scripts
    for (const script of workspace.aiScripts || []) {
      if (
        script.name?.toLowerCase().includes(lcQuery)
        || script.command?.toLowerCase().includes(lcQuery)
        || script.description?.toLowerCase().includes(lcQuery)
      ) {
        matches.push({
          id: `ai_${script.id}`,
          category: 'aiscript',
          title: script.name || script.command,
          subtitle: `AI Script · command="${script.command || 'order'}"`,
          meta: script.attentionLevel,
          originalData: script,
        });
      }
    }

    // 5. Wares & Jobs
    for (const ware of workspace.wares || []) {
      if (ware.id?.toLowerCase().includes(lcQuery) || ware.name?.toLowerCase().includes(lcQuery)) {
        matches.push({
          id: `ware_${ware.id}`,
          category: 'ware',
          title: ware.name || ware.id,
          subtitle: `Ware · ${ware.transport || 'container'}`,
          meta: ware.id,
          originalData: ware,
        });
      }
    }
    for (const job of workspace.jobs || []) {
      if (job.id?.toLowerCase().includes(lcQuery) || job.name?.toLowerCase().includes(lcQuery) || job.faction?.toLowerCase().includes(lcQuery)) {
        matches.push({
          id: `job_${job.id}`,
          category: 'job',
          title: job.name || job.id,
          subtitle: `Job · faction=${job.faction} (${job.shipClass})`,
          meta: job.taskScript,
          originalData: job,
        });
      }
    }

    // 6. Translation Pages & Entries
    for (const tFile of workspace.tFiles || []) {
      for (const page of tFile.pages || []) {
        for (const entry of page.items || []) {
          if (entry.value?.toLowerCase().includes(lcQuery) || `${page.id},${entry.id}`.includes(lcQuery)) {
            matches.push({
              id: `t_${tFile.languageId}_${page.id}_${entry.id}`,
              category: 'translation',
              title: `{${page.id},${entry.id}} ${entry.value}`,
              subtitle: `Translation · L0${tFile.languageId} (${page.title || `Page ${page.id}`})`,
              originalData: tFile,
            });
          }
        }
      }
    }

    // 7. Integration Contract Endpoints
    if (workspace.integrationContract) {
      const contract = workspace.integrationContract;
      for (const ep of contract.endpoints || []) {
        if (ep.id.toLowerCase().includes(lcQuery) || ep.path?.toLowerCase().includes(lcQuery) || ep.description?.toLowerCase().includes(lcQuery)) {
          matches.push({
            id: `contract_${ep.id}`,
            category: 'contract',
            title: `${contract.namespace}.${ep.id}`,
            subtitle: `Contract Endpoint · ${ep.kind || 'http'}${ep.method ? ` (${ep.method})` : ''}`,
            meta: ep.path || ep.description,
            originalData: ep,
          });
        }
      }
    }

    // 8. Preserved / UI Source Files
    for (const file of [...(workspace.passthroughFiles || []), ...(workspace.uiSourceFiles || [])]) {
      if (file.path?.toLowerCase().includes(lcQuery)) {
        matches.push({
          id: `file_${file.path}`,
          category: 'file',
          title: file.path,
          subtitle: file.path.endsWith('.lua') ? 'UI Lua Source File' : 'Mod Project File',
          originalData: file,
        });
      }
    }

    return matches;
  }, [
    isCommandMode,
    query,
    workbenchCommands,
    workspace.aiScripts,
    workspace.integrationContract,
    workspace.jobs,
    workspace.nodes,
    workspace.passthroughFiles,
    workspace.tFiles,
    workspace.uiSourceFiles,
    workspace.uiWidgets,
    workspace.wares,
    xmlPatches,
  ]);

  // Secondary Quick-Jump Commands & Wiki matches (does not alter primary Matched Search Targets (N))
  const secondaryMatches = useMemo<SearchResultItem[]>(() => {
    if (isCommandMode || !query.trim()) return [];
    const lc = query.trim().toLowerCase();
    const cmdHits = workbenchCommands
      .filter(c => c.title.toLowerCase().includes(lc))
      .slice(0, 3);
    const wikiHits = WIKI_TOPICS
      .filter(w => w.title.toLowerCase().includes(lc) || w.category.toLowerCase().includes(lc))
      .slice(0, 2)
      .map(w => ({
        id: `wiki_${w.id}`,
        category: 'wiki' as const,
        title: w.title,
        subtitle: `X4 Wiki · ${w.category}`,
        originalData: w,
      }));
    return [...cmdHits, ...wikiHits];
  }, [isCommandMode, query, workbenchCommands]);

  const navigableList = useMemo(() => [...results, ...secondaryMatches], [results, secondaryMatches]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelectResult = (item: SearchResultItem) => {
    setIsOpen(false);
    setQuery('');
    launcherRef.current?.focus({ preventScroll: true });

    if (item.category === 'node') {
      const node = item.originalData as MDNode;
      setSelectedNode(node);
      setWorkspaceView('blueprint');
      setActiveSidebarTab('script');
      setFocusNodeRequest?.({ nodeId: node.id, timestamp: Date.now() });
    } else if (item.category === 'widget') {
      const widget = item.originalData as UIWidget;
      setSelectedWidget(widget);
      setWorkspaceView('ui-designer');
      setActiveSidebarTab('ui');
    } else if (item.category === 'patch') {
      setWorkspaceView('xmlpatch');
      setActiveSidebarTab('config');
    } else if (item.category === 'aiscript') {
      setWorkspaceView('aiscripts');
      setActiveSidebarTab('script');
    } else if (item.category === 'ware' || item.category === 'job') {
      setWorkspaceView('libraries');
      setActiveSidebarTab('config');
    } else if (item.category === 'translation') {
      setWorkspaceView('translation');
      setActiveSidebarTab('config');
    } else if (item.category === 'contract') {
      setWorkspaceView('contracts');
      setActiveSidebarTab('config');
    } else if (item.category === 'file') {
      const file = item.originalData as { path?: string };
      if (file?.path?.endsWith('.lua') || file?.path?.toLowerCase() === 'ui.xml') {
        setWorkspaceView('ui-designer');
      } else {
        setActiveSidebarTab('filesystem');
      }
    } else if (item.category === 'wiki') {
      setWorkspaceView('wiki');
    } else if (item.category === 'command') {
      const cmd = item.originalData as { view?: WorkspaceView; sidebar?: SidebarTab; action?: string };
      if (cmd.view) setWorkspaceView(cmd.view);
      if (cmd.sidebar) setActiveSidebarTab(cmd.sidebar);
      if (cmd.action) onRunGlobalCommand?.(cmd.action);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (navigableList.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const direction = e.key === 'ArrowDown' ? 1 : -1;
      setSelectedIndex(prev => (prev + direction + navigableList.length) % navigableList.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = navigableList[selectedIndex] ?? results[0];
      if (chosen) handleSelectResult(chosen);
    }
  };

  const renderIcon = (category: SearchResultItem['category']) => {
    switch (category) {
      case 'node': return <GitFork className="w-3.5 h-3.5" />;
      case 'widget': return <Layout className="w-3.5 h-3.5" />;
      case 'aiscript': return <Scroll className="w-3.5 h-3.5" />;
      case 'ware':
      case 'job': return <Package className="w-3.5 h-3.5" />;
      case 'translation': return <Globe className="w-3.5 h-3.5" />;
      case 'contract': return <Plug className="w-3.5 h-3.5" />;
      case 'wiki': return <BookOpen className="w-3.5 h-3.5" />;
      case 'command': return <Terminal className="w-3.5 h-3.5" />;
      default: return <FileCode className="w-3.5 h-3.5" />;
    }
  };

  const badgeLabel = (category: SearchResultItem['category']): string => {
    switch (category) {
      case 'node': return 'Node';
      case 'widget': return 'Widget';
      case 'patch': return 'Patch';
      case 'aiscript': return 'AI Script';
      case 'ware': return 'Ware';
      case 'job': return 'Job';
      case 'translation': return 'String';
      case 'contract': return 'Contract';
      case 'file': return 'File';
      case 'wiki': return 'Wiki';
      case 'command': return 'Command';
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-8 shrink-0 select-none lg:w-64 xl:w-80 min-[2150px]:w-96"
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
        title="Search workspace or run > command (Ctrl+K, Ctrl+Shift+P, or /)"
        onClick={() => (isOpen ? setIsOpen(false) : openSearch())}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-700/70 bg-[#0d1118] text-slate-300 hover:border-sky-500/45 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400 lg:hidden cursor-pointer"
      >
        <Search aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
      <div
        id={searchId}
        data-testid="workspace-search-panel"
        className={`fixed left-2 top-11 z-50 w-[min(420px,calc(100vw-1rem))] lg:static lg:block lg:w-full ${isOpen ? 'block' : 'hidden'}`}
      >
        <div className="relative flex items-center h-7 bg-[#090c11] border border-slate-700/70 hover:border-sky-500/45 focus-within:border-sky-400 rounded-md px-2.5 transition-colors">
          {isCommandMode ? (
            <Command className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          ) : (
            <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          )}
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
            placeholder="Search mod or type > for commands…"
            className="min-w-0 flex-1 bg-transparent border-none text-[11.5px] font-sans text-slate-100 placeholder-slate-500 focus:outline-none pl-1.5"
          />

          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="p-0.5 rounded hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          ) : (
            <div className="hidden sm:flex items-center gap-1 select-none">
              <button
                type="button"
                tabIndex={-1}
                onClick={() => openSearch('>')}
                className="text-[9.5px] font-mono text-slate-400 hover:text-sky-300 bg-slate-800/70 border border-slate-700/70 px-1.5 py-0.5 rounded cursor-pointer"
                title="Open Command Palette (>)"
              >
                &gt;
              </button>
              <span className="forge-kbd">Ctrl+K</span>
            </div>
          )}
        </div>

        {isOpen && query.trim() && (
          <div className="mt-1.5 w-full lg:absolute lg:left-0 lg:w-[420px] bg-[#11161f] border border-slate-700/80 shadow-2xl rounded-lg overflow-hidden z-50">
            <div className="px-2.5 py-1.5 border-b border-slate-800 bg-[#151b26] flex items-center justify-between">
              <span className="text-[10.5px] text-sky-300 font-semibold">
                {isCommandMode ? `Workbench Commands (${results.length})` : `Matched Search Targets (${results.length})`}
              </span>
              <span className="text-[10px] text-slate-500">↑↓ Navigate · Enter</span>
            </div>

            <div className="max-h-[min(22rem,calc(100dvh-9rem))] overflow-y-auto custom-scrollbar p-1.5 space-y-1">
              {navigableList.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs">
                  No matching mod elements, commands, or docs found.
                </div>
              ) : (
                <>
                  {results.map((item, index) => {
                    const isSelected = index === selectedIndex;
                    return (
                      <div
                        key={item.id}
                        onMouseEnter={() => setSelectedIndex(index)}
                        onClick={() => handleSelectResult(item)}
                        className={`p-2 rounded-md border flex items-start gap-2.5 transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-sky-500/12 border-sky-500/40 text-white'
                            : 'bg-transparent border-transparent text-slate-300 hover:bg-white/[0.04]'
                        }`}
                      >
                        <div className="p-1.5 rounded bg-slate-800/80 text-sky-300 shrink-0 mt-0.5">
                          {renderIcon(item.category)}
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-[11.5px] truncate">{item.title}</span>
                            <span className="text-[9.5px] px-1.5 py-0.5 font-medium rounded bg-slate-800 text-slate-300 border border-slate-700/70 shrink-0">
                              {badgeLabel(item.category)}
                            </span>
                          </div>
                          <span className="text-[10.5px] text-slate-400 truncate">{item.subtitle}</span>
                          {item.meta && (
                            <span className="text-[10px] text-slate-500 truncate font-mono mt-0.5">
                              {item.meta}
                            </span>
                          )}
                        </div>
                        {isSelected && (
                          <div className="self-center text-sky-400 shrink-0 pr-0.5">
                            <ArrowRight className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {secondaryMatches.length > 0 && (
                    <div className="pt-1.5 mt-1 border-t border-slate-800/80 space-y-1">
                      <div className="px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                        Views, Commands &amp; Docs
                      </div>
                      {secondaryMatches.map((item, offset) => {
                        const index = results.length + offset;
                        const isSelected = index === selectedIndex;
                        return (
                          <div
                            key={item.id}
                            onMouseEnter={() => setSelectedIndex(index)}
                            onClick={() => handleSelectResult(item)}
                            className={`px-2 py-1.5 rounded-md border flex items-center gap-2 transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-sky-500/12 border-sky-500/40 text-white'
                                : 'border-transparent text-slate-300 hover:bg-white/[0.04]'
                            }`}
                          >
                            <span className="text-slate-400 shrink-0">{renderIcon(item.category)}</span>
                            <span className="text-[11px] font-medium truncate flex-1">{item.title}</span>
                            <span className="text-[9.5px] text-slate-500 shrink-0">{badgeLabel(item.category)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="px-2.5 py-1.5 border-t border-slate-800 bg-[#0d1118] flex items-center justify-between text-[10px] text-slate-500">
              <span>{isCommandMode ? 'Command Palette active' : 'Tip: prefix with > for Studio commands'}</span>
              <span className="inline-flex items-center gap-1">
                <CornerDownLeft className="w-2.5 h-2.5" />
                Open
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
