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
  Settings
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

export default function XMLPatchSystem({ workspace, setWorkspace }: XMLPatchSystemProps) {
  const [targetFile, setTargetFile] = useState<string>('libraries/ship_macros.xml');
  
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

  const patchBlocks = workspace.xmlPatches && workspace.xmlPatches.length > 0 ? workspace.xmlPatches : defaultPatches;
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
        <div className="w-80 border-r border-white/10 p-4 space-y-4 overflow-y-auto">
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
                    <button
                      onClick={() => handleDeletePatchBlock(b.id)}
                      className="text-slate-500 hover:text-red-400 p-1 rounded hover:bg-black/25 opacity-40 group-hover:opacity-100 transition-all cursor-pointer"
                    >
                      <Trash className="w-3.5 h-3.5" />
                    </button>
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
