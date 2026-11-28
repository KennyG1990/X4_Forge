/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * UI-P6A — Docs & Pattern Library.
 * Consolidates X4 9.00 guides (`forgeKnowledge.ts`), proven MD patterns (`modPatterns.ts`),
 * guarded Lua snippets (`luaSnippets.ts`), and interactive starter recipes (`modRecipes.ts`)
 * under one Concept A workspace view with readable Markdown and syntax-highlighted code blocks.
 */

import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Compass,
  ExternalLink,
  FileCode,
  Layers,
  Pin,
  Puzzle,
  Search,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { generateMDXML, type MDNode, type ModWorkspace } from '../types';
import { WIKI_TOPICS, type WikiCategory, type WikiTopic } from '../lib/forgeKnowledge';
import { MOD_PATTERNS, buildPatternWorkspace, stampPatternIntoWorkspace } from '../lib/modPatterns';
import { LUA_SNIPPETS, fillLuaSnippet, type LuaSnippetCategory } from '../lib/luaSnippets';
import { MOD_RECIPES, buildRecipeWorkspace } from '../lib/modRecipes';
import { EmptyState, PanelHeader, StatusPill } from './ui';
import DocsCodeBlock from './docs/DocsCodeBlock';
import DocsMarkdown from './docs/DocsMarkdown';

export { WIKI_TOPICS, type WikiTopic };

type LibrarySection = 'guides' | 'patterns' | 'lua' | 'recipes';

interface WikiBrowserProps {
  selectedNode: MDNode | null;
  setSelectedNode: React.Dispatch<React.SetStateAction<MDNode | null>>;
  setWorkspace: React.Dispatch<React.SetStateAction<ModWorkspace>>;
  workspace?: ModWorkspace;
  onOpenBlueprint?: () => void;
}

const GUIDE_CATEGORIES: ReadonlyArray<{ id: 'all' | WikiCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'mdscript', label: 'MD Scripting' },
  { id: 'aiscript', label: 'AI Scripts' },
  { id: 'xmlpatch', label: 'XML Patching' },
  { id: 'luaui', label: 'HUD & Lua' },
  { id: 'reference', label: 'Reference' },
];

const LUA_CATEGORIES: ReadonlyArray<{ id: 'all' | LuaSnippetCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'events', label: 'Events' },
  { id: 'http', label: 'HTTP' },
  { id: 'menu', label: 'Menu' },
  { id: 'lifecycle', label: 'Lifecycle' },
];

const GUIDE_CATEGORY_LABELS: Record<WikiCategory, string> = {
  mdscript: 'MD Scripting',
  aiscript: 'AI Scripts',
  xmlpatch: 'XML Patching',
  luaui: 'HUD & Lua',
  reference: 'Reference',
};

const TAB_ITEMS: ReadonlyArray<{ id: LibrarySection; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'guides', label: 'Guides & Reference', icon: BookOpen },
  { id: 'patterns', label: 'MD Patterns', icon: Puzzle },
  { id: 'lua', label: 'Lua Snippets', icon: FileCode },
  { id: 'recipes', label: 'Starter Recipes', icon: Wand2 },
];

export default function WikiBrowser({
  selectedNode,
  setSelectedNode,
  setWorkspace,
  onOpenBlueprint,
}: WikiBrowserProps) {
  const [section, setSection] = useState<LibrarySection>('guides');
  const [guideCategory, setGuideCategory] = useState<'all' | WikiCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState<string>(WIKI_TOPICS[0]?.id || '');

  const [selectedPatternId, setSelectedPatternId] = useState<string>(MOD_PATTERNS[0]?.id || '');
  const [stampedNotice, setStampedNotice] = useState<string | null>(null);

  const [luaCategory, setLuaCategory] = useState<'all' | LuaSnippetCategory>('all');
  const [selectedSnippetId, setSelectedSnippetId] = useState<string>(LUA_SNIPPETS[0]?.id || '');
  const [luaValuesById, setLuaValuesById] = useState<Record<string, Record<string, string>>>({});
  const [luaAppendedNotice, setLuaAppendedNotice] = useState<string | null>(null);

  const [selectedRecipeId, setSelectedRecipeId] = useState<string>(MOD_RECIPES[0]?.id || '');
  const [recipeAnswersById, setRecipeAnswersById] = useState<Record<string, Record<string, string>>>({});
  const [confirmLoadRecipe, setConfirmLoadRecipe] = useState(false);
  const [recipeLoadedNotice, setRecipeLoadedNotice] = useState<string | null>(null);

  const filteredTopics = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return WIKI_TOPICS.filter(topic => {
      if (guideCategory !== 'all' && topic.category !== guideCategory) return false;
      if (!q) return true;
      return (
        topic.title.toLowerCase().includes(q)
        || topic.summary.toLowerCase().includes(q)
        || topic.content.toLowerCase().includes(q)
        || (topic.codeTemplate ? topic.codeTemplate.toLowerCase().includes(q) : false)
      );
    });
  }, [guideCategory, searchQuery]);

  const activeTopic = useMemo(
    () => filteredTopics.find(topic => topic.id === selectedTopicId) || filteredTopics[0] || null,
    [filteredTopics, selectedTopicId],
  );

  const filteredPatterns = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return MOD_PATTERNS;
    return MOD_PATTERNS.filter(pattern =>
      pattern.title.toLowerCase().includes(q)
      || pattern.blurb.toLowerCase().includes(q)
      || pattern.provenance.provenMod.toLowerCase().includes(q)
      || pattern.provenance.file.toLowerCase().includes(q)
      || pattern.provenance.note.toLowerCase().includes(q),
    );
  }, [searchQuery]);

  const activePattern = useMemo(
    () => filteredPatterns.find(pattern => pattern.id === selectedPatternId) || filteredPatterns[0] || null,
    [filteredPatterns, selectedPatternId],
  );

  const patternXml = useMemo(() => {
    if (!activePattern) return '';
    return generateMDXML(buildPatternWorkspace(activePattern.id));
  }, [activePattern]);

  const filteredSnippets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return LUA_SNIPPETS.filter(snippet => {
      if (luaCategory !== 'all' && snippet.category !== luaCategory) return false;
      if (!q) return true;
      return (
        snippet.title.toLowerCase().includes(q)
        || snippet.description.toLowerCase().includes(q)
        || snippet.lua.toLowerCase().includes(q)
      );
    });
  }, [luaCategory, searchQuery]);

  const activeSnippet = useMemo(
    () => filteredSnippets.find(snippet => snippet.id === selectedSnippetId) || filteredSnippets[0] || null,
    [filteredSnippets, selectedSnippetId],
  );

  const activeSnippetValues = useMemo(
    () => (activeSnippet ? (luaValuesById[activeSnippet.id] || {}) : {}),
    [activeSnippet, luaValuesById],
  );

  const filledLuaPreview = useMemo(() => {
    if (!activeSnippet) return '';
    return fillLuaSnippet(activeSnippet.id, activeSnippetValues);
  }, [activeSnippet, activeSnippetValues]);

  const filteredRecipes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return MOD_RECIPES;
    return MOD_RECIPES.filter(recipe =>
      recipe.title.toLowerCase().includes(q)
      || recipe.blurb.toLowerCase().includes(q),
    );
  }, [searchQuery]);

  const activeRecipe = useMemo(
    () => filteredRecipes.find(recipe => recipe.id === selectedRecipeId) || filteredRecipes[0] || null,
    [filteredRecipes, selectedRecipeId],
  );

  const activeRecipeAnswers = useMemo(() => {
    if (!activeRecipe) return {};
    const saved = recipeAnswersById[activeRecipe.id] || {};
    const merged: Record<string, string> = {};
    for (const q of activeRecipe.questions) {
      merged[q.key] = saved[q.key] !== undefined ? saved[q.key] : q.default;
    }
    return merged;
  }, [activeRecipe, recipeAnswersById]);

  const activeRecipePreview = useMemo(() => {
    if (!activeRecipe) return null;
    const ws = buildRecipeWorkspace(activeRecipe.id, activeRecipeAnswers);
    return { workspace: ws, xml: generateMDXML(ws) };
  }, [activeRecipe, activeRecipeAnswers]);

  const triggerAICopilot = (topicTitle: string, template?: string) => {
    const aiPrompt = `Hi! I was reading the X4 9.00 documentation about "${topicTitle}" inside Forge. Can you explain how this applies to my active mod?${
      template ? `\n\nReference snippet:\n${template}` : ''
    }`;
    window.dispatchEvent(new CustomEvent('open-ai-chat', { detail: { prompt: aiPrompt } }));
  };

  const handlePinTopic = (topicId: string) => {
    if (!selectedNode) return;
    const isPinnedNow = selectedNode.properties?.pinnedArticleId === topicId;
    const nextArticleId = isPinnedNow ? null : topicId;

    setWorkspace(prev => ({
      ...prev,
      nodes: prev.nodes.map(n =>
        n.id === selectedNode.id
          ? { ...n, properties: { ...n.properties, pinnedArticleId: nextArticleId } }
          : n,
      ),
    }));
    setSelectedNode(prev => (prev ? { ...prev, properties: { ...prev.properties, pinnedArticleId: nextArticleId } } : null));
  };

  const handleStampPattern = () => {
    if (!activePattern) return;
    setWorkspace(prev => stampPatternIntoWorkspace(prev, activePattern.id));
    setStampedNotice(`Stamped "${activePattern.title}" into workspace.`);
  };

  const handleAppendLua = () => {
    if (!activeSnippet) return;
    const snippetCode = fillLuaSnippet(activeSnippet.id, activeSnippetValues).trim();
    if (!snippetCode) return;
    setWorkspace(prev => {
      const existing = (prev.customLua || '').trimEnd();
      const separator = existing ? '\n\n' : '';
      return {
        ...prev,
        customLua: `${existing}${separator}${snippetCode}\n`,
      };
    });
    setLuaAppendedNotice(`Appended "${activeSnippet.title}" to customLua.`);
  };

  const handleConfirmLoadRecipe = () => {
    if (!activeRecipe) return;
    const built = buildRecipeWorkspace(activeRecipe.id, activeRecipeAnswers);
    setWorkspace(() => built);
    setConfirmLoadRecipe(false);
    setRecipeLoadedNotice(`Loaded starter recipe "${built.name}".`);
  };

  return (
    <div id="wiki-browser-panel" data-testid="docs-pattern-library" className="flex flex-col h-full min-h-0 bg-[#0c0e12] text-[#eef2f7]">
      <PanelHeader
        title="Docs & Pattern Library"
        subtitle="X4 9.00 guides, proven MD patterns, Lua snippets, and starter recipes"
        icon={<BookOpen className="w-4 h-4 text-[#93c5fd]" />}
        badge={
          <StatusPill tone="info">
            {WIKI_TOPICS.length} guides · {MOD_PATTERNS.length} patterns · {LUA_SNIPPETS.length} snippets · {MOD_RECIPES.length} recipes
          </StatusPill>
        }
      />

      <div className="shrink-0 border-b border-[#262c36] bg-[#11141a] px-3 py-2 flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Docs and pattern library sections" className="flex flex-wrap items-center gap-1.5">
          {TAB_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = section === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`docs-tab-${id}`}
                onClick={() => {
                  setSection(id);
                  setConfirmLoadRecipe(false);
                }}
                className={`h-8 px-3 rounded-md border inline-flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? 'border-[#3b82f6]/50 bg-[#3b82f6]/15 text-[#93c5fd]'
                    : 'border-[#262c36] bg-[#0c0e12] text-[#a0aab8] hover:text-[#eef2f7] hover:border-[#3b82f6]/35'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        <label className="relative w-full sm:w-72">
          <span className="sr-only">Search docs and patterns</span>
          <Search className="pointer-events-none absolute left-2.5 top-2 w-3.5 h-3.5 text-[#687385]" />
          <input
            type="text"
            data-testid="docs-search-input"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search guides, patterns, Lua, recipes..."
            className="w-full h-8 rounded-md border border-[#262c36] bg-[#0a0c10] pl-8 pr-3 text-xs text-[#eef2f7] placeholder:text-[#687385] focus:outline-none focus:border-[#3b82f6]"
          />
        </label>
      </div>

      {section === 'guides' && (
        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          <aside className="w-full md:w-80 shrink-0 border-b md:border-b-0 md:border-r border-[#262c36] bg-[#0a0c10] flex flex-col min-h-0 max-h-64 md:max-h-none">
            <div className="p-2.5 border-b border-[#262c36] flex flex-wrap gap-1.5 shrink-0">
              {GUIDE_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setGuideCategory(cat.id)}
                  className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                    guideCategory === cat.id
                      ? 'border-[#3b82f6]/50 bg-[#3b82f6]/15 text-[#93c5fd]'
                      : 'border-[#262c36] bg-[#11141a] text-[#a0aab8] hover:text-[#eef2f7]'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            <div className="px-3 py-1.5 text-[11px] font-medium text-[#687385] border-b border-[#262c36]/60 shrink-0">
              Guides ({filteredTopics.length})
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
              {filteredTopics.length === 0 ? (
                <div className="rounded-md border border-[#262c36] bg-[#11141a] p-3 text-xs text-[#687385] text-center">
                  No matching guides.
                </div>
              ) : (
                filteredTopics.map(topic => {
                  const isActive = activeTopic?.id === topic.id;
                  return (
                    <button
                      key={topic.id}
                      type="button"
                      data-testid={`docs-guide-item-${topic.id}`}
                      onClick={() => setSelectedTopicId(topic.id)}
                      className={`w-full text-left rounded-lg border p-2.5 transition-colors cursor-pointer ${
                        isActive
                          ? 'border-[#3b82f6]/60 bg-[#3b82f6]/12 text-[#eef2f7]'
                          : 'border-[#262c36] bg-[#11141a] text-[#cbd5e1] hover:border-[#3b82f6]/35'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[11px] font-medium text-[#93c5fd]">{GUIDE_CATEGORY_LABELS[topic.category]}</span>
                      </div>
                      <div className="text-xs font-semibold text-[#eef2f7] leading-snug">{topic.title}</div>
                      <p className="mt-1 text-[11px] text-[#a0aab8] line-clamp-2 leading-relaxed">{topic.summary}</p>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <main className="flex-1 min-w-0 min-h-0 overflow-y-auto p-5 bg-[#0c0e12]">
            {!activeTopic ? (
              <EmptyState
                title="No documentation guides matched"
                description="Clear the search filter or choose another X4 category to inspect guides and code templates."
                icon={<Compass className="w-5 h-5" />}
                dataTestId="docs-empty-state"
              >
                <button
                  type="button"
                  onClick={() => { setSearchQuery(''); setGuideCategory('all'); }}
                  className="rounded-md border border-[#3b82f6]/40 bg-[#3b82f6]/15 px-3 py-1.5 text-xs font-medium text-[#93c5fd] hover:bg-[#3b82f6]/25 cursor-pointer"
                >
                  Reset filters
                </button>
              </EmptyState>
            ) : (
              <article className="max-w-3xl mx-auto rounded-lg border border-[#262c36] bg-[#11141a] p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#262c36] pb-4">
                  <div className="min-w-0 space-y-1.5">
                    <StatusPill tone="info">{GUIDE_CATEGORY_LABELS[activeTopic.category]}</StatusPill>
                    <h3 className="text-base font-semibold text-[#eef2f7] leading-snug">{activeTopic.title}</h3>
                    <p className="text-xs text-[#a0aab8] leading-relaxed">{activeTopic.summary}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handlePinTopic(activeTopic.id)}
                      disabled={!selectedNode}
                      title={
                        !selectedNode
                          ? 'Select a node on the Canvas to pin this reference'
                          : selectedNode.properties?.pinnedArticleId === activeTopic.id
                            ? `Unpin from ${selectedNode.label}`
                            : `Pin to ${selectedNode.label}`
                      }
                      className={`h-8 px-2.5 rounded-md border inline-flex items-center gap-1.5 text-[11px] font-medium transition-colors ${
                        !selectedNode
                          ? 'border-[#262c36] bg-[#0a0c10] text-[#687385] cursor-not-allowed'
                          : selectedNode.properties?.pinnedArticleId === activeTopic.id
                            ? 'border-rose-500/40 bg-rose-500/12 text-rose-300 hover:bg-rose-500/20 cursor-pointer'
                            : 'border-[#3b82f6]/40 bg-[#3b82f6]/15 text-[#93c5fd] hover:bg-[#3b82f6]/25 cursor-pointer'
                      }`}
                    >
                      <Pin className="w-3.5 h-3.5" />
                      <span>
                        {!selectedNode
                          ? 'No node selected'
                          : selectedNode.properties?.pinnedArticleId === activeTopic.id
                            ? 'Unpin from node'
                            : `Pin to ${selectedNode.label}`}
                      </span>
                    </button>

                    {activeTopic.egosoftUrl && (
                      <a
                        href={activeTopic.egosoftUrl}
                        target="_blank"
                        rel="noreferrer"
                        referrerPolicy="no-referrer"
                        className="h-8 px-2.5 rounded-md border border-[#262c36] bg-[#0a0c10] hover:border-[#3b82f6]/40 inline-flex items-center gap-1.5 text-[11px] font-medium text-[#cbd5e1] hover:text-[#eef2f7] transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Official Wiki</span>
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() => triggerAICopilot(activeTopic.title, activeTopic.codeTemplate)}
                      className="h-8 px-2.5 rounded-md border border-amber-500/35 bg-amber-500/12 hover:bg-amber-500/20 inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-300 transition-colors cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Ask AI Helper</span>
                    </button>
                  </div>
                </div>

                <DocsMarkdown content={activeTopic.content} />

                {activeTopic.codeTemplate && (
                  <DocsCodeBlock
                    code={activeTopic.codeTemplate}
                    lang={activeTopic.category === 'luaui' ? 'lua' : 'xml'}
                    label={activeTopic.category === 'luaui' ? 'Lua / UIX Example' : 'XML Example'}
                  />
                )}
              </article>
            )}
          </main>
        </div>
      )}

      {section === 'patterns' && (
        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          <aside className="w-full md:w-80 shrink-0 border-b md:border-b-0 md:border-r border-[#262c36] bg-[#0a0c10] flex flex-col min-h-0 max-h-64 md:max-h-none">
            <div className="px-3 py-2 text-[11px] font-medium text-[#687385] border-b border-[#262c36]/60 shrink-0">
              Proven MD patterns ({filteredPatterns.length})
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
              {filteredPatterns.length === 0 ? (
                <div className="rounded-md border border-[#262c36] bg-[#11141a] p-3 text-xs text-[#687385] text-center">
                  No patterns matched.
                </div>
              ) : (
                filteredPatterns.map(pattern => {
                  const isActive = activePattern?.id === pattern.id;
                  return (
                    <button
                      key={pattern.id}
                      type="button"
                      data-testid={`docs-pattern-item-${pattern.id}`}
                      onClick={() => {
                        setSelectedPatternId(pattern.id);
                        setStampedNotice(null);
                      }}
                      className={`w-full text-left rounded-lg border p-2.5 transition-colors cursor-pointer ${
                        isActive
                          ? 'border-[#3b82f6]/60 bg-[#3b82f6]/12 text-[#eef2f7]'
                          : 'border-[#262c36] bg-[#11141a] text-[#cbd5e1] hover:border-[#3b82f6]/35'
                      }`}
                    >
                      <div className="text-xs font-semibold text-[#eef2f7]">{pattern.title}</div>
                      <p className="mt-1 text-[11px] text-[#a0aab8] line-clamp-2 leading-relaxed">{pattern.blurb}</p>
                      <div className="mt-1.5 text-[11px] font-mono text-[#93c5fd] truncate">{pattern.provenance.provenMod}</div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <main className="flex-1 min-w-0 min-h-0 overflow-y-auto p-5 bg-[#0c0e12]">
            {!activePattern ? (
              <EmptyState
                title="No proven MD patterns matched"
                description="Clear the search filter to browse compile-clean MD patterns with shipping mod provenance."
                icon={<Puzzle className="w-5 h-5" />}
                dataTestId="docs-empty-state"
              />
            ) : (
              <div className="max-w-3xl mx-auto rounded-lg border border-[#262c36] bg-[#11141a] p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#262c36] pb-4">
                  <div className="min-w-0 space-y-1">
                    <StatusPill tone="success" dot>Oracle-verified MD pattern</StatusPill>
                    <h3 className="text-base font-semibold text-[#eef2f7]">{activePattern.title}</h3>
                    <p className="text-xs text-[#a0aab8] leading-relaxed">{activePattern.blurb}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      data-testid="docs-stamp-pattern-btn"
                      onClick={handleStampPattern}
                      className="h-8 px-3 rounded-md border border-[#3b82f6]/50 bg-[#3b82f6]/20 hover:bg-[#3b82f6]/30 inline-flex items-center gap-1.5 text-xs font-semibold text-[#eef2f7] transition-colors cursor-pointer"
                    >
                      <Layers className="w-3.5 h-3.5 text-[#93c5fd]" />
                      <span>Stamp into Workspace</span>
                    </button>
                    {onOpenBlueprint && stampedNotice && (
                      <button
                        type="button"
                        onClick={onOpenBlueprint}
                        className="h-8 px-3 rounded-md border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-xs font-medium text-emerald-200 cursor-pointer"
                      >
                        Open MD Canvas
                      </button>
                    )}
                  </div>
                </div>

                {stampedNotice && (
                  <div className="rounded-md border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{stampedNotice}</span>
                  </div>
                )}

                <div className="rounded-lg border border-[#262c36] bg-[#0a0c10] p-3.5 space-y-1.5 text-xs">
                  <div className="text-[11px] font-semibold text-[#eef2f7]">Provenance</div>
                  <div className="text-[#cbd5e1]"><span className="text-[#687385]">Source mod:</span> {activePattern.provenance.provenMod}</div>
                  <div className="font-mono text-[11px] text-[#93c5fd] break-all"><span className="font-sans text-[#687385]">Reference file:</span> {activePattern.provenance.file}</div>
                  <p className="text-[#a0aab8] leading-relaxed pt-1">{activePattern.provenance.note}</p>
                </div>

                <DocsCodeBlock code={patternXml} lang="xml" label="Compiled MD XML Preview" />
              </div>
            )}
          </main>
        </div>
      )}

      {section === 'lua' && (
        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          <aside className="w-full md:w-80 shrink-0 border-b md:border-b-0 md:border-r border-[#262c36] bg-[#0a0c10] flex flex-col min-h-0 max-h-64 md:max-h-none">
            <div className="p-2.5 border-b border-[#262c36] flex flex-wrap gap-1.5 shrink-0">
              {LUA_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setLuaCategory(cat.id)}
                  className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                    luaCategory === cat.id
                      ? 'border-[#3b82f6]/50 bg-[#3b82f6]/15 text-[#93c5fd]'
                      : 'border-[#262c36] bg-[#11141a] text-[#a0aab8] hover:text-[#eef2f7]'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            <div className="px-3 py-1.5 text-[11px] font-medium text-[#687385] border-b border-[#262c36]/60 shrink-0">
              Guarded Lua snippets ({filteredSnippets.length})
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
              {filteredSnippets.length === 0 ? (
                <div className="rounded-md border border-[#262c36] bg-[#11141a] p-3 text-xs text-[#687385] text-center">
                  No snippets matched.
                </div>
              ) : (
                filteredSnippets.map(snippet => {
                  const isActive = activeSnippet?.id === snippet.id;
                  return (
                    <button
                      key={snippet.id}
                      type="button"
                      data-testid={`docs-lua-item-${snippet.id}`}
                      onClick={() => {
                        setSelectedSnippetId(snippet.id);
                        setLuaAppendedNotice(null);
                      }}
                      className={`w-full text-left rounded-lg border p-2.5 transition-colors cursor-pointer ${
                        isActive
                          ? 'border-[#3b82f6]/60 bg-[#3b82f6]/12 text-[#eef2f7]'
                          : 'border-[#262c36] bg-[#11141a] text-[#cbd5e1] hover:border-[#3b82f6]/35'
                      }`}
                    >
                      <div className="text-[11px] font-medium text-[#93c5fd] mb-0.5">{snippet.category}</div>
                      <div className="text-xs font-semibold text-[#eef2f7]">{snippet.title}</div>
                      <p className="mt-1 text-[11px] text-[#a0aab8] line-clamp-2 leading-relaxed">{snippet.description}</p>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <main className="flex-1 min-w-0 min-h-0 overflow-y-auto p-5 bg-[#0c0e12]">
            {!activeSnippet ? (
              <EmptyState
                title="No Lua snippets matched"
                description="Reset filters to inspect guarded RegisterEvent, AddUITriggeredEvent, and Helper.registerMenu snippets."
                icon={<FileCode className="w-5 h-5" />}
                dataTestId="docs-empty-state"
              />
            ) : (
              <div className="max-w-3xl mx-auto rounded-lg border border-[#262c36] bg-[#11141a] p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#262c36] pb-4">
                  <div className="min-w-0 space-y-1">
                    <StatusPill tone="info">{activeSnippet.category}</StatusPill>
                    <h3 className="text-base font-semibold text-[#eef2f7]">{activeSnippet.title}</h3>
                    <p className="text-xs text-[#a0aab8] leading-relaxed">{activeSnippet.description}</p>
                  </div>
                  <button
                    type="button"
                    data-testid="docs-append-lua-btn"
                    onClick={handleAppendLua}
                    className="h-8 px-3 rounded-md border border-[#3b82f6]/50 bg-[#3b82f6]/20 hover:bg-[#3b82f6]/30 inline-flex items-center gap-1.5 text-xs font-semibold text-[#eef2f7] transition-colors cursor-pointer shrink-0"
                  >
                    <FileCode className="w-3.5 h-3.5 text-[#93c5fd]" />
                    <span>Append to Custom Lua</span>
                  </button>
                </div>

                {luaAppendedNotice && (
                  <div className="rounded-md border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{luaAppendedNotice}</span>
                  </div>
                )}

                {activeSnippet.placeholders.length > 0 && (
                  <div className="rounded-lg border border-[#262c36] bg-[#0a0c10] p-3.5 space-y-3">
                    <div className="text-xs font-semibold text-[#eef2f7]">Fill template placeholders</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {activeSnippet.placeholders.map(token => {
                        const key = token.replace(/[<>]/g, '');
                        return (
                          <label key={key} className="block space-y-1">
                            <span className="block text-[11px] font-mono text-[#a0aab8]">{key}</span>
                            <input
                              type="text"
                              data-testid={`docs-lua-placeholder-${key}`}
                              value={activeSnippetValues[key] ?? ''}
                              onChange={e => {
                                const val = e.target.value;
                                setLuaValuesById(prev => ({
                                  ...prev,
                                  [activeSnippet.id]: {
                                    ...(prev[activeSnippet.id] || {}),
                                    [key]: val,
                                  },
                                }));
                              }}
                              placeholder={token}
                              className="w-full h-8 rounded-md border border-[#262c36] bg-[#11141a] px-2.5 text-xs font-mono text-[#eef2f7] placeholder:text-[#687385] focus:outline-none focus:border-[#3b82f6]"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                <DocsCodeBlock code={filledLuaPreview} lang="lua" label="Guarded X4 Lua Output" />
              </div>
            )}
          </main>
        </div>
      )}

      {section === 'recipes' && (
        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          <aside className="w-full md:w-80 shrink-0 border-b md:border-b-0 md:border-r border-[#262c36] bg-[#0a0c10] flex flex-col min-h-0 max-h-64 md:max-h-none">
            <div className="px-3 py-2 text-[11px] font-medium text-[#687385] border-b border-[#262c36]/60 shrink-0">
              Starter recipes ({filteredRecipes.length})
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
              {filteredRecipes.length === 0 ? (
                <div className="rounded-md border border-[#262c36] bg-[#11141a] p-3 text-xs text-[#687385] text-center">
                  No starter recipes matched.
                </div>
              ) : (
                filteredRecipes.map(recipe => {
                  const isActive = activeRecipe?.id === recipe.id;
                  return (
                    <button
                      key={recipe.id}
                      type="button"
                      data-testid={`docs-recipe-item-${recipe.id}`}
                      onClick={() => {
                        setSelectedRecipeId(recipe.id);
                        setConfirmLoadRecipe(false);
                        setRecipeLoadedNotice(null);
                      }}
                      className={`w-full text-left rounded-lg border p-2.5 transition-colors cursor-pointer ${
                        isActive
                          ? 'border-[#3b82f6]/60 bg-[#3b82f6]/12 text-[#eef2f7]'
                          : 'border-[#262c36] bg-[#11141a] text-[#cbd5e1] hover:border-[#3b82f6]/35'
                      }`}
                    >
                      <div className="text-xs font-semibold text-[#eef2f7]">{recipe.title}</div>
                      <p className="mt-1 text-[11px] text-[#a0aab8] line-clamp-2 leading-relaxed">{recipe.blurb}</p>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <main className="flex-1 min-w-0 min-h-0 overflow-y-auto p-5 bg-[#0c0e12]">
            {!activeRecipe || !activeRecipePreview ? (
              <EmptyState
                title="No starter recipes matched"
                description="Clear search filters to customize validated X4 starter recipes."
                icon={<Wand2 className="w-5 h-5" />}
                dataTestId="docs-empty-state"
              />
            ) : (
              <div className="max-w-3xl mx-auto rounded-lg border border-[#262c36] bg-[#11141a] p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#262c36] pb-4">
                  <div className="min-w-0 space-y-1">
                    <StatusPill tone="success" dot>Validated recipe generator</StatusPill>
                    <h3 className="text-base font-semibold text-[#eef2f7]">{activeRecipe.title}</h3>
                    <p className="text-xs text-[#a0aab8] leading-relaxed">{activeRecipe.blurb}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {!confirmLoadRecipe ? (
                      <button
                        type="button"
                        data-testid="docs-load-recipe-btn"
                        onClick={() => setConfirmLoadRecipe(true)}
                        className="h-8 px-3 rounded-md border border-[#3b82f6]/50 bg-[#3b82f6]/20 hover:bg-[#3b82f6]/30 inline-flex items-center gap-1.5 text-xs font-semibold text-[#eef2f7] transition-colors cursor-pointer"
                      >
                        <Wand2 className="w-3.5 h-3.5 text-[#93c5fd]" />
                        <span>Load Recipe Workspace</span>
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          data-testid="docs-confirm-recipe-btn"
                          onClick={handleConfirmLoadRecipe}
                          className="h-8 px-3 rounded-md border border-amber-500/50 bg-amber-500/20 hover:bg-amber-500/30 text-xs font-semibold text-amber-200 cursor-pointer"
                        >
                          Confirm Replace Workspace
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmLoadRecipe(false)}
                          className="h-8 px-2.5 rounded-md border border-[#262c36] bg-[#0a0c10] text-xs text-[#a0aab8] hover:text-[#eef2f7] cursor-pointer"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                    {onOpenBlueprint && recipeLoadedNotice && (
                      <button
                        type="button"
                        onClick={onOpenBlueprint}
                        className="h-8 px-3 rounded-md border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-xs font-medium text-emerald-200 cursor-pointer"
                      >
                        Open MD Canvas
                      </button>
                    )}
                  </div>
                </div>

                {recipeLoadedNotice && (
                  <div className="rounded-md border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{recipeLoadedNotice}</span>
                  </div>
                )}

                <div className="rounded-lg border border-[#262c36] bg-[#0a0c10] p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#eef2f7]">Parameters</span>
                    <span className="text-[11px] font-mono text-[#93c5fd]">Workspace: {activeRecipePreview.workspace.name}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {activeRecipe.questions.map(q => (
                      <label key={q.key} className="block space-y-1">
                        <span className="block text-xs font-medium text-[#cbd5e1]">{q.label}</span>
                        <input
                          type={q.type === 'number' ? 'number' : 'text'}
                          data-testid={`docs-recipe-input-${q.key}`}
                          value={activeRecipeAnswers[q.key] ?? ''}
                          onChange={e => {
                            const val = e.target.value;
                            setRecipeAnswersById(prev => ({
                              ...prev,
                              [activeRecipe.id]: {
                                ...(prev[activeRecipe.id] || {}),
                                [q.key]: val,
                              },
                            }));
                            setConfirmLoadRecipe(false);
                          }}
                          className="w-full h-8 rounded-md border border-[#262c36] bg-[#11141a] px-2.5 text-xs text-[#eef2f7] focus:outline-none focus:border-[#3b82f6]"
                        />
                        <span className="block text-[11px] text-[#687385]">{q.help}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <DocsCodeBlock code={activeRecipePreview.xml} lang="xml" label="Compiled Recipe XML Preview" />
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
