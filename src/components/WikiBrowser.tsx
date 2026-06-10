/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Book, 
  Code, 
  Cpu, 
  Copy, 
  Check, 
  Map, 
  Layers, 
  Scroll, 
  Compass, 
  FileCode, 
  Globe, 
  ExternalLink,
  ChevronRight,
  Database,
  Volume2,
  Sparkles,
  Zap
} from 'lucide-react';
import { X4_FACTIONS, X4_SHIP_MACROS, X4_STATION_MACROS, X4_SOUND_EFFECTS } from '../types';

interface WikiTopic {
  id: string;
  title: string;
  category: 'mdscript' | 'aiscript' | 'xmlpatch' | 'luaui' | 'reference';
  summary: string;
  content: string;
  codeTemplate?: string;
  egosoftUrl?: string;
}

const WIKI_TOPICS: WikiTopic[] = [
  {
    id: "mdscript_basics",
    title: "Mission Director (MD) Scripting Basics",
    category: "mdscript",
    summary: "Understand the core workflow, lifecycle, and execution hierarchy of Egosoft MD xml scripts.",
    content: "Mission Director (MD) scripts govern game events, missions, custom sector behaviors, and world-state logic. MD files reside inside `/md` and use the `.xml` extension. Logic is entirely triggered by hierarchical **cues**.\n\n### 1. The Cue Hierarchy\nCues form a dependency tree. A child cue can ONLY activate if its parent cue is already `completed` or `active`.\n- **instantiate**: If set to `true`, a new copy of the cue is spawned each time the condition triggers. Extremely useful for background triggers (e.g. listening for sector entrances repeatedly).\n- **namespace**: If set to `this`, all variables declared within the cue (using `name=\"$VarName\"`) are scoped locally, ensuring no memory leakage or naming conflicts.\n\n### 2. Cue Sections\n- **`<conditions>`**: Triggers that the game engine evaluates. Can be events (e.g. `<event_game_loaded/>`) or condition evaluations (e.g. `<check_value value=\"...\"/>`).\n- **`<actions>`**: Deterministic game logic executed immediately on trigger completion. Used to spawn fleets, grant credit, edit tables, create UI, etc.",
    codeTemplate: `<cue name="My_Startup_Trigger" instantiate="true" namespace="this">
  <conditions>
    <event_game_loaded />
  </conditions>
  <actions>
    <!-- Log verification message to the modding developer debug logbook -->
    <write_to_logbook category="general" text="'X4: Foundations Mod Studio - Active Workspace Loaded'" />
  </actions>
</cue>`,
    egosoftUrl: "https://wiki.egosoft.com/X4%20Foundations%20Wiki/Modding/Mission%20Director%20Introduction/"
  },
  {
    id: "mdscript_spawning_ships",
    title: "Spawning Ships under Player Wing",
    category: "mdscript",
    summary: "Learn how to dynamically specify ship macros, set faction trueowners, recruit pilots, and deploy escorts safely.",
    content: "Spawning fighters, capital ships, or transport freighters is central to custom escort and war logic. This is achieved via the `<create_ship>` element under the cue's `<actions>` segment.\n\n### Critical Positioning Rules\nTo prevent ship spawning directly inside stations or planets (which causes collision bugs or instant physics deaths), always wrap the coordinate inside a `<safepos>` wrapper. Set the target relative positioning anchor (e.g. relative to player play-ship or a specific sector gate).",
    codeTemplate: `<create_ship name="$HeavyEscort" macro="ship_arg_s_fighter_01_a_macro" faction="faction.player">
  <!-- Deploys ship safely within 3 kilometers of playerplayship -->
  <safepos object="player.playship" max="3km" />
  <pilot>
    <!-- Recruits a high-tier pilot automatically under player control -->
    <select faction="faction.player" tags="tag.aipilot" />
  </pilot>
</create_ship>`,
    egosoftUrl: "https://wiki.egosoft.com/X4%20Foundations%20Wiki/Modding/MD%20Script%20Elements/create_ship"
  },
  {
    id: "mdscript_event_handling",
    title: "Sector Entrances & Threat Detection Triggers",
    category: "mdscript",
    summary: "Capture location changes, intercept player gate transitions, and evaluate sector ownership dynamically.",
    content: "Capturing when a ship or the player transitions between system gates is vital for ambush systems, custom missions, and sector-wide alert tracking.\n\n### Common Location Hooks\n- **`event_object_changed_sector`**: Activates whenever a tracked entity crosses a gate boundary.\n- **`event_object_changed_owner`**: Intercepts sector ownership changes. Highly relevant for dynamic expansion campaigns.",
    codeTemplate: `<cue name="On_Player_Enter_Sector" instantiate="true" namespace="this">
  <conditions>
    <event_object_changed_sector object="player.playship" />
  </conditions>
  <actions>
    <set_value name="$EnteredSector" exact="event.object.sector" />
    <show_help duration="10s" custom="'Warning: Entered system ' + $EnteredSector.knownname" />
  </actions>
</cue>`,
    egosoftUrl: "https://wiki.egosoft.com/X4%20Foundations%20Wiki/Modding/MD%20Script%20Elements/event_object_changed_sector"
  },
  {
    id: "aiscript_basics",
    title: "AIScript & Pilot Behaviors Overview",
    category: "aiscript",
    summary: "AIScript handles low-level pilot actions, pathfinding, trade routes, combat flight AI, and task automation loops.",
    content: "While Mission Director scripts manage higher-level game state and story cues, **AIScripts** run inside pilot cockpit computation frames. AIScripts reside in `/aiscripts` and define the dynamic loop profiles of ships.\n\n### Architecture of an AIScript\n- **`<params>`**: Configuration parameters passed from superior orders or GUI menus.\n- **`<interrupts>`**: Specialized exception loops. If a ship takes damage, receives a flee signal, or sees a xenon gate spawn, it pauses the action queue and runs the associated interrupt actions.\n- **`<actions>`**: Sequential imperative loops. Use elements like `<move_to>`, `<dock_at>`, `<wait>`, and `<shoot>` to control the ship macro.",
    codeTemplate: `<?xml version="1.0" encoding="utf-8"?>
<aiscript name="order.patrol.custom" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <params>
    <param name="destination" type="object" default="this.ship.sector" />
    <param name="range" type="length" default="10km" />
  </params>
  <actions>
    <do_while value="this.ship.isoperational">
      <move_to object="this.destination" destination="this.destination" />
      <wait min="10s" max="20s" />
    </do_while>
  </actions>
</aiscript>`,
    egosoftUrl: "https://wiki.egosoft.com/X4%20Foundations%20Wiki/Modding/AIScript%20Overview/"
  },
  {
    id: "aiscript_commands",
    title: "AIScript Core Pilot Commands Reference",
    category: "aiscript",
    summary: "A cheatsheet covering the primary pilot navigation, trade routine, and combat targeting code tags.",
    content: "When writing custom scripts for ships inside `/aiscripts`, these basic pilot action tags are essential:\n\n- **`<move_to>`**: Instructs pilot to orient and burn toward physical target coordinates.\n- **`<dock_at>`**: Initiates matching orbit paths, alignments, landing pad requests, and final docking clamps connection.\n- **`<wait>`**: Holds ship operation queue for random/fixed durations to prevent CPU throttling.\n- **`<find_objects>`**: Performs proximity radar sweeps to collect local asteroids, hostile ships, or tradestation facilities under filter rules.",
    codeTemplate: `<attention min="visible">
  <actions>
    <move_to object="this.ship" destination="this.destination" forceposition="true" />
    <wait min="5s" max="15s" />
  </actions>
</attention>`,
    egosoftUrl: "https://wiki.egosoft.com/X4%20Foundations%20Wiki/Modding/AIScripts/Pilot%20Actions"
  },
  {
    id: "xmlpatch_diff",
    title: "XML Patching & Diff File Mechanics",
    category: "xmlpatch",
    summary: "X4 Foundation relies on XML diff patching to append, modify, or delete elements inside Egosoft core game files safely.",
    content: "In X4 Foundations, you **NEVER** overwrite complete, default game data files (e.g. `wares.xml`). Overwriting causes game crashes or breaks compatibility with other mods. Instead, we write **XML Patch Files** (Diffs).\n\n### 1. XML Diff Structure\nYour patch file must reside at the same relative directory path (e.g., `/libraries/wares.xml`) but begin with the root tag `<diff>`.\n\n### 2. Available Patch operations\n- **`add`**: appends new nodes at an XPath location.\n- **`replace`**: replaces an existing node's property or full element.\n- **`remove`**: deletes a node or attribute.\n- **`sel`**: XPath selector expression targeting the exact game element (e.g. `sel=\"/wares/ware[@id='energycells']/price\"`).",
    codeTemplate: `<?xml version="1.0" encoding="utf-8"?>
<diff>
  <!-- Injects a new high-importance custom weapon modification into core shield generators listings -->
  <add sel="/libraries/wares">
    <ware id="ware.mod_shield_custom" name="Titanium Supercharger Shield Mod">
      <price min="10000" average="15000" max="20000" />
    </ware>
  </add>
</diff>`,
    egosoftUrl: "https://wiki.egosoft.com/X4%20Foundations%20Wiki/Modding/XML%20Patching%20Introduction/"
  },
  {
    id: "luaui_overview",
    title: "Lua UI Customization & HUD Extensions",
    category: "luaui",
    summary: "How X4 translates visual interface layout schemas into functional LUA overlays and in-cockpit display charts.",
    content: "X4 Foundations utilizes custom-compiled LUA modules and in-game UI templates to render HUD dashboards, crosshair indicators, sector operations charts, and weapon terminal maps.\n\n### UI Blueprint Translation\nWhen designing custom HUD widgets, they must be formatted into clean XML templates representation. These are rendered inside parent containers, styled securely, and mapped directly to triggers or signal callbacks inside MD script variables. This allows pilot actions to trigger real-time progress bar movements or alert sounds!",
    codeTemplate: `<ui_layout>
  <!-- Visual frame map representation for tactical dashboards -->
  <window name="Tactical_Operations_Console" x="120" y="80" w="400" h="300">
    <header text="TACTICAL ALERT OVERVIEW" />
    <progressbar value="90" color="#ff2200" text="Shield Capacitor" />
    <button text="DECLARE RED ALERT" signal="My_Alert_Trigger" />
  </window>
</ui_layout>`,
    egosoftUrl: "https://wiki.egosoft.com/X4%20Foundations%20Wiki/Modding/Lua%20UI%20Customization/"
  }
];

export default function WikiBrowser() {
  const [activeTab, setActiveTab] = useState<'mdscript' | 'aiscript' | 'xmlpatch' | 'luaui' | 'reference'>('mdscript');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Reference search state
  const [refSearch, setRefSearch] = useState<string>('');
  const [refType, setRefType] = useState<'factions' | 'ships' | 'stations' | 'sounds'>('ships');

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

  // Filter reference constants
  const filteredReferences = useMemo(() => {
    let list: Array<{ id: string; name: string; desc?: string }> = [];
    if (refType === 'factions') {
      list = X4_FACTIONS.map(f => ({ 
        id: `faction.${f}`, 
        name: f.toUpperCase(), 
        desc: "Faction Code Key" 
      }));
    } else if (refType === 'ships') {
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
    } else if (refType === 'stations') {
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
    } else if (refType === 'sounds') {
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
  }, [refType, refSearch]);

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
            <Database className="w-3.5 h-3.5" />
            Wares & Sounds Lookup
          </button>
        </div>

        {/* Global keyword search bar (Omit if active tab is Reference database) */}
        {activeTab !== 'reference' && (
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
        )}
      </div>

      {/* Main split viewport area */}
      <div className="flex-1 overflow-hidden flex">
        
        {/* IF REFERENCE TAB is selected, render our customized lookups instead of regular text articles */}
        {activeTab === 'reference' ? (
          <div className="flex flex-1 overflow-hidden">
            
            {/* Left selector sidebar: Choose factions / ships / stations / sounds */}
            <div className="w-52 bg-[#090b11] border-r border-white/5 p-3 flex flex-col gap-1.5 shrink-0 justify-between">
              <div className="flex flex-col gap-1 font-mono text-[10px]">
                <span className="text-[9px] text-slate-500 uppercase font-black px-1.5 tracking-wider mb-1">Lookups Categories</span>
                
                <button
                  onClick={() => { setRefType('ships'); setRefSearch(''); }}
                  className={`p-2 rounded text-left flex items-center gap-2 cursor-pointer transition-all ${
                    refType === 'ships' ? 'bg-amber-500/10 text-amber-400' : 'text-slate-400 hover:bg-white/[0.02] hover:text-slate-200'
                  }`}
                >
                  <Compass className="w-3.5 h-3.5" />
                  Ship Macros ({X4_SHIP_MACROS.length})
                </button>

                <button
                  onClick={() => { setRefType('stations'); setRefSearch(''); }}
                  className={`p-2 rounded text-left flex items-center gap-2 cursor-pointer transition-all ${
                    refType === 'stations' ? 'bg-amber-500/10 text-amber-400' : 'text-slate-400 hover:bg-white/[0.02] hover:text-slate-200'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  Station Macros ({X4_STATION_MACROS.length})
                </button>

                <button
                  onClick={() => { setRefType('factions'); setRefSearch(''); }}
                  className={`p-2 rounded text-left flex items-center gap-2 cursor-pointer transition-all ${
                    refType === 'factions' ? 'bg-amber-500/10 text-amber-400' : 'text-slate-400 hover:bg-white/[0.02] hover:text-slate-200'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  Factions Dictionary ({X4_FACTIONS.length})
                </button>

                <button
                  onClick={() => { setRefType('sounds'); setRefSearch(''); }}
                  className={`p-2 rounded text-left flex items-center gap-2 cursor-pointer transition-all ${
                    refType === 'sounds' ? 'bg-amber-500/10 text-amber-400' : 'text-slate-400 hover:bg-white/[0.02] hover:text-slate-200'
                  }`}
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  Sound Effects ({X4_SOUND_EFFECTS.length})
                </button>
              </div>

              <div id="quick-ref-sidebar-instruction" className="p-2 border border-[#df9825]/10 bg-amber-500/[0.02] rounded text-[10px] leading-relaxed text-slate-500 text-center font-mono">
                Click copy icons to copy XML schema ID keys directly into code properties.
              </div>
            </div>

            {/* List lookup area */}
            <div className="flex-1 flex flex-col overflow-hidden bg-[#0d1017]">
              
              {/* Type specific search input filter */}
              <div className="p-3 border-b border-white/5 bg-[#10141e] shrink-0">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="text"
                    value={refSearch}
                    onChange={(e) => setRefSearch(e.target.value)}
                    placeholder={`Fast filter X4 ${refType} entries by name, macro key, or properties...`}
                    className="w-full bg-[#07090d] border border-white/10 rounded-lg px-2.5 py-1.5 pl-8 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                    autoFocus
                  />
                </div>
              </div>

              {/* Entries Grid scroll viewport */}
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {filteredReferences.length === 0 ? (
                  <div className="h-full flex items-center justify-center p-8 bg-black/10 rounded-lg text-slate-500 italic text-xs font-mono">
                    No registry rows fit that specific filter criteria. Try refining your spelling.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {filteredReferences.map(ref => (
                      <div 
                        key={ref.id}
                        className="bg-[#121622] border border-white/[0.03] rounded-lg p-3 hover:border-amber-500/20 hover:bg-[#141a28] flex items-center justify-between group transition-all"
                      >
                        <div className="flex flex-col gap-1 pr-4 overflow-hidden">
                          <span className="font-bold text-white text-xs font-mono truncate">{ref.name}</span>
                          <span className="text-[10px] text-amber-500 font-mono select-all truncate">{ref.id}</span>
                          {ref.desc && (
                            <span className="text-[9px] text-slate-500 font-sans truncate tracking-wider font-semibold uppercase">{ref.desc}</span>
                          )}
                        </div>
                        <button
                          onClick={() => handleCopyCode(ref.id, ref.id)}
                          className="p-2 rounded bg-white/[0.02] border border-white/5 group-hover:border-amber-500/30 group-hover:text-amber-400 hover:bg-amber-500/10 transition-all cursor-pointer shrink-0"
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

          </div>
        ) : (
          /* OTHERWISE, render regularly formatted Wiki Tutorial Articles */
          <div className="flex-1 flex overflow-hidden">
            
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
                {filteredTopics.map((topic, offsetIdx) => (
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
                          className="p-2 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-500 text-amber-400 hover:text-amber-300 font-mono text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer select-none"
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
        )}

      </div>

    </div>
  );
}
