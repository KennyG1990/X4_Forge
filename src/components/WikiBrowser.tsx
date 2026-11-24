/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Book, 
  Code, 
  Copy, 
  Check, 
  Layers, 
  Scroll, 
  Compass, 
  FileCode, 
  Globe, 
  ChevronRight,
  Pin,
  ExternalLink,
  Sparkles
} from 'lucide-react';
import { MDNode, ModWorkspace } from '../types';
import { WIKI_TOPICS, type WikiTopic } from '../lib/forgeKnowledge';

export { WIKI_TOPICS, type WikiTopic };

interface WikiBrowserProps {
  selectedNode: MDNode | null;
  setSelectedNode: React.Dispatch<React.SetStateAction<MDNode | null>>;
  setWorkspace: React.Dispatch<React.SetStateAction<ModWorkspace>>;
}

export default function WikiBrowser({ selectedNode, setSelectedNode, setWorkspace }: WikiBrowserProps) {
  const [activeTab, setActiveTab] = useState<'mdscript' | 'aiscript' | 'xmlpatch' | 'luaui' | 'reference'>('mdscript');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filter topics based on category and search query
  const filteredTopics = useMemo(() => {
    return WIKI_TOPICS.filter(topic => {
      const matchesCategory = topic.category === activeTab;
      const matchesSearch = 
        topic.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        topic.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        topic.content.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [activeTab, searchQuery]);

  const handleCopyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const triggerAICopilot = (topicTitle: string, template?: string) => {
    const aiPrompt = `Hi! I was reading the X4: Foundations Wiki page about "${topicTitle}" inside the modding suite. Can you help explain this further? ${
      template ? `Provide a highly optimized XML script example based on this template:\n\n${template}` : ""
    }`;
    
    // Dispatch custom browser event to open Chatbot Drawer and submit the question
    const event = new CustomEvent('open-ai-chat', {
      detail: { prompt: aiPrompt }
    });
    window.dispatchEvent(event);
  };

  return (
    <div id="wiki-browser-panel" className="flex flex-col h-full bg-[#0d1017] text-slate-200">
      
      {/* Title Subheader */}
      <div className="bg-[#111622] p-4 border-b border-white/5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Book className="w-5 h-5 text-amber-500" />
          <h2 className="font-bold text-white text-sm tracking-wider uppercase font-mono">X4 Foundations Wiki & Modding Codex</h2>
        </div>
        <div className="text-[10px] text-amber-500/80 font-mono flex items-center gap-1.5 bg-amber-500/5 px-2 py-0.5 rounded border border-amber-500/20">
          <Globe className="w-3.5 h-3.5" />
          NATIVE DATABASE INTEGRATION
        </div>
      </div>

      {/* Main categories Tab Header */}
      <div className="flex items-center justify-between border-b border-white/5 bg-[#141a27] p-2 shrink-0">
        <div className="flex items-center gap-1 font-mono text-[10px]">
          <button
            onClick={() => { setActiveTab('mdscript'); setSearchQuery(''); }}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'mdscript' 
                ? 'bg-amber-600/20 text-amber-400 border border-amber-500/30' 
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            MD Scripting
          </button>
          
          <button
            onClick={() => { setActiveTab('aiscript'); setSearchQuery(''); }}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'aiscript' 
                ? 'bg-amber-600/20 text-amber-400 border border-amber-500/30' 
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Scroll className="w-3.5 h-3.5" />
            AIScripts
          </button>

          <button
            onClick={() => { setActiveTab('xmlpatch'); setSearchQuery(''); }}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'xmlpatch' 
                ? 'bg-amber-600/20 text-amber-400 border border-amber-500/30' 
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            XML Patching
          </button>

          <button
            onClick={() => { setActiveTab('luaui'); setSearchQuery(''); }}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'luaui' 
                ? 'bg-amber-600/20 text-amber-400 border border-amber-500/30' 
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            HUD & LUA
          </button>

          <button
            onClick={() => { setActiveTab('reference'); setSearchQuery(''); }}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'reference'
                ? 'bg-amber-600/20 text-amber-400 border border-amber-500/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Book className="w-3.5 h-3.5" />
            Reference
          </button>

        </div>

        {/* Global keyword search bar */}
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search codex indexes..."
            className="w-full bg-[#0a0c11] border border-white/10 rounded-lg px-2 py-1 pl-8 text-[11px] font-mono text-white focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Main split viewport area */}
      <div className="flex-1 overflow-hidden flex">
        
        {/* Left list of matched wiki topic card buttons */}
        <div className="w-64 bg-[#090b11] border-r border-white/5 overflow-y-auto p-2 shrink-0 custom-scrollbar flex flex-col gap-2">
          <span className="text-[9px] text-slate-500 uppercase font-black px-1.5 tracking-wider mb-0.5 mt-1 font-mono">Codex Index matches ({filteredTopics.length})</span>
          
          {filteredTopics.length === 0 ? (
            <div className="text-center py-8 text-slate-500 italic text-[11px] font-mono bg-black/10 rounded-lg">
              No codex topics found.
            </div>
          ) : (
            filteredTopics.map(topic => (
              <div
                key={topic.id}
                className="p-3 bg-[#111520] border border-white/[0.02] rounded-lg hover:border-amber-500/20 hover:bg-[#141b2a] group transition-all text-left flex flex-col gap-1.5"
              >
                <span className="font-bold text-slate-100 group-hover:text-white text-xs truncate leading-snug">{topic.title}</span>
                <p className="text-[10px] text-slate-400 font-sans line-clamp-2 leading-relaxed shrink-0 select-none">{topic.summary}</p>
                <a
                  href={`#article_${topic.id}`}
                  className="text-[9px] text-amber-500 group-hover:text-amber-400 font-mono tracking-wider font-bold uppercase flex items-center gap-1.5 mt-1 self-end select-none"
                >
                  READ GUIDE
                  <ChevronRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                </a>
              </div>
            ))
          )}
            </div>

            {/* Right side: Scrolled reader area showing extended guides data */}
            <div className="flex-1 overflow-y-auto p-6 bg-[#0d1017] custom-scrollbar scroll-smooth">
              <div className="max-w-3xl mx-auto space-y-12">
                {filteredTopics.map((topic, _offsetIdx) => (
                  <article 
                    id={`article_${topic.id}`}
                    key={topic.id} 
                    className="bg-[#111521] border border-white/[0.04] rounded-xl shadow-2xl p-6 transition-all relative overflow-hidden"
                  >
                    
                    {/* Visual glowing border accent */}
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
                    
                    {/* Header info */}
                    <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-4 mb-4 select-text">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[9px] text-[#df9825] font-mono tracking-widest font-black uppercase bg-[#df9825]/15 px-2 py-0.5 rounded border border-[#df9825]/20 self-start">
                          {topic.category.toUpperCase()}
                        </span>
                        <h3 className="font-bold text-white text-sm md:text-base leading-tight font-sans tracking-tight">{topic.title}</h3>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {/* Pin / Unpin Button */}
                        <button
                          onClick={() => {
                            if (!selectedNode) return;
                            const isPinnedNow = selectedNode.properties?.pinnedArticleId === topic.id;
                            const nextArticleId = isPinnedNow ? null : topic.id;
                            
                            setWorkspace(prev => ({
                              ...prev,
                              nodes: prev.nodes.map(n => 
                                n.id === selectedNode.id 
                                  ? { ...n, properties: { ...n.properties, pinnedArticleId: nextArticleId } }
                                  : n
                              )
                            }));
                            setSelectedNode(prev => prev ? { 
                              ...prev, 
                              properties: { ...prev.properties, pinnedArticleId: nextArticleId } 
                            } : null);
                          }}
                          disabled={!selectedNode}
                          className={`p-2 py-1.5 rounded-lg border font-mono text-[10px] font-bold uppercase flex items-center gap-1.5 transition-all select-none ${
                            !selectedNode
                              ? 'bg-slate-800/20 border-white/5 text-slate-500 cursor-not-allowed'
                              : selectedNode.properties?.pinnedArticleId === topic.id
                              ? 'bg-red-500/15 hover:bg-red-500/25 border-red-500/35 text-red-400 cursor-pointer'
                              : 'bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/20 hover:border-cyan-500 text-cyan-400 hover:text-cyan-300 cursor-pointer'
                          }`}
                          title={
                            !selectedNode 
                              ? "Select any node on the Canvas to pin this documentation reference to it"
                              : selectedNode.properties?.pinnedArticleId === topic.id
                              ? `Unpin documentation from node '${selectedNode.label}'`
                              : `Pin this documentation reference to node '${selectedNode.label}'`
                          }
                        >
                          <Pin className="w-3.5 h-3.5" />
                          {!selectedNode 
                            ? 'Canvas node not selected' 
                            : selectedNode.properties?.pinnedArticleId === topic.id
                            ? 'Unpin Code' 
                            : `Pin to ${selectedNode.label}`}
                        </button>

                        {topic.egosoftUrl && (
                          <a
                            href={topic.egosoftUrl}
                            target="_blank"
                            referrerPolicy="no-referrer"
                            className="p-2 rounded bg-white/[0.02] border border-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-all flex items-center font-mono text-[9px] uppercase font-bold gap-1 cursor-pointer select-none"
                            title="Open official Egosoft documentation wiki"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Official Wiki
                          </a>
                        )}
                        
                        <button
                          onClick={() => triggerAICopilot(topic.title, topic.codeTemplate)}
                          className="p-2 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/25 border border-amber-500/30 hover:border-amber-500 text-amber-400 hover:text-amber-300 font-mono text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer select-none"
                          title="Ask the AI copilot to explain this script logic"
                        >
                          <Sparkles className="w-3.5 h-3.5 animate-pulse text-amber-500" />
                          COGNITIVE ASSIST
                        </button>
                      </div>
                    </div>

                    {/* Extended text description */}
                    <div className="text-slate-300 text-xs leading-relaxed font-sans space-y-4 prose prose-invert select-text max-w-none">
                      {topic.content.split('\n\n').map((paragraph, pIdx) => {
                        if (paragraph.startsWith('###')) {
                          return <h4 key={`p_${pIdx}`} className="font-bold text-white text-xs pt-2 font-mono uppercase tracking-wider">{paragraph.replace('###', '').trim()}</h4>;
                        }
                        if (paragraph.startsWith('-')) {
                          return (
                            <ul key={`p_${pIdx}`} className="list-disc pl-5 space-y-1">
                              {paragraph.split('\n').map((li, lIdx) => (
                                <li key={`li_${lIdx}`}>{li.replace('-', '').trim()}</li>
                              ))}
                            </ul>
                          );
                        }
                        return <p key={`p_${pIdx}`}>{paragraph}</p>;
                      })}
                    </div>

                    {/* Copy-pasteable coding examples blocks */}
                    {topic.codeTemplate && (
                      <div className="mt-5 border border-white/5 rounded-lg bg-[#07090e] p-4 relative group/code select-text">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[9px] text-slate-500 font-mono uppercase tracking-widest font-bold flex items-center gap-1 select-none">
                            <Code className="w-3 h-3" />
                            Copy XML Snippet Template
                          </span>
                          <button
                            onClick={() => handleCopyCode(topic.codeTemplate || '', `code_${topic.id}`)}
                            className="p-1 px-2 border border-white/10 rounded text-[9.5px] uppercase font-mono font-bold flex items-center gap-1 bg-[#10141d]/80 text-[#df9825] hover:border-[#df9825]/60 hover:text-white transition-all cursor-pointer group-hover/code:border-amber-500/40 select-none"
                          >
                            {copiedId === `code_${topic.id}` ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-emerald-400">COPIED</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy Code</span>
                              </>
                            )}
                          </button>
                        </div>
                        <pre className="text-[10.5px] text-[#2fe4ff] font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto text-left select-all bg-black/30 p-3.5 rounded border border-white/[0.02]">
                          {topic.codeTemplate}
                        </pre>
                      </div>
                    )}

                  </article>
                ))}
              </div>
            </div>

      </div>

    </div>
  );
}
