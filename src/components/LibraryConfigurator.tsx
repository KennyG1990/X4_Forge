/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Settings, 
  Trash, 
  Plus, 
  Wrench, 
  Sparkles, 
  Database, 
  HelpCircle, 
  ShoppingBag, 
  Anchor, 
  Code2, 
  ChevronRight,
  GitPullRequest
} from 'lucide-react';
import { ModWorkspace } from '../types';

interface LibraryConfiguratorProps {
  workspace: ModWorkspace;
  setWorkspace: React.Dispatch<React.SetStateAction<ModWorkspace>>;
}

export interface WareDef {
  id: string;
  name: string;
  description: string;
  transport: 'container' | 'liquid' | 'solid' | 'energy';
  volume: number;
  minPrice: number;
  avgPrice: number;
  maxPrice: number;
  prodTime: number;
  prodAmount: number;
}

export interface JobDef {
  id: string;
  name: string;
  faction: string;
  shipClass: 'fighter' | 'corvette' | 'destroyer' | 'carrier' | 'freighter';
  shipMacro: string;
  galaxyQuota: number;
  sectorQuota: number;
  taskScript: string;
  rebuildOnDestroy: boolean;
}

export default function LibraryConfigurator({ workspace, setWorkspace }: LibraryConfiguratorProps) {
  const [activeSubTab, setActiveSubTab] = useState<'wares' | 'jobs'>('wares');
  const [activeItemIndex, setActiveItemIndex] = useState<number>(0);
  const [isPatchMode, setIsPatchMode] = useState<boolean>(true);

  // High fidelity default arrays
  const defaultWares: WareDef[] = [
    {
      id: 'ware_quantum_injectors',
      name: 'Quantum Engine Injectors',
      description: 'Super-efficient fuel compression injectors used in advanced high-speed capital engines.',
      transport: 'container',
      volume: 8,
      minPrice: 420,
      avgPrice: 850,
      maxPrice: 1600,
      prodTime: 45,
      prodAmount: 4
    },
    {
      id: 'ware_fusion_conductors',
      name: 'High-Temp Fusion Conductors',
      description: 'Superconducting alloy links that distribute stable energy payloads to magnetic rail accelerators.',
      transport: 'container',
      volume: 12,
      minPrice: 800,
      avgPrice: 1250,
      maxPrice: 2400,
      prodTime: 60,
      prodAmount: 2
    }
  ];

  const defaultJobs: JobDef[] = [
    {
      id: 'job_argon_patrol_elite_escort',
      name: 'Argon Vanguard Strategic Escort Force',
      faction: 'argon',
      shipClass: 'fighter',
      shipMacro: 'ship_arg_s_fighter_01_a_macro',
      galaxyQuota: 12,
      sectorQuota: 3,
      taskScript: 'hunter.escort.behavior',
      rebuildOnDestroy: true
    },
    {
      id: 'job_xenon_destroyer_offensive',
      name: 'Xenon Sector Harassment Fleet',
      faction: 'xenon',
      shipClass: 'destroyer',
      shipMacro: 'ship_xen_k_destroyer_01_macro',
      galaxyQuota: 4,
      sectorQuota: 1,
      taskScript: 'commander.patrol.xenon',
      rebuildOnDestroy: true
    }
  ];

  const wares = workspace.wares && workspace.wares.length > 0 ? workspace.wares : defaultWares;
  const jobs = workspace.jobs && workspace.jobs.length > 0 ? workspace.jobs : defaultJobs;

  const saveWares = (newWares: WareDef[]) => {
    setWorkspace(prev => ({
      ...prev,
      wares: newWares
    }));
  };

  const saveJobs = (newJobs: JobDef[]) => {
    setWorkspace(prev => ({
      ...prev,
      jobs: newJobs
    }));
  };

  const handleCreateWare = () => {
    const wId = prompt("Enter Unique Ware ID (e.g., ware_antimatter_capsules):", "ware_quantum_crystals");
    if (!wId) return;
    
    const nWare: WareDef = {
      id: wId.startsWith('ware_') ? wId : `ware_${wId}`,
      name: "Quantum Focus Crystals",
      description: "Highly volatile carbon lattices that refract focus laser beam emitters.",
      transport: 'container',
      volume: 4,
      minPrice: 180,
      avgPrice: 350,
      maxPrice: 720,
      prodTime: 30,
      prodAmount: 10
    };

    const next = [...wares, nWare];
    saveWares(next);
    setActiveItemIndex(wares.length);
  };

  const handleCreateJob = () => {
    const jId = prompt("Enter Unique Job ID (e.g., job_trader_hauler):", "job_pirate_harasser");
    if (!jId) return;

    const nJob: JobDef = {
      id: jId.startsWith('job_') ? jId : `job_${jId}`,
      name: "Demolition Patrol Squad",
      faction: 'yaki',
      shipClass: 'corvette',
      shipMacro: 'ship_split_m_corvette_01_a_macro',
      galaxyQuota: 6,
      sectorQuota: 2,
      taskScript: 'hunter.escort.behavior',
      rebuildOnDestroy: true
    };

    const next = [...jobs, nJob];
    saveJobs(next);
    setActiveItemIndex(jobs.length);
  };

  const handleDeleteActiveItem = () => {
    if (activeSubTab === 'wares') {
      if (wares.length <= 1) return alert("Keep at least one ware entry.");
      const next = wares.filter((_, i) => i !== activeItemIndex);
      saveWares(next);
      setActiveItemIndex(0);
    } else {
      if (jobs.length <= 1) return alert("Keep at least one job entry.");
      const next = jobs.filter((_, i) => i !== activeItemIndex);
      saveJobs(next);
      setActiveItemIndex(0);
    }
  };

  const handleUpdateActiveWareProp = (key: keyof WareDef, val: any) => {
    const next = wares.map((w, idx) => {
      if (idx === activeItemIndex) {
        return { ...w, [key]: val };
      }
      return w;
    });
    saveWares(next);
  };

  const handleUpdateActiveJobProp = (key: keyof JobDef, val: any) => {
    const next = jobs.map((j, idx) => {
      if (idx === activeItemIndex) {
        return { ...j, [key]: val };
      }
      return j;
    });
    saveJobs(next);
  };

  // Compile XML content cleanly
  const compileWaresXML = (): string => {
    const item = wares[activeItemIndex] || wares[0];
    if (!item) return '';

    if (isPatchMode) {
      return `<?xml version="1.0" encoding="utf-8"?>
<diff>
  <!-- XML Diff Patch adding to core wares database file: libraries/wares.xml -->
  <add sel="/wares">
    <ware id="${item.id}" name="${item.name}" description="${item.description}" transport="${item.transport}" volume="${item.volume}" tags="economy equipment">
      <price min="${item.minPrice}" average="${item.avgPrice}" max="${item.maxPrice}" />
      <production time="${item.prodTime}" amount="${item.prodAmount}" method="default" name="Assembly output">
        <primary>
          <ware ware="ore" amount="15" />
          <ware ware="energycells" amount="40" />
        </primary>
      </production>
    </ware>
  </add>
</diff>`;
    } else {
      return `<?xml version="1.0" encoding="utf-8"?>
<wares>
  <!-- Pure XML wares definitions replacement list -->
  <ware id="${item.id}" name="${item.name}" description="${item.description}" transport="${item.transport}" volume="${item.volume}">
    <price min="${item.minPrice}" average="${item.avgPrice}" max="${item.maxPrice}" />
    <production time="${item.prodTime}" amount="${item.prodAmount}" method="default">
      <primary>
        <ware ware="ore" amount="15" />
        <ware ware="energycells" amount="40" />
      </primary>
    </production>
  </ware>
</wares>`;
    }
  };

  const compileJobsXML = (): string => {
    const item = jobs[activeItemIndex] || jobs[0];
    if (!item) return '';

    if (isPatchMode) {
      return `<?xml version="1.0" encoding="utf-8"?>
<diff>
  <!-- XML Diff Patch adding new AI pilot squad to core jobs database: libraries/jobs.xml -->
  <add sel="/jobs">
    <job id="${item.id}" name="${item.name}" active="true font">
      <expiration min="7200" max="14400" />
      <modifiers rebuild="${item.rebuildOnDestroy ? 'true' : 'false'}" />
      <ship>
        <select faction="${item.faction}" tags="military ${item.shipClass}" />
        <loadout>
          <level min="0.8" max="1.0" />
        </loadout>
      </ship>
      <quota galaxy="${item.galaxyQuota}" sector="${item.sectorQuota}" />
      <task script="${item.taskScript}" />
    </job>
  </add>
</diff>`;
    } else {
      return `<?xml version="1.0" encoding="utf-8"?>
<jobs>
  <!-- Pure standalone XML Job config file -->
  <job id="${item.id}" name="${item.name}" active="true">
    <expiration min="7200" max="14400" />
    <ship>
      <select faction="${item.faction}" tags="${item.shipClass}" />
    </ship>
    <quota galaxy="${item.galaxyQuota}" sector="${item.sectorQuota}" />
    <task script="${item.taskScript}" />
  </job>
</jobs>`;
    }
  };

  const activeItem = activeSubTab === 'wares' ? wares[activeItemIndex] : jobs[activeItemIndex];

  return (
    <div id="libraries_configurator_view" className="flex-1 bg-[#0a0c10] flex flex-col h-full overflow-hidden text-slate-300">
      {/* Simulation HUD Controls bar */}
      <div className="bg-[#161920]/90 border-b border-white/10 p-3 flex items-center justify-between font-mono text-xs">
        <div className="flex items-center gap-3">
          <Database className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-slate-200 uppercase tracking-tight">X4 Game Libraries Configurator (/libraries/)</span>
        </div>
        
        {/* Toggle Mode button */}
        <div className="flex items-center gap-2">
          {/* XML Patch / Pure toggle */}
          <button
            onClick={() => setIsPatchMode(prev => !prev)}
            className={`px-3 py-1 rounded text-[10px] uppercase font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
              isPatchMode
                ? 'border-cyan-500 bg-cyan-600/15 text-cyan-400'
                : 'border-white/10 bg-black/45 text-slate-400 hover:text-white'
            }`}
            title="Convert code output into a modular XML diff patch or standard XML"
          >
            <GitPullRequest className="w-3 h-3" />
            {isPatchMode ? "Mode: XML Diff (Patches)" : "Mode: Standalone XML"}
          </button>

          {/* Sub menu selector */}
          <div className="flex items-center border border-white/10 bg-black/45 p-0.5 rounded-md">
            <button
              onClick={() => { setActiveSubTab('wares'); setActiveItemIndex(0); }}
              className={`px-3 py-1 rounded text-[10px] uppercase font-bold transition-all cursor-pointer ${
                activeSubTab === 'wares' ? 'bg-cyan-500/15 text-cyan-400 font-extrabold' : 'text-slate-400 hover:text-white'
              }`}
            >
              wares.xml
            </button>
            <button
              onClick={() => { setActiveSubTab('jobs'); setActiveItemIndex(0); }}
              className={`px-3 py-1 rounded text-[10px] uppercase font-bold transition-all cursor-pointer ${
                activeSubTab === 'jobs' ? 'bg-cyan-500/15 text-cyan-400 font-extrabold' : 'text-slate-500 hover:text-white'
              }`}
            >
              jobs.xml
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Libraries assets items selector */}
        <div className="w-72 border-r border-white/10 flex flex-col bg-[#11131c]/60">
          <div className="p-3 border-b border-white/10 shrink-0 flex items-center justify-between bg-[#161a24]">
            <span className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {activeSubTab === 'wares' ? 'wares registry' : 'npc jobs registry'} ({activeSubTab === 'wares' ? wares.length : jobs.length})
            </span>
            <button
              onClick={activeSubTab === 'wares' ? handleCreateWare : handleCreateJob}
              className="p-1.5 rounded hover:bg-[#202533] text-cyan-400 hover:text-white transition-all cursor-pointer"
              title={`Create custom ${activeSubTab === 'wares' ? 'Ware asset ID' : 'Pilot quota Job group'}`}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {activeSubTab === 'wares' ? (
              wares.map((item, idx) => (
                <button
                  key={item.id}
                  onClick={() => setActiveItemIndex(idx)}
                  className={`w-full text-left p-2.5 rounded-lg border text-xs font-mono transition-all flex items-center justify-between group cursor-pointer ${
                    activeItemIndex === idx
                      ? 'bg-cyan-600/15 border-cyan-500/40 text-cyan-400'
                      : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div className="truncate flex-1 pr-2">
                    <div className="font-bold truncate text-slate-200 group-hover:text-white">{item.name}</div>
                    <div className="text-[10px] text-slate-500 font-medium truncate mt-0.5">{item.id}</div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400 shrink-0" />
                </button>
              ))
            ) : (
              jobs.map((item, idx) => (
                <button
                  key={item.id}
                  onClick={() => setActiveItemIndex(idx)}
                  className={`w-full text-left p-2.5 rounded-lg border text-xs font-mono transition-all flex items-center justify-between group cursor-pointer ${
                    activeItemIndex === idx
                      ? 'bg-cyan-600/15 border-cyan-500/40 text-cyan-400'
                      : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div className="truncate flex-1 pr-2">
                    <div className="font-bold truncate text-slate-200 group-hover:text-white">{item.name}</div>
                    <div className="text-[10px] text-slate-500 font-medium truncate mt-0.5">{item.id}</div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400 shrink-0" />
                </button>
              ))
            )}
          </div>
        </div>

        {/* Center portion: Visual controls detail editor sheet */}
        <div className="flex-1 flex flex-col border-r border-white/10 overflow-hidden">
          <div className="p-4 border-b border-white/10 shrink-0 flex items-center justify-between bg-black/25">
            <div>
              <h2 className="text-sm font-mono font-bold text-slate-200">
                {activeItem?.name || 'Selected Asset'}
              </h2>
              <p className="text-[10.5px] text-slate-500 font-mono mt-0.5">
                Target ID: {activeItem?.id}
              </p>
            </div>
            <button
              onClick={handleDeleteActiveItem}
              className="px-2.5 py-1 text-red-400 border border-red-500/15 bg-red-500/5 hover:bg-red-500/10 hover:border-red-500/30 rounded font-mono text-[10px] font-bold uppercase cursor-pointer transition-all flex items-center gap-1"
            >
              <Trash className="w-3.5 h-3.5" />
              Remove Item
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeSubTab === 'wares' ? (
              <div className="space-y-4 max-w-2xl">
                <div className="space-y-3 font-mono text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1 uppercase text-[9px] tracking-wider font-bold">Ware Display Name</label>
                    <input
                      type="text"
                      value={(activeItem as WareDef).name}
                      onChange={e => handleUpdateActiveWareProp('name', e.target.value)}
                      className="w-full p-2 rounded bg-black/50 border border-white/10 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1 uppercase text-[9px] tracking-wider font-bold">Cargo Transport Method</label>
                    <select
                      value={(activeItem as WareDef).transport}
                      onChange={e => handleUpdateActiveWareProp('transport', e.target.value)}
                      className="w-full p-2 rounded bg-[#0F1115] border border-white/10 text-white cursor-pointer focus:outline-none focus:border-cyan-500 transition-colors"
                    >
                      <option value="container">Container Cargo (Equipment/Metals/Computers)</option>
                      <option value="solid">Solid Minerals (Ore/Silicon/Ice)</option>
                      <option value="liquid">Liquid Fluids (Helium/Hydrogen/Gases)</option>
                      <option value="energy">Energy Coils (Energy Cells/Plasma)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pb-1">
                    <div>
                      <label className="text-slate-400 block mb-1 uppercase text-[9px] tracking-wider font-bold">Cargo Volume (m³)</label>
                      <input
                        type="number"
                        value={(activeItem as WareDef).volume}
                        onChange={e => handleUpdateActiveWareProp('volume', Number(e.target.value))}
                        className="w-full p-2 rounded bg-black/50 border border-white/10 text-white font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1 uppercase text-[9px] tracking-wider font-bold">Production Assembly Cycle</label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          value={(activeItem as WareDef).prodTime}
                          onChange={e => handleUpdateActiveWareProp('prodTime', Number(e.target.value))}
                          className="w-1/2 p-2 rounded bg-black/50 border border-white/10 text-emerald-400 text-center font-bold"
                          placeholder="time"
                        />
                        <span className="self-center text-[10px] text-slate-500">sec for</span>
                        <input
                          type="number"
                          value={(activeItem as WareDef).prodAmount}
                          onChange={e => handleUpdateActiveWareProp('prodAmount', Number(e.target.value))}
                          className="w-1/3 p-2 rounded bg-black/50 border border-white/10 text-white text-center font-bold"
                          placeholder="qty"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-black/35 rounded-lg border border-white/5 space-y-3">
                    <span className="font-bold text-[9px] text-slate-400 tracking-wider block uppercase border-b border-white/5 pb-1">
                      Dynamic Profit & Pricing Matrix (Credits)
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-slate-500 block mb-1 text-[8.5px] uppercase font-bold">Min Floor</label>
                        <input
                          type="number"
                          value={(activeItem as WareDef).minPrice}
                          onChange={e => handleUpdateActiveWareProp('minPrice', Number(e.target.value))}
                          className="w-full p-1.5 rounded bg-black border border-white/10 text-red-400 text-center"
                        />
                      </div>
                      <div>
                        <label className="text-slate-500 block mb-1 text-[8.5px] uppercase font-bold text-cyan-400">Average</label>
                        <input
                          type="number"
                          value={(activeItem as WareDef).avgPrice}
                          onChange={e => handleUpdateActiveWareProp('avgPrice', Number(e.target.value))}
                          className="w-full p-1.5 rounded bg-black border border-white/10 text-cyan-400 text-center font-extrabold"
                        />
                      </div>
                      <div>
                        <label className="text-slate-500 block mb-1 text-[8.5px] uppercase font-bold">Max Ceiling</label>
                        <input
                          type="number"
                          value={(activeItem as WareDef).maxPrice}
                          onChange={e => handleUpdateActiveWareProp('maxPrice', Number(e.target.value))}
                          className="w-full p-1.5 rounded bg-black border border-white/10 text-emerald-400 text-center"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1 uppercase text-[9px] tracking-wider font-bold">Economic Description</label>
                    <textarea
                      value={(activeItem as WareDef).description}
                      onChange={e => handleUpdateActiveWareProp('description', e.target.value)}
                      className="w-full p-2 h-16 rounded bg-black/50 border border-white/10 text-white focus:outline-none focus:border-cyan-500 transition-colors resize-none font-sans"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 max-w-2xl">
                <div className="space-y-3 font-mono text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1 uppercase text-[9px] tracking-wider font-bold">Job Name Description</label>
                    <input
                      type="text"
                      value={(activeItem as JobDef).name}
                      onChange={e => handleUpdateActiveJobProp('name', e.target.value)}
                      className="w-full p-2 rounded bg-black/50 border border-white/10 text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-400 block mb-1 uppercase text-[9px] tracking-wider font-bold">Owning Combatant Faction</label>
                      <select
                        value={(activeItem as JobDef).faction}
                        onChange={e => handleUpdateActiveJobProp('faction', e.target.value)}
                        className="w-full p-2 rounded bg-[#0F1115] border border-white/10 text-white cursor-pointer"
                      >
                        <option value="argon">Argon Federation</option>
                        <option value="terran">Terran Protectorate</option>
                        <option value="xenon">Xenon Incursions AI</option>
                        <option value="split">Split Patriarchate</option>
                        <option value="paranid">Holy Order of Pontifex</option>
                        <option value="yaki">Yaki Raiders</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1 uppercase text-[9px] tracking-wider font-bold">Target Flight Code Behavior</label>
                      <input
                        type="text"
                        value={(activeItem as JobDef).taskScript}
                        onChange={e => handleUpdateActiveJobProp('taskScript', e.target.value)}
                        className="w-full p-2 rounded bg-black/50 border border-white/10 text-amber-500 font-bold"
                        placeholder="e.g. hunter.escort.behavior"
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-black/35 rounded-lg border border-white/5 space-y-3">
                    <span className="font-bold text-[9px] text-slate-400 tracking-wider block uppercase border-b border-white/5 pb-1">
                      Spawn Active Quota Volume Matrix
                    </span>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-500 block mb-1 text-[8.5px] uppercase font-bold">Max Galaxy Spawns</label>
                        <input
                          type="number"
                          value={(activeItem as JobDef).galaxyQuota}
                          onChange={e => handleUpdateActiveJobProp('galaxyQuota', Number(e.target.value))}
                          className="w-full p-1.5 rounded bg-black border border-white/10 text-cyan-400 text-center font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-slate-500 block mb-1 text-[8.5px] uppercase font-bold">Max Local Sector Spawns</label>
                        <input
                          type="number"
                          value={(activeItem as JobDef).sectorQuota}
                          onChange={e => handleUpdateActiveJobProp('sectorQuota', Number(e.target.value))}
                          className="w-full p-1.5 rounded bg-black border border-white/10 text-white text-center"
                        />
                      </div>
                    </div>
                    
                    <label className="flex items-center gap-2 text-[10px] text-slate-400 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={(activeItem as JobDef).rebuildOnDestroy}
                        onChange={e => handleUpdateActiveJobProp('rebuildOnDestroy', e.target.checked)}
                        className="rounded border-white/20 bg-black text-cyan-500 focus:ring-0"
                      />
                      <span>Rebuild Vessel automatically if destroyed in battles (Maintain Quota)</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right side: Real-time XML / Diff Code editor view */}
        <div className="w-96 bg-[#0c0e14] border-l border-white/10 p-4 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3 shrink-0 font-mono text-xs">
            <div className="flex items-center gap-1 text-cyan-400 font-semibold uppercase">
              <Code2 className="w-4 h-4" />
              <span>/libraries/{activeSubTab === 'wares' ? 'wares.xml' : 'jobs.xml'}</span>
            </div>
            
            <button
              onClick={() => copyToClipboard(activeSubTab === 'wares' ? compileWaresXML() : compileJobsXML())}
              className="px-2 py-0.5 rounded bg-black/45 hover:bg-black/80 font-bold uppercase text-[9.5px] border border-white/10 text-slate-300 hover:text-cyan-400 cursor-pointer flex items-center gap-1"
            >
              Copy XML
            </button>
          </div>

          <div className="flex-1 bg-black/50 rounded-lg p-3 font-mono text-[10.5px] text-slate-400 overflow-y-auto relative custom-scrollbar border border-white/5 leading-normal select-text selection:bg-cyan-500/25">
            <pre className="whitespace-pre">
              {activeSubTab === 'wares' ? compileWaresXML() : compileJobsXML()}
            </pre>
          </div>

          <div className="mt-3 bg-cyan-900/10 border border-cyan-500/20 rounded p-2 text-[9.5px] leading-relaxed text-slate-400">
            <HelpCircle className="w-3.5 h-3.5 text-cyan-400 inline mr-1" />
            <span className="font-semibold text-cyan-400">XML Diff Selector Syntax:</span> In X4 Foundations, target selectors like <code className="text-cyan-400">sel="/wares"</code> inject values smoothly into existing game configurations without overwriting them.
          </div>
        </div>
      </div>
    </div>
  );

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    alert("XML configuration code copied onto clipboard!");
  }
}
