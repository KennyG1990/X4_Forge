/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Play, 
  Trash, 
  Plus, 
  Move, 
  Eye, 
  Compass, 
  ShieldAlert, 
  Settings, 
  Sparkles, 
  Code2, 
  Cpu, 
  Terminal,
  HelpCircle
} from 'lucide-react';
import { ModWorkspace } from '../types';

interface AIScriptEditorProps {
  workspace: ModWorkspace;
  setWorkspace: React.Dispatch<React.SetStateAction<ModWorkspace>>;
}

export interface AIParam {
  name: string;
  type: 'object' | 'number' | 'boolean' | 'ware' | 'faction';
  defaultValue: string;
  comment: string;
}

export interface AIAction {
  id: string;
  command: 'move_to' | 'flee' | 'shoot' | 'dock_at' | 'wait' | 'find_objects' | 'custom_xml';
  label: string;
  properties: Record<string, any>;
}

export default function AIScriptEditor({ workspace, setWorkspace }: AIScriptEditorProps) {
  // Initialize AI script objects inside local component state if not in workspace yet, synced to workspace
  const [activeScriptIdx, setActiveScriptIdx] = useState<number>(0);
  
  // Default fallback scripts if non-existent
  const defaultAIScripts = [
    {
      id: 'ai_hunter_escort',
      name: 'hunter.escort.behavior',
      description: 'Advanced aggressive patrol behavior that guards friendly transports and engages target intruders.',
      command: 'command.escort',
      attentionLevel: 'high' as const,
      params: [
        { name: 'target', type: 'object', defaultValue: 'this.ship.commander', comment: 'Leader ship to closely escort' },
        { name: 'flee_shield_percent', type: 'number', defaultValue: '25', comment: 'Shield threshold below which ship flees' },
        { name: 'aggression', type: 'number', defaultValue: '0.8', comment: 'Fighter engagement speed scaler' }
      ] as AIParam[],
      interrupts: [
        { id: 'int_1', event: 'event.object_attacked', action: 'flee' },
        { id: 'int_2', event: 'event.object_shield_low', action: 'dock_at_safety' }
      ],
      actions: [
        { id: 'act_1', command: 'move_to', label: 'Match formation distance', properties: { destination: '$target', speed: '90', precision: '100m' } },
        { id: 'act_2', command: 'find_objects', label: 'Scan for sector hostilities', properties: { class: 'ship', faction: 'faction.xenon', range: '15km' } },
        { id: 'act_3', command: 'shoot', label: 'Interdict intruders', properties: { target: '$enemy', weapon: 'primary' } },
        { id: 'act_4', command: 'wait', label: 'Resume station keeping cycle', properties: { min: '5s', max: '15s' } }
      ] as AIAction[]
    },
    {
      id: 'ai_miner_trade',
      name: 'miner.auto.harvest',
      description: 'Finds ore deposits in the faction sectors, mines asteroid nodes, and docks to trade with higher yields.',
      command: 'command.mine',
      attentionLevel: 'low' as const,
      params: [
        { name: 'resourceware', type: 'ware', defaultValue: 'ware.ore', comment: 'Mining mineral focus material' },
        { name: 'max_gate_range', type: 'number', defaultValue: '3', comment: 'Safety jump radius' }
      ] as AIParam[],
      interrupts: [
        { id: 'int_3', event: 'event.object_hull_damaged', action: 'flee' }
      ],
      actions: [
        { id: 'act_5', command: 'find_objects', label: 'Detect rich asteroid nodes', properties: { class: 'asteroid', resource: '$resourceware', range: '50km' } },
        { id: 'act_6', command: 'move_to', label: 'Approach resources cluster', properties: { destination: '$asteroid', speed: '50', precision: '10m' } },
        { id: 'act_7', command: 'wait', label: 'Initiate laser excavation beams', properties: { exact: '30s' } },
        { id: 'act_8', command: 'dock_at', label: 'Unload cargo at refinery station', properties: { station: 'faction.player.hq', trade: 'true' } }
      ] as AIAction[]
    }
  ];

  // Load from local storage or set initial
  const [scripts, setScripts] = useState<typeof defaultAIScripts>(() => {
    const saved = localStorage.getItem('x4_mod_studio_aiscripts');
    return saved ? JSON.parse(saved) : defaultAIScripts;
  });

  const saveScriptsState = (newScripts: typeof scripts) => {
    setScripts(newScripts);
    localStorage.setItem('x4_mod_studio_aiscripts', JSON.stringify(newScripts));
    
    // Also push to parent workspace as custom nodes to trigger saving inside directory explorer automatically
    setWorkspace(prev => ({
      ...prev,
      // Store reference inside workspace structure
      name: prev.name
    }));
  };

  const activeScript = scripts[activeScriptIdx] || scripts[0] || defaultAIScripts[0];

  const handleUpdateScriptProp = (key: string, value: any) => {
    const updated = scripts.map((s, idx) => {
      if (idx === activeScriptIdx) {
        return { ...s, [key]: value };
      }
      return s;
    });
    saveScriptsState(updated);
  };

  // AIScript Action manipulation
  const handleAddAction = (command: AIAction['command']) => {
    let defaults: Record<string, any> = {};
    let label = '';
    switch (command) {
      case 'move_to':
        defaults = { destination: '$target', speed: '100', precision: '50m' };
        label = 'Flight path transit task';
        break;
      case 'flee':
        defaults = { method: 'boost', duration: '20s' };
        label = 'Emergency retreat maneuver';
        break;
      case 'shoot':
        defaults = { target: '$enemy', weapon: 'all_weapons' };
        label = 'Engage hostile elements';
        break;
      case 'dock_at':
        defaults = { station: '$nearest_station', trade: 'false' };
        label = 'Docking transit alignment';
        break;
      case 'wait':
        defaults = { exact: '10s' };
        label = 'Hold alignment position';
        break;
      case 'find_objects':
        defaults = { class: 'ship', range: '10km' };
        label = 'Sensors scanner survey';
        break;
      case 'custom_xml':
        defaults = { rawXml: '<!-- Enter custom Egosoft scripting nodes here -->\n        <write_to_logbook text="\'AI script custom output...\'" />' };
        label = 'Generic instruction insert';
        break;
    }

    const nAct: AIAction = {
      id: `ai_act_${Date.now()}`,
      command,
      label,
      properties: defaults
    };

    const updated = scripts.map((s, idx) => {
      if (idx === activeScriptIdx) {
        return { ...s, actions: [...s.actions, nAct] };
      }
      return s;
    });
    saveScriptsState(updated);
  };

  const handleUpdateActionProp = (actionId: string, propKey: string, value: any) => {
    const updated = scripts.map((s, idx) => {
      if (idx === activeScriptIdx) {
        return {
          ...s,
          actions: s.actions.map(act => 
            act.id === actionId 
              ? { ...act, properties: { ...act.properties, [propKey]: value } }
              : act
          )
        };
      }
      return s;
    });
    saveScriptsState(updated);
  };

  const handleUpdateActionLabel = (actionId: string, label: string) => {
    const updated = scripts.map((s, idx) => {
      if (idx === activeScriptIdx) {
        return {
          ...s,
          actions: s.actions.map(act => 
            act.id === actionId ? { ...act, label } : act
          )
        };
      }
      return s;
    });
    saveScriptsState(updated);
  };

  const handleDeleteAction = (actionId: string) => {
    const updated = scripts.map((s, idx) => {
      if (idx === activeScriptIdx) {
        return {
          ...s,
          actions: s.actions.filter(act => act.id !== actionId)
        };
      }
      return s;
    });
    saveScriptsState(updated);
  };

  const handleCreateNewScript = () => {
    const name = prompt("Enter Name for new Behavior AIScript (e.g., trader.escort.patrol):", "trader.auto.haul");
    if (!name) return;
    
    const nScript = {
      id: `ai_script_${Date.now()}`,
      name,
      description: 'Custom NPC behavior script for pilot task management.',
      command: 'command.trade',
      attentionLevel: 'high' as const,
      params: [
        { name: 'range', type: 'number' as const, defaultValue: '5', comment: 'Maximum gate jump range' }
      ],
      interrupts: [],
      actions: [
        { id: 'init_act_1', command: 'find_objects' as const, label: 'Search for high margin transactions', properties: { class: 'station', range: '5' } }
      ]
    };
    
    saveScriptsState([...scripts, nScript]);
    setActiveScriptIdx(scripts.length);
  };

  const handleDeleteScript = () => {
    if (scripts.length <= 1) {
      alert("You should keep at least one AI Script template in the workspace.");
      return;
    }
    const filtered = scripts.filter((_, idx) => idx !== activeScriptIdx);
    setScripts(filtered);
    localStorage.setItem('x4_mod_studio_aiscripts', JSON.stringify(filtered));
    setActiveScriptIdx(0);
  };

  // Compile individual script into standard Egosoft aiscripts.xsd conforming XML
  const compileScriptToXML = (script: typeof activeScript): string => {
    let xml = `<?xml version="1.0" encoding="utf-8"?>
<aiscript name="${script.name}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="aiscripts.xsd">
  <!-- X4 Foundations Autopilot & Task Script Behavior -->
  <!-- Generated visually using X4 Mod Studio Behaviors Suite -->
  <params>
`;

    script.params.forEach(p => {
      xml += `    <param name="${p.name}" type="${p.type}" default="${p.defaultValue}" comment="${p.comment}" />\n`;
    });

    xml += `  </params>\n`;

    if (script.interrupts.length > 0) {
      xml += `  <interrupts>\n`;
      script.interrupts.forEach(int => {
        xml += `    <handler event="${int.event}">\n`;
        xml += `      <actions>\n`;
        if (int.action === 'flee') {
          xml += `        <run_script name="'move.flee'" />\n`;
        } else if (int.action === 'dock_at_safety') {
          xml += `        <run_script name="'move.dockat'" />\n`;
        } else {
          xml += `        <write_to_logbook text="'Interrupt event fired: ${int.event}'" />\n`;
        }
        xml += `      </actions>\n`;
        xml += `    </handler>\n`;
      });
      xml += `  </interrupts>\n`;
    }

    xml += `  <attention min="${script.attentionLevel}">\n`;
    xml += `    <actions>\n`;
    xml += `      <label name="start" />\n`;

    script.actions.forEach(act => {
      xml += `      <!-- Action: ${act.label} -->\n`;
      switch (act.command) {
        case 'move_to':
          xml += `      <move_to object="this.ship" destination="${act.properties.destination || '$target'}" forceposition="false" finishonfound="true">\n`;
          xml += `        <interrupt_after_time time="10s" />\n`;
          xml += `      </move_to>\n`;
          break;
        case 'flee':
          xml += `      <run_script name="'move.flee'" />\n`;
          break;
        case 'shoot':
          xml += `      <shoot_at object="this.ship" target="${act.properties.target || '$enemy'}" turretmode="attackhostile" />\n`;
          break;
        case 'dock_at':
          xml += `      <dock_at object="this.ship" station="${act.properties.station || '$station'}" />\n`;
          break;
        case 'wait':
          if (act.properties.exact) {
            xml += `      <wait exact="${act.properties.exact}" />\n`;
          } else {
            xml += `      <wait min="${act.properties.min || '2s'}" max="${act.properties.max || '10s'}" />\n`;
          }
          break;
        case 'find_objects':
          xml += `      <find_object name="$targets" class="class.${act.properties.class || 'ship'}" space="player.sector" multiple="true" />\n`;
          break;
        case 'custom_xml':
          xml += `      ${act.properties.rawXml || '<!-- custom nodes -->'}\n`;
          break;
      }
    });

    xml += `      <wait exact="5s" />\n`;
    xml += `      <resume label="start" />\n`;
    xml += `    </actions>\n`;
    xml += `  </attention>\n`;
    xml += `</aiscript>`;

    return xml;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("AIScript XML code copied onto clipboard!");
  };

  return (
    <div id="ai_script_editor_view" className="flex-1 bg-[#0a0c10] flex flex-col h-full overflow-hidden text-slate-300">
      {/* Simulation HUD Controls bar */}
      <div className="bg-[#161920]/90 border-b border-white/10 p-3 flex items-center justify-between font-mono text-xs">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-amber-500" />
          <span className="font-semibold text-slate-200 uppercase tracking-tight">AIScripts Behavior-Tree Engine</span>
        </div>
        
        {/* Scripts selectors */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleCreateNewScript}
            className="px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/25 hover:bg-amber-500/20 text-amber-400 font-bold uppercase text-[10px] cursor-pointer transition-all flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            New Script
          </button>
          
          <div className="flex items-center gap-1.5 bg-black/45 border border-white/10 p-0.5 rounded-md">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider px-1">Selected Script:</span>
            <select
              value={activeScriptIdx}
              onChange={(e) => setActiveScriptIdx(Number(e.target.value))}
              className="bg-[#0F1115] border border-transparent p-1 px-2 rounded text-[10px] font-mono text-slate-300 focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              {scripts.map((s, idx) => (
                <option key={s.id} value={idx}>{s.name}</option>
              ))}
            </select>
            <button
              onClick={handleDeleteScript}
              className="p-1 text-red-400 hover:bg-red-500/10 rounded transition-all cursor-pointer"
              title="Delete active behavior script"
            >
              <Trash className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left pane: parameters & description editor */}
        <div className="w-1/3 border-r border-white/10 p-4 space-y-4 overflow-y-auto">
          <div>
            <h3 className="text-xs font-mono font-bold text-amber-400 border-b border-white/10 pb-1.5 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Settings className="w-3.5 h-3.5" />
              Behavior Metadata
            </h3>
            <div className="space-y-3 bg-black/20 p-3 rounded border border-white/5 font-mono text-[11px]">
              <div>
                <label className="text-slate-400 block mb-1 uppercase text-[10px] tracking-wider">Script ID / Name</label>
                <input
                  type="text"
                  value={activeScript.name}
                  onChange={e => handleUpdateScriptProp('name', e.target.value)}
                  className="w-full p-2 rounded bg-black/50 border border-white/10 text-white focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 uppercase text-[10px] tracking-wider">Pilot Ship Command Tag</label>
                <select
                  value={activeScript.command}
                  onChange={e => handleUpdateScriptProp('command', e.target.value)}
                  className="w-full p-2 rounded bg-[#0F1115] border border-white/10 text-white focus:outline-none focus:border-amber-500 transition-colors cursor-pointer"
                >
                  <option value="command.move">command.move (Standard Transit)</option>
                  <option value="command.escort">command.escort (Fighter Defend/Escort)</option>
                  <option value="command.mine">command.mine (Asteroid Mineral Excavation)</option>
                  <option value="command.trade">command.trade (Ware Logistic Haulage)</option>
                  <option value="command.patrol">command.patrol (System Sector Recon)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 uppercase text-[10px] tracking-wider">Ship View Attention level</label>
                <div className="grid grid-cols-2 gap-1.5 mt-1 text-[10px]">
                  <button
                    onClick={() => handleUpdateScriptProp('attentionLevel', 'high')}
                    className={`py-1 rounded font-bold uppercase border transition-all cursor-pointer ${
                      activeScript.attentionLevel === 'high' 
                        ? 'border-amber-500 bg-amber-500/15 text-amber-400' 
                        : 'border-white/5 bg-transparent text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    High Attention (In-Sector)
                  </button>
                  <button
                    onClick={() => handleUpdateScriptProp('attentionLevel', 'low')}
                    className={`py-1 rounded font-bold uppercase border transition-all cursor-pointer ${
                      activeScript.attentionLevel === 'low' 
                        ? 'border-amber-500 bg-amber-500/15 text-amber-400' 
                        : 'border-white/5 bg-transparent text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    Low Attention (OOS)
                  </button>
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 uppercase text-[10px] tracking-wider">Behavior Description</label>
                <textarea
                  value={activeScript.description}
                  onChange={e => handleUpdateScriptProp('description', e.target.value)}
                  className="w-full p-2 h-14 rounded bg-black/50 border border-white/10 text-white focus:outline-none focus:border-amber-500 transition-colors resize-none font-sans"
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-mono font-bold text-amber-400 border-b border-white/10 pb-1.5 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              Pilot Params & Script Input Variables
            </h3>
            <div className="space-y-3 bg-black/20 p-3 rounded border border-white/5 font-mono text-[11px]">
              {activeScript.params.map((param, pid) => (
                <div key={pid} className="p-2 border border-white/5 bg-black/30 rounded-md space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-amber-500 font-bold">${param.name}</span>
                    <span className="text-slate-500 text-[9px] uppercase border border-slate-700 px-1 rounded">{param.type}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 leading-snug">
                    <span className="text-slate-500">Default:</span> {param.defaultValue}
                  </div>
                  <div className="text-[9.5px] italic text-slate-500">
                    "{param.comment}"
                  </div>
                </div>
              ))}
              <div className="text-[10px] text-slate-500 italic text-center p-2 border border-dashed border-white/10 rounded">
                Params enable the game GUI to configure NPC pilots easily. (Use "Add Script Target Configs").
              </div>
            </div>
          </div>
        </div>

        {/* Center pane: Visual Task Pipeline / Action queue */}
        <div className="w-1/3 p-4 flex flex-col border-r border-white/10 overflow-hidden">
          <h3 className="text-xs font-mono font-bold text-amber-400 border-b border-white/10 pb-1.5 uppercase tracking-wider mb-2 shrink-0 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Compass className="w-3.5 h-3.5 animate-spin-slow" />
              Behavior Task Action Pipeline
            </span>
            <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1 rounded font-bold uppercase font-mono">
              Loop Sequential
            </span>
          </h3>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1.5 py-1">
            {activeScript.actions.length === 0 ? (
              <div className="text-center py-20 text-[11px] font-mono text-slate-500 whitespace-pre">
                No active actions.<br />Click right buttons to inject tasks!
              </div>
            ) : (
              activeScript.actions.map((act, index) => (
                <div
                  key={act.id}
                  className="bg-[#1c1f26]/85 border border-white/5 hover:border-amber-500/40 p-3 rounded-lg flex flex-col space-y-2 transition-all shadow-md group relative"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center font-mono text-[9px] font-bold text-amber-400 shrink-0">
                        {index + 1}
                      </span>
                      <div>
                        {/* Interactive edit title */}
                        <input
                          type="text"
                          value={act.label}
                          onChange={(e) => handleUpdateActionLabel(act.id, e.target.value)}
                          className="font-semibold text-slate-200 text-xs bg-transparent border-b border-transparent hover:border-white/20 focus:border-amber-500 focus:outline-none transition-all py-0.5"
                        />
                        <div className="text-[9px] font-mono text-slate-500 uppercase mt-0.5 font-bold tracking-wider">
                          Egosoft Tag: &lt;{act.command === 'custom_xml' ? 'custom' : act.command}&gt;
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteAction(act.id)}
                      className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-black/35 opacity-40 group-hover:opacity-100 transition-all cursor-pointer"
                      title="Remove AI task node"
                    >
                      <Trash className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Node inputs fields */}
                  <div className="ml-6 grid grid-cols-1 gap-1.5 bg-black/25 p-2 rounded border border-white/5 font-mono text-[10px]">
                    {act.command === 'move_to' && (
                      <>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-slate-400 capitalize">Destination:</span>
                          <input
                            type="text"
                            value={act.properties.destination || ''}
                            onChange={(e) => handleUpdateActionProp(act.id, 'destination', e.target.value)}
                            className="bg-black/45 border border-white/10 rounded px-1.5 py-0.5 text-amber-400 text-right font-bold w-1/2"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-slate-400 capitalize">Throttle Speed (%):</span>
                          <input
                            type="text"
                            value={act.properties.speed || ''}
                            onChange={(e) => handleUpdateActionProp(act.id, 'speed', e.target.value)}
                            className="bg-black/45 border border-white/10 rounded px-1.5 py-0.5 text-white text-right w-1/3"
                          />
                        </div>
                      </>
                    )}

                    {act.command === 'wait' && (
                      <>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-slate-400 capitalize">Duration exact:</span>
                          <input
                            type="text"
                            value={act.properties.exact || ''}
                            onChange={(e) => handleUpdateActionProp(act.id, 'exact', e.target.value)}
                            className="bg-black/45 border border-white/10 rounded px-1.5 py-0.5 text-emerald-400 text-right w-1/3"
                            placeholder="e.g. 10s"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-1 text-[9px] text-slate-500 italic leading-none py-0.5">
                          <span>OR Randomize limits:</span>
                          <div className="flex gap-1 justify-end w-1/2">
                            <input
                              type="text"
                              value={act.properties.min || ''}
                              onChange={(e) => handleUpdateActionProp(act.id, 'min', e.target.value)}
                              className="bg-black/45 border border-white/10 rounded w-10 text-center text-white text-[8px]"
                              placeholder="min"
                            />
                            <span className="text-slate-600">-</span>
                            <input
                              type="text"
                              value={act.properties.max || ''}
                              onChange={(e) => handleUpdateActionProp(act.id, 'max', e.target.value)}
                              className="bg-black/45 border border-white/10 rounded w-10 text-center text-white text-[8px]"
                              placeholder="max"
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {act.command === 'shoot' && (
                      <>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-slate-400 capitalize">Target Combatant:</span>
                          <input
                            type="text"
                            value={act.properties.target || ''}
                            onChange={(e) => handleUpdateActionProp(act.id, 'target', e.target.value)}
                            className="bg-black/45 border border-white/10 rounded px-1.5 py-0.5 text-red-400 text-right font-bold w-1/2"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-slate-400 capitalize">Weapons Array:</span>
                          <select
                            value={act.properties.weapon || 'all_weapons'}
                            onChange={(e) => handleUpdateActionProp(act.id, 'weapon', e.target.value)}
                            className="bg-black/45 border border-white/10 rounded text-[9.5px] cursor-pointer text-white max-w-1/2 focus:outline-none"
                          >
                            <option value="all_weapons">All Guns & Turrets</option>
                            <option value="primary">Primary Flight Lasers</option>
                            <option value="turrets">Flak/Missile Turrets Only</option>
                          </select>
                        </div>
                      </>
                    )}

                    {act.command === 'find_objects' && (
                      <>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-slate-400 capitalize">Search Class:</span>
                          <select
                            value={act.properties.class || 'ship'}
                            onChange={(e) => handleUpdateActionProp(act.id, 'class', e.target.value)}
                            className="bg-black/45 border border-white/10 rounded text-amber-400 text-right text-[10px] pr-1"
                          >
                            <option value="ship">Ships & Squadrons</option>
                            <option value="asteroid">Mining Asteroids</option>
                            <option value="station">Factories & Trade hqs</option>
                            <option value="wreck">Salvageable Ship Wrecks</option>
                          </select>
                        </div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-slate-400 capitalize">Scan Distance range:</span>
                          <input
                            type="text"
                            value={act.properties.range || ''}
                            onChange={(e) => handleUpdateActionProp(act.id, 'range', e.target.value)}
                            className="bg-black/45 border border-white/10 rounded px-1.5 py-0.5 text-white text-right w-1/3"
                          />
                        </div>
                      </>
                    )}

                    {act.command === 'dock_at' && (
                      <>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-slate-400 capitalize">Dock Object:</span>
                          <input
                            type="text"
                            value={act.properties.station || ''}
                            onChange={(e) => handleUpdateActionProp(act.id, 'station', e.target.value)}
                            className="bg-black/45 border border-white/10 rounded px-1.5 py-0.5 text-cyan-400 text-right w-1/2"
                          />
                        </div>
                      </>
                    )}

                    {act.command === 'custom_xml' && (
                      <textarea
                        value={act.properties.rawXml || ''}
                        onChange={(e) => handleUpdateActionProp(act.id, 'rawXml', e.target.value)}
                        rows={3}
                        className="w-full bg-black/60 font-mono text-[9.5px] p-1.5 border border-white/10 focus:border-amber-500 rounded text-slate-300 resize-none"
                      />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Action additions toolbox */}
          <div className="mt-3 shrink-0 py-2 border-t border-white/10">
            <label className="text-slate-400 block mb-1.5 uppercase font-bold font-mono text-[9.5px] tracking-wider">
              ➕ Add AI behavior instruction node
            </label>
            <div className="grid grid-cols-3 gap-1 text-[9.5px] font-mono">
              <button
                onClick={() => handleAddAction('move_to')}
                className="py-1 px-1.5 text-center truncate bg-amber-500/10 border border-amber-500/20 hover:border-amber-500 hover:text-white rounded transition-all cursor-pointer"
              >
                航 Fly (Move To)
              </button>
              <button
                onClick={() => handleAddAction('wait')}
                className="py-1 px-1.5 text-center truncate bg-amber-500/10 border border-amber-500/20 hover:border-amber-500 hover:text-white rounded transition-all cursor-pointer"
              >
                ⏱ Wait (Delay)
              </button>
              <button
                onClick={() => handleAddAction('shoot')}
                className="py-1 px-1.5 text-center truncate bg-amber-500/10 border border-amber-500/20 hover:border-amber-500 hover:text-white rounded transition-all cursor-pointer"
              >
                ⚔ Shoot (Offensive)
              </button>
              <button
                onClick={() => handleAddAction('find_objects')}
                className="py-1 px-1.5 text-center truncate bg-amber-500/10 border border-amber-500/20 hover:border-amber-500 hover:text-white rounded transition-all cursor-pointer"
              >
                🛰 Search Objects
              </button>
              <button
                onClick={() => handleAddAction('dock_at')}
                className="py-1 px-1.5 text-center truncate bg-amber-500/10 border border-amber-500/20 hover:border-amber-500 hover:text-white rounded transition-all cursor-pointer"
              >
                ⛽ Dock At
              </button>
              <button
                onClick={() => handleAddAction('custom_xml')}
                className="py-1 px-1.5 text-center truncate bg-amber-500/10 border border-amber-500/20 hover:border-amber-500 hover:text-white rounded transition-all cursor-pointer"
              >
                ⚒ Custom Tag
              </button>
            </div>
          </div>
        </div>

        {/* Right pane: Script XML Preview compiler */}
        <div className="w-1/3 bg-[#0c0e14] border-l border-white/10 p-4 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3 shrink-0 font-mono text-xs">
            <div className="flex items-center gap-1.5 text-amber-500 font-semibold uppercase">
              <Code2 className="w-4 h-4" />
              <span>/aiscripts/{activeScript.name}.xml</span>
            </div>
            
            <button
              onClick={() => copyToClipboard(compileScriptToXML(activeScript))}
              className="px-2 py-0.5 rounded bg-black/45 hover:bg-black/80 font-bold uppercase text-[9.5px] border border-white/10 text-slate-300 hover:text-amber-400 cursor-pointer flex items-center gap-1"
            >
              Copy XML
            </button>
          </div>

          <div className="flex-1 bg-black/50 rounded-lg p-3 font-mono text-[10.5px] text-slate-400 overflow-y-auto relative custom-scrollbar border border-white/5 leading-normal select-text selection:bg-amber-500/25">
            <pre className="whitespace-pre">
              {compileScriptToXML(activeScript)}
            </pre>
          </div>
          
          <div className="mt-3 bg-amber-900/10 border border-amber-500/20 rounded p-2 text-[10px] leading-relaxed text-slate-400">
            <HelpCircle className="w-3.5 h-3.5 text-amber-500 inline mr-1" />
            <span className="font-semibold text-amber-400">NPC Task Scripts vs. Mission Director:</span> AIScripts are executed strictly contextually on the target pilots AI loop (e.g. piloting behaviors), whereas Mission Director scripts handle outer triggers, notifications and sector creation events.
          </div>
        </div>
      </div>
    </div>
  );
}
