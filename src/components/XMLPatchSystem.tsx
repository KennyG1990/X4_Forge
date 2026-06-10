/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  GitFork, 
  Plus, 
  Trash, 
  Sliders, 
  Sparkles, 
  HelpCircle, 
  Database, 
  Code2, 
  Check, 
  Flame,
  Globe,
  Settings,
  Bookmark,
  Search,
  Copy,
  PlusCircle,
  FileText,
  BadgeAlert
} from 'lucide-react';
import { ModWorkspace } from '../types';

interface XMLPatchSystemProps {
  workspace: ModWorkspace;
  setWorkspace: React.Dispatch<React.SetStateAction<ModWorkspace>>;
}

export interface PatchBlock {
  id: string;
  sel: string;
  action: 'add' | 'replace' | 'remove';
  content: string;
  note: string;
  targetFile?: string;
}

export interface BoilerplateSnippet {
  id: string;
  name: string;
  description: string;
  targetFile: string;
  sel: string;
  action: 'add' | 'replace' | 'remove';
  content: string;
}

export const BUILTIN_BOILERPLATES: BoilerplateSnippet[] = [
  {
    id: 'bp_new_ware',
    name: 'Add Custom Ware Def',
    description: 'XML layout to define a new commodity or trade ware inside libraries/wares.xml.',
    targetFile: 'libraries/wares.xml',
    sel: '/wares',
    action: 'add',
    content: `<ware id="ware_custom_darkmatter" name="Dark Matter Cannisters" description="Highly compressed gravitationally isolated dark matter." transport="container" volume="10" tags="economy equipment">
  <price min="1200" average="2500" max="4800" />
  <production time="60" amount="1" method="default" name="Dark Matter Synthesis">
    <primary>
      <ware ware="energycells" amount="100" />
      <ware ware="reachtransformers" amount="2" />
    </primary>
  </production>
</ware>`
  },
  {
    id: 'bp_patrol_job',
    name: 'Create Fighter Job Def',
    description: 'Spawns automatic defensive fleets or patrol squads in libraries/jobs.xml.',
    targetFile: 'libraries/jobs.xml',
    sel: '/jobs',
    action: 'add',
    content: `<job id="job_patrol_heavy_wing" name="Local Border Elite Squad" active="true font">
  <expiration min="7200" max="14400" />
  <modifiers rebuild="true" />
  <ship>
    <select faction="argon" tags="military fighter" />
    <loadout><level min="0.8" max="1.0" /></loadout>
  </ship>
  <quota galaxy="5" sector="1" />
  <task script="patrol.heavy.task" />
</job>`
  },
  {
    id: 'bp_engine_speed',
    name: 'Ship Engine Speed Overdrive',
    description: 'Increases pitch, roll, yaw, and forward speed multiplier inside libraries/ship_macros.xml.',
    targetFile: 'libraries/ship_macros.xml',
    sel: '/macros/macro[@name="engine_arg_s_travel_01_macro"]/properties/thrust',
    action: 'replace',
    content: `<thrust pitch="2.5" roll="3.0" yaw="2.5" forward="350" reverse="150" />`
  },
  {
    id: 'bp_faction_entry',
    name: 'Register Custom Faction Def',
    description: 'Overrides faction standings, icons, and starting metrics in libraries/factions.xml.',
    targetFile: 'libraries/factions.xml',
    sel: '/factions',
    action: 'add',
    content: `<faction id="syndicate_outlaws" name="Custom Syndicate Outlaws" primaryrace="argon" shortname="SYN">
  <relations>
    <relation faction="player" value="0.1" />
    <relation faction="argon" value="-0.8" />
    <relation faction="xenon" value="-1.0" />
  </relations>
  <icon active="faction_syndicate_active" />
</faction>`
  },
  {
    id: 'bp_custom_cue',
    name: 'Mission Director Cue Template',
    description: 'Injects a standard game entry event-handler script template inside libraries/mission_director.xml.',
    targetFile: 'libraries/mission_director.xml',
    sel: '/mdscript/cues',
    action: 'add',
    content: `<cue name="Custom_Vessel_Reward_Event" instantiate="true">
  <conditions>
    <event_cue_signalled cue="md.Setup.Start" />
  </conditions>
  <actions>
    <create_ship name="$RewardShip" macro="ship_arg_s_fighter_01_a_macro" faction="faction.player">
      <space object="player.sector" />
    </create_ship>
  </actions>
</cue>`
  },
  {
    id: 'bp_shield_recharging',
    name: 'Ship Shield Def Tuning',
    description: 'Tweak ship shields direct regeneration and delays in libraries/ship_macros.xml.',
    targetFile: 'libraries/ship_macros.xml',
    sel: '/macros/macro[@name="ship_arg_xl_carrier_01_a_macro"]/properties/shield',
    action: 'add',
    content: `<rebuild rate="35" delay="1s" />`
  }
];

export default function XMLPatchSystem({ workspace, setWorkspace }: XMLPatchSystemProps) {
  const [targetFile, setTargetFile] = useState<string>('libraries/ship_macros.xml');
  
  const [sidebarTab, setSidebarTab] = useState<'recipes' | 'boilerplates' | 'tree'>('tree');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedSnippetId, setCopiedSnippetId] = useState<string | null>(null);

  // New customizable forms inside the boilerplates section
  const [isCreatingCustomBP, setIsCreatingCustomBP] = useState(false);
  const [newBPRelativePath, setNewBPRelativePath] = useState('libraries/wares.xml');
  const [newBPName, setNewBPName] = useState('');
  const [newBPDescription, setNewBPDescription] = useState('');
  const [newBPSel, setNewBPSel] = useState('/wares');
  const [newBPAction, setNewBPAction] = useState<'add' | 'replace' | 'remove'>('add');
  const [newBPContent, setNewBPContent] = useState('');

  const [customSnippets, setCustomSnippets] = useState<BoilerplateSnippet[]>(() => {
    try {
      const saved = localStorage.getItem('x4_custom_xml_snippets');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const handleSaveBlockAsBoilerplate = (b: PatchBlock) => {
    const newBP: BoilerplateSnippet = {
      id: `custom_bp_${Date.now()}`,
      name: b.note || `Custom Patch: ${b.sel.substring(0, 16)}`,
      description: `Saved from active workbench on target file: ${b.targetFile || targetFile}`,
      targetFile: b.targetFile || targetFile,
      sel: b.sel,
      action: b.action,
      content: b.content
    };
    const updated = [newBP, ...customSnippets];
    setCustomSnippets(updated);
    localStorage.setItem('x4_custom_xml_snippets', JSON.stringify(updated));
    setSidebarTab('boilerplates');
    alert(`"${newBP.name}" has been successfully saved to your XML Boilerplates library!`);
  };

  const handleCreateCustomBoilerplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBPName.trim()) return alert("Please enter a name for the boilerplate.");
    
    const newBP: BoilerplateSnippet = {
      id: `custom_bp_${Date.now()}`,
      name: newBPName,
      description: newBPDescription || 'Custom user-saved XML boilerplate',
      targetFile: newBPRelativePath,
      sel: newBPSel,
      action: newBPAction,
      content: newBPContent
    };
    
    const updated = [newBP, ...customSnippets];
    setCustomSnippets(updated);
    localStorage.setItem('x4_custom_xml_snippets', JSON.stringify(updated));
    
    // reset form
    setNewBPName('');
    setNewBPDescription('');
    setNewBPSel('/wares');
    setNewBPAction('add');
    setNewBPContent('');
    setIsCreatingCustomBP(false);
  };

  const handleDeleteCustomSnippet = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customSnippets.filter(s => s.id !== id);
    setCustomSnippets(updated);
    localStorage.setItem('x4_custom_xml_snippets', JSON.stringify(updated));
  };

  const handleApplyBoilerplate = (bp: BoilerplateSnippet) => {
    const newBlock: PatchBlock = {
      id: `p_block_${Date.now()}`,
      sel: bp.sel,
      action: bp.action,
      content: bp.content,
      note: bp.name,
      targetFile: bp.targetFile
    };
    savePatches([...patchBlocks, newBlock]);
    if (bp.targetFile) {
      setTargetFile(bp.targetFile);
    }
  };

  const handleCopyToClipboardAndNotify = (bp: BoilerplateSnippet, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(bp.content);
    setCopiedSnippetId(bp.id);
    setTimeout(() => setCopiedSnippetId(null), 1500);
  };

  // Custom patch block states
  const defaultPatches: PatchBlock[] = [
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

  const patchBlocks = workspace.xmlPatches || [];
  const filteredBlocks = patchBlocks.filter(b => !b.targetFile || b.targetFile === targetFile);

  const savePatches = (newPatches: PatchBlock[]) => {
    setWorkspace(prev => ({
      ...prev,
      xmlPatches: newPatches
    }));
  };

  const handleAddPatchBlock = (action: 'add' | 'replace' | 'remove') => {
    let sel = '/';
    let content = '';
    let note = '';

    if (action === 'add') {
      sel = '/components/component[@name="ship_storage"]/properties';
      content = '<storage volume="1500" type="container" />';
      note = 'Add container volume to station storage pods';
    } else if (action === 'replace') {
      sel = '/soundlibrary/sound[@id="alarm_red"]/volume';
      content = '<volume level="0.8" />';
      note = 'Reduce sound volume of red alarms';
    } else {
      sel = '/police/scanners/frequent_checks';
      content = '';
      note = 'Mute space police scan timers';
    }

    const nBlock: PatchBlock = {
      id: `p_block_${Date.now()}`,
      sel,
      action,
      content,
      note,
      targetFile
    };

    savePatches([...patchBlocks, nBlock]);
  };

  const handleDeletePatchBlock = (id: string) => {
    savePatches(patchBlocks.filter(b => b.id !== id));
  };

  const handleUpdatePatchBlock = (id: string, key: keyof PatchBlock, val: any) => {
    const next = patchBlocks.map(b => {
      if (b.id === id) {
        return { ...b, [key]: val };
      }
      return b;
    });
    savePatches(next);
  };

  // Recipe templates loader
  const handleLoadRecipe = (recipeKey: 'carrier_hangar' | 'combat_music' | 'shield_stats') => {
    let raw: PatchBlock;
    if (recipeKey === 'carrier_hangar') {
      raw = {
        id: `recipe_${Date.now()}`,
        sel: '/macros/macro[@name="ship_tel_xl_carrier_01_a_macro"]/properties/hangars',
        action: 'replace',
        content: '<dock capacity="80" class="ship_s" />\n    <dock capacity="20" class="ship_m" />',
        note: 'Expand XL Carrier drone & squad hangar counts',
        targetFile: 'libraries/ship_macros.xml'
      };
    } else if (recipeKey === 'combat_music') {
      raw = {
        id: `recipe_${Date.now()}`,
        sel: '/soundlibrary/playlist[@id="combat_music_playlist"]',
        action: 'add',
        content: '<track path="sound/music/custom_battle_drum" intensity="high" />',
        note: 'Inject deep custom war drum playlist track',
        targetFile: 'libraries/sound_library.xml'
      };
    } else {
      raw = {
        id: `recipe_${Date.now()}`,
        sel: '/parameters/shield[@id="boost_shield_regen"]/modifiers',
        action: 'replace',
        content: '<multiplier value="2.5" />',
        note: 'Boost combat overdrive shield multipliers',
        targetFile: 'libraries/ship_macros.xml'
      };
    }

    savePatches([...patchBlocks, raw]);
  };

  // Compile full patch document XML
  const compileDiffDocument = (): string => {
    const activeBlocks = patchBlocks.filter(b => !b.targetFile || b.targetFile === targetFile);
    let xml = `<?xml version="1.0" encoding="utf-8"?>
<!-- XML Diff patch targeting file: "${targetFile}" -->
<!-- Applied safely into the central Egosoft index registry -->
<diff>
`;

    activeBlocks.forEach(b => {
      xml += `  <!-- ${b.note} -->\n`;
      if (b.action === 'remove') {
        xml += `  <remove sel="${b.sel}" />\n\n`;
      } else {
        xml += `  <${b.action} sel="${b.sel}">\n`;
        // Indent lines
        const lines = b.content.split('\n');
        lines.forEach(l => {
          xml += `    ${l}\n`;
        });
        xml += `  </${b.action}>\n\n`;
      }
    });

    xml += `</diff>`;
    return xml;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(compileDiffDocument());
    alert("Diff Patch XML document copied on clipboard!");
  };

  return (
    <div id="xml_patch_workbench_view" className="flex-1 bg-[#0a0c10] flex flex-col h-full overflow-hidden text-slate-300">
      {/* Simulation HUD Controls bar */}
      <div className="bg-[#161920]/90 border-b border-white/10 p-3 flex items-center justify-between font-mono text-xs">
        <div className="flex items-center gap-2">
          <GitFork className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-slate-200 uppercase tracking-tight">XML DIFF INTERACTIVE WORKBENCH</span>
        </div>
        
        {/* Target file selectors */}
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="text-slate-500 uppercase font-bold text-[9.5px]">Target File:</span>
          <select
            value={targetFile}
            onChange={(e) => setTargetFile(e.target.value)}
            className="bg-[#0F1115] border border-white/10 p-1 px-2 rounded text-[10px] text-slate-300 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="libraries/ship_macros.xml">libraries/ship_macros.xml (Vessel Stats)</option>
            <option value="libraries/sound_library.xml">libraries/sound_library.xml (Game SFX & Lists)</option>
            <option value="libraries/wares.xml">libraries/wares.xml (Wares Override)</option>
            <option value="libraries/jobs.xml">libraries/jobs.xml (Quota Spawners)</option>
            <option value="ui/menu_layout_config.xml">ui/menu_layout_config.xml (Interface Anchors)</option>
          </select>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Recipes and template insertions */}
        <div className="w-80 border-r border-white/10 p-3.5 flex flex-col h-full bg-[#0d0f14]/80 overflow-y-auto space-y-4">
          {/* Tab switcher */}
          <div className="flex border-b border-white/10 mb-2 shrink-0">
            <button
              onClick={() => setSidebarTab('tree')}
              className={`flex-1 pb-2 text-center text-xs font-mono font-bold tracking-wider uppercase transition-colors border-b-2 cursor-pointer ${
                sidebarTab === 'tree'
                  ? 'border-emerald-500 text-emerald-400 font-extrabold'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              Tree
            </button>
            <button
              onClick={() => setSidebarTab('recipes')}
              className={`flex-1 pb-2 text-center text-xs font-mono font-bold tracking-wider uppercase transition-colors border-b-2 cursor-pointer ${
                sidebarTab === 'recipes'
                  ? 'border-emerald-500 text-emerald-400 font-extrabold'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              Recipes
            </button>
            <button
              onClick={() => setSidebarTab('boilerplates')}
              className={`flex-1 pb-2 text-center text-xs font-mono font-bold tracking-wider uppercase transition-colors border-b-2 cursor-pointer ${
                sidebarTab === 'boilerplates'
                  ? 'border-emerald-500 text-emerald-400 font-extrabold'
                  : 'border-transparent text-slate-305 hover:text-white'
              }`}
            >
              Boilerplates
            </button>
          </div>

          {sidebarTab === 'tree' ? (
            <div className="space-y-4 animate-fadeIn flex-1 flex flex-col overflow-hidden">
              <div>
                <h3 className="text-xs font-mono font-bold text-emerald-400 border-b border-white/10 pb-1.5 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  📁 xml patches tree
                </h3>
                <p className="text-[10px] text-slate-500 mb-3 leading-relaxed font-mono">
                  Observability hierarchy of all defined XML patch instructions created in the current mod.
                </p>

                <div className="space-y-4 font-mono text-[11px] max-h-[460px] overflow-y-auto custom-scrollbar pr-1">
                  {patchBlocks.length === 0 ? (
                    <div className="text-[10px] text-slate-500 italic p-4 text-center border border-white/5 bg-black/10 rounded">
                      No XML patches registered in the current existing mod session. Use the central Workbench to define your first diff operation node!
                    </div>
                  ) : (
                    Array.from(new Set(patchBlocks.map(p => p.targetFile || targetFile))).map(tFile => {
                      const filePatches = patchBlocks.filter(p => (p.targetFile || targetFile) === tFile);
                      return (
                        <div key={tFile} className="space-y-1.5">
                          {/* File Header Node */}
                          <button
                            onClick={() => setTargetFile(tFile)}
                            className={`w-full p-1.5 px-2 rounded font-bold text-left flex items-center gap-1.5 transition-colors border ${
                              targetFile === tFile ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-black/20 text-slate-300 border-transparent hover:bg-white/5'
                            }`}
                          >
                            <span>📄</span>
                            <span className="truncate flex-1">{tFile}</span>
                            <span className="text-[9px] bg-black/40 px-1.5 rounded text-slate-400 font-bold">{filePatches.length}</span>
                          </button>

                          {/* Patches list inside file */}
                          <div className="pl-3.5 border-l border-white/5 space-y-1.5">
                            {filePatches.map(patch => (
                              <div
                                key={patch.id}
                                className="p-1 px-1.5 rounded bg-black/15 hover:bg-white/[0.02] border border-transparent hover:border-white/5 flex items-start justify-between gap-1 group/pnode"
                              >
                                <button
                                  onClick={() => {
                                    setTargetFile(tFile);
                                  }}
                                  className="flex-1 text-left cursor-pointer truncate"
                                >
                                  <div className="flex items-center gap-1">
                                    <span className={`text-[8px] uppercase font-bold px-1 rounded ${
                                      patch.action === 'add' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                      patch.action === 'replace' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                      'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                    }`}>
                                      {patch.action}
                                    </span>
                                    <span className="truncate text-slate-350 font-semibold max-w-[130px]" title={patch.sel}>{patch.sel}</span>
                                  </div>
                                  {patch.note && (
                                    <span className="text-[9px] text-slate-505 block truncate max-w-[160px]">{patch.note}</span>
                                  )}
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const updated = patchBlocks.filter(p => p.id !== patch.id);
                                    savePatches(updated);
                                  }}
                                  className="p-1 text-slate-600 hover:text-rose-400 cursor-pointer opacity-0 group-hover/pnode:opacity-100 transition-opacity ml-1"
                                  title="Delete patch specification element"
                                >
                                  <Trash className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ) : sidebarTab === 'recipes' ? (
            <div className="space-y-4 animate-fadeIn">
              <div>
                <h3 className="text-xs font-mono font-bold text-emerald-400 border-b border-white/10 pb-1.5 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  DIFF RECIPES LIBRARY
                </h3>
                <p className="text-[10.5px] text-slate-500 mb-3 leading-relaxed font-mono">
                  Inject standard patch layouts for ship components, audio soundscapes, or statistics overrides instantly.
                </p>

                <div className="space-y-1.5">
                  <button
                    onClick={() => handleLoadRecipe('carrier_hangar')}
                    className="w-full text-left p-2.5 rounded bg-[#1c1f26] border border-white/5 hover:border-emerald-500 transition-all flex flex-col justify-start items-start gap-1 cursor-pointer"
                  >
                    <div className="text-xs font-bold text-slate-200">Expand Carrier Hangar Bay</div>
                    <div className="text-[9px] text-slate-500 font-mono">Target: libraries/ship_macros.xml</div>
                  </button>
                  
                  <button
                    onClick={() => handleLoadRecipe('combat_music')}
                    className="w-full text-left p-2.5 rounded bg-[#1c1f26] border border-white/5 hover:border-emerald-500 transition-all flex flex-col justify-start items-start gap-1 cursor-pointer"
                  >
                    <div className="text-xs font-bold text-slate-200">Custom Battle Tracks playlist</div>
                    <div className="text-[9px] text-slate-500 font-mono">Target: libraries/sound_library.xml</div>
                  </button>

                  <button
                    onClick={() => handleLoadRecipe('shield_stats')}
                    className="w-full text-left p-2.5 rounded bg-[#1c1f26] border border-white/5 hover:border-emerald-500 transition-all flex flex-col justify-start items-start gap-1 cursor-pointer"
                  >
                    <div className="text-xs font-bold text-slate-200 font-sans">Shield Generation Multipliers</div>
                    <div className="text-[9px] text-slate-500 font-mono">Target: xml parameters database</div>
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-mono font-bold text-slate-400 border-b border-white/10 pb-1.5 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <HelpCircle className="w-3.5 h-3.5 text-emerald-400" />
                  What are XML Diffs?
                </h3>
                <div className="bg-black/20 p-3 rounded border border-white/5 text-[10.5px] leading-relaxed text-slate-400 font-mono space-y-2">
                  <p>
                    In X4: Foundations, files can be patched safely rather than entirely overwritten. This allows multiple mods to edit the same files independently!
                  </p>
                  <p>
                    - <span className="text-emerald-400 font-bold">&lt;add&gt;</span> appends nodes into the selector parent.<br />
                    - <span className="text-emerald-400 font-bold">&lt;replace&gt;</span> replaces existing nodes / attributes.<br />
                    - <span className="text-emerald-400 font-bold">&lt;remove&gt;</span> drops attributes/elements completely.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 animate-fadeIn flex-1 flex flex-col overflow-hidden">
              <div className="flex flex-col gap-2 shrink-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Bookmark className="w-3.5 h-3.5 text-emerald-400" />
                    BOILERPLATES & SNIPPETS
                  </h3>
                  
                  <button
                    onClick={() => setIsCreatingCustomBP(!isCreatingCustomBP)}
                    className="text-[10px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-mono p-1 px-2 rounded border border-emerald-500/25 transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <PlusCircle className="w-3 h-3" />
                    {isCreatingCustomBP ? 'Cancel' : 'New'}
                  </button>
                </div>
                
                {/* Search filter input */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search snippets..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 text-xs text-slate-300 rounded p-1.5 pl-8 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
              </div>

              {isCreatingCustomBP ? (
                <form onSubmit={handleCreateCustomBoilerplate} className="bg-black/35 border border-white/5 rounded p-3 space-y-2.5 shrink-0 select-none">
                  <div className="text-[11px] font-mono font-bold text-emerald-400 uppercase border-b border-white/10 pb-1">Create Custom Boilerplate</div>
                  
                  <div className="flex flex-col gap-1">
                    <label className="text-[9.5px] text-slate-500 font-mono uppercase">Snippet Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Inflow Engine Thrust"
                      value={newBPName}
                      onChange={(e) => setNewBPName(e.target.value)}
                      className="bg-[#14161d] border border-white/10 text-xs text-slate-200 rounded p-1.5 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[9.5px] text-slate-500 font-mono uppercase">Description</label>
                    <input
                      type="text"
                      placeholder="Brief summary of what this code does"
                      value={newBPDescription}
                      onChange={(e) => setNewBPDescription(e.target.value)}
                      className="bg-[#14161d] border border-white/10 text-xs text-slate-200 rounded p-1.5 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[9.5px] text-slate-500 font-mono uppercase">Target File</label>
                      <select
                        value={newBPRelativePath}
                        onChange={(e) => setNewBPRelativePath(e.target.value)}
                        className="bg-[#14161d] border border-white/10 text-[10px] text-slate-300 rounded p-1 p-y-1.5 focus:outline-none cursor-pointer"
                      >
                        <option value="libraries/wares.xml">wares.xml</option>
                        <option value="libraries/jobs.xml">jobs.xml</option>
                        <option value="libraries/ship_macros.xml">ship_macros.xml</option>
                        <option value="libraries/factions.xml">factions.xml</option>
                        <option value="libraries/sound_library.xml">sound_library.xml</option>
                        <option value="libraries/mission_director.xml">mission_director.xml</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[9.5px] text-slate-500 font-mono uppercase">Action Type</label>
                      <select
                        value={newBPAction}
                        onChange={(e) => setNewBPAction(e.target.value as any)}
                        className="bg-[#14161d] border border-white/10 text-[10px] text-slate-300 rounded p-1 p-y-1.5 focus:outline-none cursor-pointer"
                      >
                        <option value="add">add node</option>
                        <option value="replace">replace attr/node</option>
                        <option value="remove">remove node</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[9.5px] text-slate-500 font-mono uppercase">XPath Selector / Node Target</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. /wares"
                      value={newBPSel}
                      onChange={(e) => setNewBPSel(e.target.value)}
                      className="bg-[#14161d] border border-white/10 text-xs font-mono text-slate-200 rounded p-1.5 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[9.5px] text-slate-500 font-mono uppercase">Code Content</label>
                    <textarea
                      placeholder="XML definition content..."
                      value={newBPContent}
                      onChange={(e) => setNewBPContent(e.target.value)}
                      rows={4}
                      className="bg-[#14161d] border border-white/10 text-xs font-mono text-slate-200 rounded p-1.5 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs p-2 rounded font-bold transition-colors cursor-pointer"
                  >
                    Save Boilerplate Snippet
                  </button>
                </form>
              ) : null}

              {/* Snippets list Container */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {[...customSnippets, ...BUILTIN_BOILERPLATES]
                  .filter(bp => {
                    const query = searchQuery.toLowerCase().trim();
                    if (!query) return true;
                    return (
                      bp.name.toLowerCase().includes(query) ||
                      bp.description.toLowerCase().includes(query) ||
                      bp.targetFile.toLowerCase().includes(query) ||
                      bp.content.toLowerCase().includes(query)
                    );
                  })
                  .map(bp => {
                    const isCustom = bp.id.startsWith('custom_bp_');
                    return (
                      <div
                        key={bp.id}
                        className="bg-[#1c1f26]/80 hover:bg-[#1c1f26] border border-white/5 hover:border-emerald-500/30 p-2.5 rounded-lg flex flex-col gap-1.5 shadow transition-all group/bp relative"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="flex flex-col">
                            <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                              <FileText className="w-3 h-3 text-slate-400" />
                              {bp.name}
                              {isCustom && <span className="text-[8px] uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1 rounded">user</span>}
                            </div>
                            <div className="text-[10px] text-slate-450 leading-normal mt-0.5">{bp.description}</div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0 opacity-40 group-hover/bp:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => handleCopyToClipboardAndNotify(bp, e)}
                              className="p-1 rounded bg-[#0F1115] hover:bg-black/40 text-slate-400 hover:text-cyan-400 border border-white/5 cursor-pointer flex items-center justify-center transition-colors"
                              title="Copy code to clipboard"
                            >
                              {copiedSnippetId === bp.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            </button>
                            
                            {isCustom && (
                              <button
                                onClick={(e) => handleDeleteCustomSnippet(bp.id, e)}
                                className="p-1 rounded bg-[#0F1115] hover:bg-black/40 text-slate-400 hover:text-red-400 border border-white/5 cursor-pointer flex items-center justify-center transition-colors"
                                title="Delete custom snippet"
                              >
                                <Trash className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[9px] text-slate-500">
                          <span className="bg-[#0F1115] px-1.5 py-0.5 rounded text-[8.5px] text-slate-400 truncate max-w-[130px]" title={bp.targetFile}>
                            {bp.targetFile}
                          </span>
                          <span className="bg-[#0F1115] px-1.5 py-0.5 rounded text-[8.5px] text-emerald-400">
                            sel: {bp.sel.substring(0, 16)}{bp.sel.length > 16 ? '...' : ''}
                          </span>
                          <span className="bg-[#0F1115] px-1.5 py-0.5 rounded text-[8.5px] text-purple-400">
                            act: {bp.action}
                          </span>
                        </div>

                        <button
                          onClick={() => handleApplyBoilerplate(bp)}
                          className="w-full text-center py-1 mt-1 font-mono text-[9px] font-bold text-emerald-400 hover:text-white bg-emerald-500/5 hover:bg-emerald-600 rounded border border-emerald-500/10 hover:border-emerald-500/25 transition-all cursor-pointer flex items-center justify-center gap-1"
                        >
                          <Plus className="w-2.5 h-2.5" />
                          Apply template to queue
                        </button>
                      </div>
                    );
                  })}
                {[...customSnippets, ...BUILTIN_BOILERPLATES].filter(bp => {
                  const query = searchQuery.toLowerCase().trim();
                  if (!query) return true;
                  return (
                    bp.name.toLowerCase().includes(query) ||
                    bp.description.toLowerCase().includes(query) ||
                    bp.targetFile.toLowerCase().includes(query) ||
                    bp.content.toLowerCase().includes(query)
                  );
                }).length === 0 && (
                  <div className="text-center py-8 text-slate-500 font-mono text-xs border border-white/5 rounded bg-black/10">
                    No snippets found matching your query.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Center: Interactive Diff Blocks constructor */}
        <div className="flex-1 flex flex-col border-r border-[#df9825]/10 overflow-hidden p-4">
          <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-3 shrink-0">
            <h2 className="text-xs font-mono font-bold text-slate-200 tracking-wider uppercase flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-emerald-400" />
              Active Patch Blocks Queue
            </h2>
            
            <div className="flex gap-1">
              <button
                onClick={() => handleAddPatchBlock('add')}
                className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/35 rounded text-[10px] font-mono text-emerald-400 hover:text-white cursor-pointer"
              >
                ➕ Add Block
              </button>
              <button
                onClick={() => handleAddPatchBlock('replace')}
                className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/35 rounded text-[10px] font-mono text-emerald-400 hover:text-white cursor-pointer"
              >
                🔁 Replace Block
              </button>
              <button
                onClick={() => handleAddPatchBlock('remove')}
                className="px-2 py-1 bg-[#ef4444]/10 hover:bg-[#ef4444]/25 border border-[#ef4444]/35 rounded text-[10px] font-mono text-red-400 hover:text-white cursor-pointer"
              >
                ➖ Remove Block
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1 py-1">
            {filteredBlocks.length === 0 ? (
              <div className="text-center py-24 text-[11px] font-mono text-slate-500 whitespace-pre">
                No patch blocks for this file.<br />Click right header actions to build custom patches!
              </div>
            ) : (
              filteredBlocks.map((b, bidx) => (
                <div
                  key={b.id}
                  className="bg-[#1c1f26]/90 border border-white/5 hover:border-emerald-500/30 p-3.5 rounded-lg flex flex-col gap-2.5 shadow-md relative group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 text-emerald-400 font-bold uppercase rounded font-mono">
                        Block #{bidx + 1}: {b.action.toUpperCase()}
                      </span>
                      <input
                        type="text"
                        value={b.note}
                        onChange={(e) => handleUpdatePatchBlock(b.id, 'note', e.target.value)}
                        className="font-bold text-xs text-slate-200 bg-transparent border-b border-transparent hover:border-white/20 focus:border-emerald-500 focus:outline-none transition-all py-0.5 font-sans"
                        placeholder="Patch item description note..."
                      />
                    </div>
                    <div className="flex items-center gap-1 opacity-40 group-hover:opacity-100 transition-all">
                      <button
                        onClick={() => handleSaveBlockAsBoilerplate(b)}
                        className="text-slate-500 hover:text-emerald-400 p-1 rounded hover:bg-black/25 transition-all cursor-pointer"
                        title="Save this block to Boilerplates library"
                      >
                        <Bookmark className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeletePatchBlock(b.id)}
                        className="text-slate-500 hover:text-red-400 p-1 rounded hover:bg-black/25 transition-all cursor-pointer"
                      >
                        <Trash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Target Node XPath selector */}
                  <div className="space-y-1 font-mono text-[10.5px]">
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400 uppercase font-bold text-[9px] w-24">Sel (XPath):</span>
                      <input
                        type="text"
                        value={b.sel}
                        onChange={(e) => handleUpdatePatchBlock(b.id, 'sel', e.target.value)}
                        className="bg-black/50 border border-white/10 rounded px-2 py-1 text-slate-200 flex-1 h-7 focus:outline-none focus:border-emerald-500 text-[10px] font-mono font-bold"
                        placeholder="e.g. /wares/ware[@id='ore']"
                      />
                    </div>
                  </div>

                  {/* Code editor block for Add or Replace content */}
                  {b.action !== 'remove' && (
                    <div className="ml-24 space-y-1 font-mono text-[10.5px]">
                      <span className="text-slate-500 uppercase font-bold text-[8.5px] block">Patch Content:</span>
                      <textarea
                        value={b.content}
                        onChange={(e) => handleUpdatePatchBlock(b.id, 'content', e.target.value)}
                        rows={3}
                        className="w-full bg-black/60 font-mono text-[9.5px] p-2 border border-white/5 focus:border-emerald-500 rounded text-slate-300 resize-none h-14"
                        placeholder="<ware id='id' ... />"
                      />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right side code preview area */}
        <div className="w-[360px] bg-[#0c0e14] border-l border-white/10 p-4 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3 shrink-0 font-mono text-xs">
            <div className="flex items-center gap-1 text-emerald-400 font-semibold">
              <Code2 className="w-4 h-4" />
              <span>Full Generated Patch</span>
            </div>
            <button
              onClick={copyToClipboard}
              className="px-2.5 py-0.5 rounded bg-black/45 hover:bg-black/80 font-bold uppercase text-[9.5px] border border-white/10 text-slate-300 hover:text-emerald-400 cursor-pointer flex items-center gap-1"
            >
              Copy Diff
            </button>
          </div>

          <div className="flex-1 bg-black/50 rounded-lg p-3 font-mono text-[10.5px] text-slate-400 overflow-y-auto relative custom-scrollbar border border-white/5 leading-normal select-text selection:bg-emerald-500/25">
            <pre className="whitespace-pre">
              {compileDiffDocument()}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
