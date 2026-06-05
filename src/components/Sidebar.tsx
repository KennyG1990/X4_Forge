/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  FolderGit2, 
  Layers, 
  Layout, 
  Settings, 
  Lightbulb, 
  Plus, 
  Sliders, 
  Wrench,
  Sparkles,
  Info
} from 'lucide-react';
import { 
  NODE_TEMPLATES, 
  X4_FACTIONS, 
  X4_SHIP_MACROS, 
  X4_STATION_MACROS, 
  ModWorkspace, 
  MDNode, 
  UIWidget 
} from '../types';
import DirectoryExplorer from './DirectoryExplorer';

interface SidebarProps {
  activeTab: 'script' | 'ui' | 'config' | 'filesystem';
  setActiveTab: (tab: 'script' | 'ui' | 'config' | 'filesystem') => void;
  workspace: ModWorkspace;
  setWorkspace: React.Dispatch<React.SetStateAction<ModWorkspace>>;
  onAddNode: (template: any) => void;
  onAddUIWidget: (type: string) => void;
  selectedNode: MDNode | null;
  setSelectedNode: React.Dispatch<React.SetStateAction<MDNode | null>>;
  selectedWidget: UIWidget | null;
  setSelectedWidget: React.Dispatch<React.SetStateAction<UIWidget | null>>;
  dirHandle: any | null;
  setDirHandle: (handle: any | null) => void;
  dirName: string;
  setDirName: (name: string) => void;
  saveCheckpoint: (customTarget?: ModWorkspace) => void;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  workspace,
  setWorkspace,
  onAddNode,
  onAddUIWidget,
  selectedNode,
  setSelectedNode,
  selectedWidget,
  setSelectedWidget,
  dirHandle,
  setDirHandle,
  dirName,
  setDirName,
  saveCheckpoint
}: SidebarProps) {
  const [nodeFilter, setNodeFilter] = useState<'all' | 'cue' | 'event' | 'condition' | 'action'>('all');

  const filteredTemplates = NODE_TEMPLATES.filter(
    t => nodeFilter === 'all' || t.type === nodeFilter
  );

  // Property editor change handling
  const handlePropChange = (key: string, value: any) => {
    if (selectedNode) {
      setWorkspace(prev => ({
        ...prev,
        nodes: prev.nodes.map(n => 
          n.id === selectedNode.id 
            ? { ...n, properties: { ...n.properties, [key]: value } }
            : n
        )
      }));
      // Update selected node state to sync preview
      setSelectedNode(prev => prev ? { ...prev, properties: { ...prev.properties, [key]: value } } : null);
    } else if (selectedWidget) {
      setWorkspace(prev => ({
        ...prev,
        uiWidgets: prev.uiWidgets.map(w => 
          w.id === selectedWidget.id 
            ? { ...w, properties: { ...w.properties, [key]: value } }
            : w
        )
      }));
      // Update selected widget state to sync preview
      setSelectedWidget(prev => prev ? { ...prev, properties: { ...prev.properties, [key]: value } } : null);
    }
  };

  const handleLabelChange = (newLabel: string) => {
    if (selectedNode) {
      setWorkspace(prev => ({
        ...prev,
        nodes: prev.nodes.map(n => 
          n.id === selectedNode.id ? { ...n, label: newLabel } : n
        )
      }));
      setSelectedNode(prev => prev ? { ...prev, label: newLabel } : null);
    } else if (selectedWidget) {
      setWorkspace(prev => ({
        ...prev,
        uiWidgets: prev.uiWidgets.map(w => 
          w.id === selectedWidget.id ? { ...w, label: newLabel } : w
        )
      }));
      setSelectedWidget(prev => prev ? { ...prev, label: newLabel } : null);
    }
  };

  return (
    <div id="side_panel" className="w-80 border-r border-white/5 bg-[#12141a] flex flex-col h-full text-slate-300">
      {/* Category Tabs */}
      <div className="flex border-b border-white/10 bg-[#161920]/40">
        <button
          id="tab_script"
          onClick={() => setActiveTab('script')}
          className={`flex-1 py-3 text-xs font-mono font-bold tracking-tight border-b-2 flex flex-col items-center gap-1 transition-all cursor-pointer ${
            activeTab === 'script'
              ? 'border-cyan-500 text-white bg-cyan-600/10'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <Layers className="w-4 h-4" />
          MD NODES
        </button>
        <button
          id="tab_ui"
          onClick={() => setActiveTab('ui')}
          className={`flex-1 py-3 text-xs font-mono font-bold tracking-tight border-b-2 flex flex-col items-center gap-1 transition-all cursor-pointer ${
            activeTab === 'ui'
              ? 'border-cyan-500 text-white bg-cyan-600/10'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <Layout className="w-4 h-4" />
          MENU WIDGETS
        </button>
        <button
          id="tab_config"
          onClick={() => setActiveTab('config')}
          className={`flex-1 py-3 text-xs font-mono font-bold tracking-tight border-b-2 flex flex-col items-center gap-1 transition-all cursor-pointer ${
            activeTab === 'config'
              ? 'border-cyan-500 text-white bg-cyan-600/10'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <Settings className="w-4 h-4" />
          MOD META
        </button>
        <button
          id="tab_filesystem"
          onClick={() => setActiveTab('filesystem')}
          className={`flex-1 py-3 text-xs font-mono font-bold tracking-tight border-b-2 flex flex-col items-center gap-1 transition-all cursor-pointer ${
            activeTab === 'filesystem'
              ? 'border-cyan-500 text-white bg-cyan-600/10'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <FolderGit2 className="w-4 h-4" />
          FILESYSTEM
        </button>
      </div>

      {/* Main Content Pane */}
      <div className={`flex-1 overflow-y-auto ${activeTab === 'filesystem' ? 'p-0' : 'p-4 space-y-4'}`}>
        {activeTab === 'filesystem' && (
          <DirectoryExplorer
            dirHandle={dirHandle}
            setDirHandle={setDirHandle}
            dirName={dirName}
            setDirName={setDirName}
            workspace={workspace}
            setWorkspace={setWorkspace}
            saveCheckpoint={saveCheckpoint}
          />
        )}

        {/* NODE COMPONENT LIBRARY LIST (Tab: script) */}
        {activeTab === 'script' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-mono font-semibold text-cyan-400 mb-2 tracking-wider uppercase">Node Types</h3>
              <div className="grid grid-cols-2 gap-1 bg-black/20 p-1 rounded border border-white/5">
                {(['all', 'cue', 'event', 'condition', 'action'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setNodeFilter(type)}
                    className={`px-2 py-1 text-[10px] font-mono rounded capitalize transition-all cursor-pointer ${
                      nodeFilter === type
                        ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/30'
                        : 'text-slate-400 hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-mono font-semibold text-slate-400 mb-2 tracking-wider uppercase flex items-center gap-1">
                <Wrench className="w-3 h-3 text-cyan-400" />
                TOOLBOX (CLICK TO CREATE)
              </h3>
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {filteredTemplates.map((template, idx) => {
                  let badgeColors = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
                  if (template.type === 'cue') badgeColors = 'bg-purple-500/10 text-purple-400 border-purple-500/20';
                  if (template.type === 'event') badgeColors = 'bg-amber-500/10 text-amber-400 border-amber-500/30';
                  if (template.type === 'condition') badgeColors = 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
                  if (template.type === 'action') badgeColors = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';

                  return (
                    <button
                      key={idx}
                      onClick={() => onAddNode(template)}
                      className="w-full text-left p-2 rounded bg-[#1c1f26] border border-white/5 hover:border-cyan-500/50 transition-all flex items-center justify-between group cursor-pointer"
                    >
                      <div>
                        <div className="text-xs font-medium text-slate-200 group-hover:text-white transition-colors">
                          {template.label}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          &lt;{template.xmlTag}&gt;
                        </div>
                      </div>
                      <span className={`text-[9px] font-mono border px-1.5 py-0.5 rounded ${badgeColors}`}>
                        {template.type.toUpperCase()}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* UI MOD CUSTOMIZER WIDGETS (Tab: ui) */}
        {activeTab === 'ui' && (
          <div className="space-y-4">
            <div className="bg-cyan-900/10 border border-cyan-500/20 p-3 rounded text-[11px] leading-relaxed text-slate-400">
              <span className="text-cyan-400 font-semibold block mb-1">X4 Custom UI Rules:</span>
              Design working contextual HUD menus or consoles. Add containers, tables, lists, progress bars and macro buttons. Widgets are fully interactive on the terminal.
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-mono font-semibold text-slate-400 mb-2 tracking-wider uppercase">UI Widgets Library</h3>
              {[
                { type: 'window', title: 'Context Window Frame', desc: 'Outer widget window layout container' },
                { type: 'header', title: 'Tactical Title / Header', desc: 'Wide high-contrast cyber text decoration line' },
                { type: 'table', title: 'Standard Data Table', desc: 'Pre-styled multi-row grid framework' },
                { type: 'button', title: 'Macro Menu Button', desc: 'Fires visual cues on selection click' },
                { type: 'progressbar', title: 'Status Progress Bar', desc: 'Elegant status / shield indicator' },
                { type: 'text', title: 'Display Label', desc: 'Human-readable description labels' },
                { type: 'dropdown', title: 'Interactive Selector', desc: 'Drop-down values list widget' }
              ].map(widget => (
                <button
                  key={widget.type}
                  onClick={() => onAddUIWidget(widget.type)}
                  className="w-full text-left p-2.5 rounded bg-[#1c1f26] border border-white/5 hover:bg-cyan-600/10 hover:border-cyan-500/50 transition-all flex items-center justify-between group cursor-pointer"
                >
                  <div>
                    <div className="text-xs font-medium text-slate-200 group-hover:text-white capitalize">
                      {widget.title}
                    </div>
                    <div className="text-[9px] text-slate-500 font-mono mt-0.5">
                      {widget.desc}
                    </div>
                  </div>
                  <Plus className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* METADATA CONFIG (Tab: config) */}
        {activeTab === 'config' && (
          <div className="space-y-4 font-mono text-xs">
            <div className="space-y-3">
              <div>
                <label className="text-slate-400 block mb-1 uppercase text-[10px] tracking-wider">Mod Script Identifier</label>
                <input
                  type="text"
                  value={workspace.name}
                  onChange={e => setWorkspace(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full p-2 rounded bg-black/50 border border-white/10 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                  placeholder="e.g. My_Elite_Mod"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 uppercase text-[10px] tracking-wider">Version String</label>
                <input
                  type="text"
                  value={workspace.version}
                  onChange={e => setWorkspace(prev => ({ ...prev, version: e.target.value }))}
                  className="w-full p-2 rounded bg-black/50 border border-white/10 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                  placeholder="e.g. 1.0.0"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 uppercase text-[10px] tracking-wider">Author Name</label>
                <input
                  type="text"
                  value={workspace.author}
                  onChange={e => setWorkspace(prev => ({ ...prev, author: e.target.value }))}
                  className="w-full p-2 rounded bg-black/50 border border-white/10 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                  placeholder="Your Name"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 uppercase text-[10px] tracking-wider">Mod Description</label>
                <textarea
                  value={workspace.description}
                  onChange={e => setWorkspace(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full p-2 h-20 rounded bg-black/50 border border-white/10 text-white focus:outline-none focus:border-cyan-500 transition-colors resize-none"
                  placeholder="Mod brief synopsis..."
                />
              </div>
            </div>
          </div>
        )}

        {/* COMPONENT INSPECTOR OR PROPERTY VIEWER PANEL */}
        {(selectedNode || selectedWidget) && (
          <div className="border-t border-white/10 pt-4 mt-2">
            <h3 className="text-xs font-mono font-semibold text-cyan-400 mb-3 tracking-wider uppercase flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" />
              PROPERTIES INSPECTOR
            </h3>

            <div className="space-y-3 bg-[#0F1115] p-3 rounded border border-white/10 font-mono text-[11px]">
              <div>
                <label className="text-slate-400 block mb-1 font-semibold uppercase text-[9px] tracking-wider">Display Label</label>
                <input
                  type="text"
                  value={selectedNode ? selectedNode.label : (selectedWidget ? selectedWidget.label : '')}
                  onChange={e => handleLabelChange(e.target.value)}
                  className="w-full p-1.5 rounded bg-black/60 border border-white/10 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              {selectedNode && (selectedNode.propertiesSchema || []).map(schema => (
                <div key={schema.key}>
                  <label className="text-slate-400 block mb-1 uppercase text-[9px] tracking-wider flex items-center justify-between">
                    <span>{schema.label}</span>
                    {schema.description && (
                      <span className="group relative cursor-pointer ml-1">
                        <Info className="w-3 h-3 text-slate-500 hover:text-slate-300" />
                        <span className="hidden group-hover:block absolute right-0 bottom-4 w-44 bg-slate-900 border border-white/10 text-[9px] p-1.5 rounded shadow z-50 normal-case font-sans">
                          {schema.description}
                        </span>
                      </span>
                    )}
                  </label>

                  {schema.type === 'text' && (
                    <input
                      type="text"
                      value={(selectedNode.properties || {})[schema.key] || ''}
                      onChange={e => handlePropChange(schema.key, e.target.value)}
                      placeholder={schema.placeholder}
                      className="w-full p-1.5 rounded bg-black/60 border border-white/10 text-white focus:outline-none focus:border-cyan-500"
                    />
                  )}

                  {schema.type === 'number' && (
                    <input
                      type="number"
                      value={(selectedNode.properties || {})[schema.key] || ''}
                      onChange={e => handlePropChange(schema.key, Number(e.target.value))}
                      placeholder={schema.placeholder}
                      className="w-full p-1.5 rounded bg-black/60 border border-white/10 text-white focus:outline-none focus:border-cyan-500"
                    />
                  )}

                  {schema.type === 'select' && schema.options && (
                    <select
                      value={(selectedNode.properties || {})[schema.key] || ''}
                      onChange={e => handlePropChange(schema.key, e.target.value)}
                      className="w-full p-1.5 rounded bg-black/60 border border-white/10 text-white focus:outline-none focus:border-cyan-500"
                    >
                      {schema.options.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  )}

                  {schema.type === 'coordinates' && (
                    <input
                      type="text"
                      value={(selectedNode.properties || {})[schema.key] || ''}
                      onChange={e => handlePropChange(schema.key, e.target.value)}
                      placeholder="X,Y,Z offset"
                      className="w-full p-1.5 rounded bg-black/60 border border-white/10 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                    />
                  )}
                </div>
              ))}

              {selectedWidget && (
                <div className="space-y-3">
                  {selectedWidget.type === 'progressbar' && (
                    <div>
                      <label className="text-slate-400 block mb-1 uppercase text-[9px] tracking-wider">Progress Value (%)</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={selectedWidget.properties.value || 75}
                        onChange={e => handlePropChange('value', Number(e.target.value))}
                        className="w-full accent-cyan-500"
                      />
                    </div>
                  )}

                  {selectedWidget.type === 'button' && (
                    <>
                      <div>
                        <label className="text-slate-400 block mb-1 uppercase text-[9px] tracking-wider">Interaction Command</label>
                        <select
                          value={selectedWidget.properties.action || 'signal_cue'}
                          onChange={e => handlePropChange('action', e.target.value)}
                          className="w-full p-1.5 rounded bg-black/60 border border-white/10 text-white focus:outline-none focus:border-cyan-500"
                        >
                          <option value="signal_cue">Signal Mission Cue</option>
                          <option value="dismiss">Dismiss Pilots</option>
                          <option value="standing">Raise standing rep</option>
                          <option value="claim">Claim rewards</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-slate-400 block mb-1 uppercase text-[9px] tracking-wider">Target Cue ID</label>
                        <input
                          type="text"
                          value={selectedWidget.properties.targetCue || 'MyMissionCue'}
                          onChange={e => handlePropChange('targetCue', e.target.value)}
                          className="w-full p-1.5 rounded bg-black/60 border border-white/10 text-white focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer System Credits */}
      <div className="p-3 border-t border-white/5 bg-black/45 text-center text-[10px] font-mono text-slate-500">
        Engine Context: Egosoft MD 4.5
      </div>
    </div>
  );
}
