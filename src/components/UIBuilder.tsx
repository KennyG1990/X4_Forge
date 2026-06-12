/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Palette, 
  Trash2, 
  Layers, 
  Eye, 
  Maximize2,
  Trash,
  Move,
  Cpu,
  Code2,
  Terminal,
  FileCode
} from 'lucide-react';
import { LUA_SNIPPETS, fillLuaSnippet } from '../lib/luaSnippets';
import { UIWidget, ModWorkspace } from '../types';

interface UIBuilderProps {
  workspace: ModWorkspace;
  setWorkspace: React.Dispatch<React.SetStateAction<ModWorkspace>>;
  selectedWidget: UIWidget | null;
  setSelectedWidget: (widget: UIWidget | null) => void;
}

export default function UIBuilder({
  workspace,
  setWorkspace,
  selectedWidget,
  setSelectedWidget
}: UIBuilderProps) {
  const [activePresetTheme, setActivePresetTheme] = useState<string>('argon-amber');
  const [draggedWidgetId, setDraggedWidgetId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [activeUiSubTab, setActiveUiSubTab] = useState<'canvas' | 'lua'>('canvas');
  const [selectedLuaTemplate, setSelectedLuaTemplate] = useState<string>('standard');
  // Pre-fill vetted-snippet placeholders from the active integration contract, if any.
  const _contract = workspace.integrationContract;
  const _ep0 = _contract && _contract.endpoints && _contract.endpoints[0];
  const snippetValues: Record<string, string> = _contract ? {
    NS: _contract.namespace || 'myext',
    EVENT: (_ep0 && _ep0.id) || 'my_event',
    URL: (_contract.baseUrl || 'http://127.0.0.1:8713') + ((_ep0 && _ep0.path) || '/v1/endpoint'),
    HTTP_CLIENT: _contract.httpClientExpr || 'require("extensions.sn_mod_support_apis.lua.simple_http")'
  } : {};
  const [luaMode, setLuaMode] = useState<'preview' | 'edit'>('preview');
  const insertSelectedPattern = () => {
    const snip = LUA_SNIPPETS.find(sn => sn.id === selectedLuaTemplate);
    const code = snip ? fillLuaSnippet(selectedLuaTemplate, snippetValues) : '';
    if (!code) return;
    setWorkspace(prev => ({ ...prev, customLua: (prev.customLua || '') + (prev.customLua ? '\n\n' : '') + code }));
    setLuaMode('edit');
  };

  const theme = workspace.uiTheme;

  // X4 Standard theme presets
  const THEME_PRESETS = [
    { id: 'argon-amber', label: 'Argon Amber', bg: '#0d0d14', border: '#df9825', accent: '#f59e0b' },
    { id: 'terran-blue', label: 'Terran Blue', bg: '#0b101a', border: '#3b82f6', accent: '#60a5fa' },
    { id: 'xenon-red', label: 'Xenon Red', bg: '#0f0505', border: '#ef4444', accent: '#f87171' },
    { id: 'boron-cyan', label: 'Boron Cyan', bg: '#02181b', border: '#06b6d4', accent: '#22d3ee' }
  ];

  const applyThemePreset = (presetId: string) => {
    const found = THEME_PRESETS.find(p => p.id === presetId);
    if (found) {
      setActivePresetTheme(presetId);
      setWorkspace(prev => ({
        ...prev,
        uiTheme: {
          ...prev.uiTheme,
          backgroundColor: found.bg,
          borderColor: found.border,
          accentColor: found.accent
        }
      }));
    }
  };

  // Modify individual theme variables in the builder
  const updateThemeProp = (key: string, value: any) => {
    setWorkspace(prev => ({
      ...prev,
      uiTheme: {
        ...prev.uiTheme,
        [key]: value
      }
    }));
  };

  // Drag operations
  const startDragWidget = (widgetId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDraggedWidgetId(widgetId);
    const widget = workspace.uiWidgets.find(w => w.id === widgetId);
    if (widget) {
      setSelectedWidget(widget);
      // Math to prevent snapping
      const rect = e.currentTarget.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  };

  const handleContainerMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggedWidgetId) {
      const containerRect = e.currentTarget.getBoundingClientRect();
      // Snap to grid of 10px
      const rawX = e.clientX - containerRect.left - dragOffset.x;
      const rawY = e.clientY - containerRect.top - dragOffset.y;
      
      const snappedX = Math.max(0, Math.min(Math.round(rawX / 10) * 10, containerRect.width - 100));
      const snappedY = Math.max(0, Math.min(Math.round(rawY / 10) * 10, containerRect.height - 40));

      setWorkspace(prev => ({
        ...prev,
        uiWidgets: prev.uiWidgets.map(w => 
          w.id === draggedWidgetId ? { ...w, x: snappedX, y: snappedY } : w
        )
      }));
    }
  };

  const handleContainerMouseUp = () => {
    setDraggedWidgetId(null);
  };

  const deleteWidget = (widgetId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setWorkspace(prev => ({
      ...prev,
      uiWidgets: prev.uiWidgets.filter(w => w.id !== widgetId)
    }));
    if (selectedWidget?.id === widgetId) {
      setSelectedWidget(null);
    }
  };

  const resizeWidget = (widgetId: string, widthChange: number, heightChange: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setWorkspace(prev => ({
      ...prev,
      uiWidgets: prev.uiWidgets.map(w => 
        w.id === widgetId 
          ? { ...w, w: Math.max(60, w.w + widthChange), h: Math.max(30, w.h + heightChange) }
          : w
      )
    }));
  };

  return (
    <div className="flex-1 bg-[#0a0c10] flex flex-col h-full overflow-hidden text-slate-300">
      {/* Simulation Controls HUD bar */}
      <div className="bg-[#161920]/90 border-b border-white/10 p-3 flex items-center justify-between font-mono text-xs">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-slate-200">X4 CUSTOM COCKPIT INTERFACE AND LUA CONSOLE</span>
        </div>
        
        {/* Preset selections and Tab switches */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-black/45 border border-white/10 p-0.5 rounded-md">
            <button
              onClick={() => setActiveUiSubTab('canvas')}
              className={`px-3 py-1 rounded text-[10px] uppercase font-bold transition-all cursor-pointer ${
                activeUiSubTab === 'canvas' ? 'bg-cyan-500/15 text-cyan-400 font-extrabold' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Layout GUI Designer
            </button>
            <button
              onClick={() => setActiveUiSubTab('lua')}
              className={`px-3 py-1 rounded text-[10px] uppercase font-bold transition-all cursor-pointer ${
                activeUiSubTab === 'lua' ? 'bg-cyan-500/15 text-cyan-400 font-extrabold' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              LUA Script Event Manager
            </button>
          </div>

          <div className="h-4 w-px bg-white/10" />

          {activeUiSubTab === 'canvas' && (
            <div className="flex items-center gap-1.5">
              {THEME_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => applyThemePreset(preset.id)}
                  className={`px-3 py-1 rounded text-[10px] uppercase font-bold border transition-all cursor-pointer ${
                    activePresetTheme === preset.id
                      ? 'border-cyan-500 bg-cyan-600/15 text-cyan-400'
                      : 'border-transparent bg-black/40 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {activeUiSubTab === 'canvas' ? (
        <div className="flex-1 flex overflow-hidden">
          {/* Custom Theme sliders & HUD hierarchy tree */}
          <div className="w-[290px] border-r border-[#1e2230]/50 bg-[#12141a] flex flex-col justify-between shadow-inner shrink-0 overflow-y-auto">
            <div className="p-3.5 space-y-4 font-mono text-xs">
              
              {/* SECTION 1: Widgets Hierarchy Tree section */}
              <div className="space-y-2">
                <h4 className="text-slate-200 uppercase font-bold text-[10px] tracking-wider mb-2.5 flex items-center gap-1.5 border-b border-white/5 pb-1">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" /> cockpit modules tree
                </h4>

                <div className="space-y-3 font-mono text-[11px] max-h-60 overflow-y-auto custom-scrollbar pr-1">
                  {workspace.uiWidgets.length === 0 ? (
                    <div className="text-[10px] text-slate-500 italic p-3 text-center border border-white/5 bg-black/10 rounded">
                      No viewport cockpit widgets created yet. Use the sidebar "+ Add Widget" to create some!
                    </div>
                  ) : (
                    <>
                      {/* Subcategory 1: Panels and Containers */}
                      {workspace.uiWidgets.some(w => w.type === 'window' || w.type === 'table') && (
                        <div className="space-y-1">
                          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wide block">🖥 Layout & Panels</span>
                          <div className="pl-2 border-l border-white/5 space-y-1">
                            {workspace.uiWidgets
                              .filter(w => w.type === 'window' || w.type === 'table')
                              .map(widget => {
                                const isSel = selectedWidget?.id === widget.id;
                                return (
                                  <div 
                                    key={widget.id}
                                    className={`flex items-center justify-between p-1 px-2 rounded group transition-all text-[10px] ${
                                      isSel ? 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-bold' : 'hover:bg-white/5 text-slate-400'
                                    }`}
                                  >
                                    <button 
                                      onClick={() => setSelectedWidget(widget)}
                                      className="flex-1 text-left cursor-pointer truncate"
                                    >
                                      <span>{widget.type === 'window' ? '🔲 Window' : '📊 Grid Table'}</span>
                                      <span className="text-[8.5px] text-slate-500 font-normal block">ID: {widget.id.substring(7, 13)} ({widget.w}x{widget.h})</span>
                                    </button>
                                    <button 
                                      onClick={(e) => deleteWidget(widget.id, e)}
                                      className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-rose-400 transition-opacity p-0.5"
                                      title="Delete widget node"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}

                      {/* Subcategory 2: Interactive Controls / Actions */}
                      {workspace.uiWidgets.some(w => w.type === 'button' || w.type === 'dropdown' || w.type === 'input') && (
                        <div className="space-y-1 pt-1">
                          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wide block">🔘 Signals & Controls</span>
                          <div className="pl-2 border-l border-white/5 space-y-1">
                            {workspace.uiWidgets
                              .filter(w => w.type === 'button' || w.type === 'dropdown' || w.type === 'input')
                              .map(widget => {
                                const isSel = selectedWidget?.id === widget.id;
                                return (
                                  <div 
                                    key={widget.id}
                                    className={`flex items-center justify-between p-1 px-2 rounded group transition-all text-[10px] ${
                                      isSel ? 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-bold' : 'hover:bg-white/5 text-slate-400'
                                    }`}
                                  >
                                    <button 
                                      onClick={() => setSelectedWidget(widget)}
                                      className="flex-1 text-left cursor-pointer truncate"
                                    >
                                      <span className="truncate block font-medium">
                                        {widget.type === 'button' ? '🔘 Addon Action Key' : widget.type === 'dropdown' ? '⚙ Option Selector' : '📥 Field Input'}
                                      </span>
                                      <span className="text-[8.5px] text-slate-500 font-normal block truncate">Label: "{widget.label || 'None'}"</span>
                                    </button>
                                    <button 
                                      onClick={(e) => deleteWidget(widget.id, e)}
                                      className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-rose-400 transition-opacity p-0.5"
                                      title="Delete widget node"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}

                      {/* Subcategory 3: Telemetry Feedback Display */}
                      {workspace.uiWidgets.some(w => w.type === 'progressbar' || w.type === 'chat' || w.type === 'text' || w.type === 'header') && (
                        <div className="space-y-1 pt-1">
                          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wide block">📡 Gauges & Telemetry</span>
                          <div className="pl-2 border-l border-white/5 space-y-1">
                            {workspace.uiWidgets
                              .filter(w => w.type === 'progressbar' || w.type === 'chat' || w.type === 'text' || w.type === 'header')
                              .map(widget => {
                                const isSel = selectedWidget?.id === widget.id;
                                return (
                                  <div 
                                    key={widget.id}
                                    className={`flex items-center justify-between p-1 px-2 rounded group transition-all text-[10px] ${
                                      isSel ? 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-bold' : 'hover:bg-white/5 text-slate-400'
                                    }`}
                                  >
                                    <button 
                                      onClick={() => setSelectedWidget(widget)}
                                      className="flex-1 text-left cursor-pointer truncate"
                                    >
                                      <span className="truncate block">
                                        {widget.type === 'progressbar' ? '⚡ Shield Rate Tube' : widget.type === 'chat' ? '💬 Fleet Audio Feed' : widget.type === 'text' ? '📝 Static Title' : '🛰 Title Bar'}
                                      </span>
                                      <span className="text-[8.5px] text-slate-500 font-normal block truncate">ID: {widget.id.substring(7, 13)}</span>
                                    </button>
                                    <button 
                                      onClick={(e) => deleteWidget(widget.id, e)}
                                      className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-rose-400 transition-opacity p-0.5"
                                      title="Delete widget node"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* SECTION 2: Custom Theme Parameter selection */}
              <div className="space-y-2 pt-2 border-t border-white/5">
                <h4 className="text-slate-200 uppercase font-bold text-[10px] tracking-wider mb-2 flex items-center gap-1.5 pb-1">
                  <Palette className="w-3.5 h-3.5 text-cyan-400" /> HUD Aesthetics
                </h4>

                <div className="space-y-3">
                  <div>
                    <label className="text-slate-400 block mb-1 uppercase text-[9px] tracking-wider">Window Background Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={theme.backgroundColor}
                        onChange={e => updateThemeProp('backgroundColor', e.target.value)}
                        className="w-8 h-8 rounded border border-white/15 bg-transparent p-0 cursor-pointer"
                      />
                      <span className="text-[10px] text-slate-400 uppercase">{theme.backgroundColor}</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1 uppercase text-[9px] tracking-wider">Primary Neon Border</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={theme.borderColor}
                        onChange={e => updateThemeProp('borderColor', e.target.value)}
                        className="w-8 h-8 rounded border border-white/15 bg-transparent p-0 cursor-pointer"
                      />
                      <span className="text-[10px] text-slate-400 uppercase">{theme.borderColor}</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1 uppercase text-[9px] tracking-wider">Accent Command Elements</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={theme.accentColor}
                        onChange={e => updateThemeProp('accentColor', e.target.value)}
                        className="w-8 h-8 rounded border border-white/15 bg-transparent p-0 cursor-pointer"
                      />
                      <span className="text-[10px] text-slate-400 uppercase">{theme.accentColor}</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1 uppercase text-[9px] tracking-wider">HUD Panel Opacity ({Math.round(theme.opacity * 100)}%)</label>
                    <input
                      type="range"
                      min="0.3"
                      max="1.0"
                      step="0.05"
                      value={theme.opacity}
                      onChange={e => updateThemeProp('opacity', parseFloat(e.target.value))}
                      className="w-full accent-cyan-500"
                    />
                  </div>

                  <div className="flex items-center justify-between border-t border-white/5 pt-3 mt-3">
                    <label className="text-slate-400 uppercase text-[9px] tracking-wider">Display Interaction Icons</label>
                    <input
                      type="checkbox"
                      checked={theme.showIcons}
                      onChange={e => updateThemeProp('showIcons', e.target.checked)}
                      className="rounded accent-cyan-500 w-3.5 h-3.5 bg-black border-slate-600 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

            </div>

            <div className="p-3 bg-cyan-950/20 border-t border-white/5 shrink-0 select-none">
              <span className="text-cyan-400 font-bold block text-[10px] uppercase mb-1">Cockpit simulation active</span>
              <p className="text-[9.5px] text-slate-500 leading-normal font-sans">
                Widget parameters synchronize live. Select any element inside the cockpit simulation grid structure or direct list tree to manipulate its coordinate properties.
              </p>
            </div>
          </div>

          {/* Large Game Cockpit Simulator Window Frame */}
          <div className="flex-1 bg-[#07080b] p-6 flex items-center justify-center relative overflow-auto">
            
            {/* Simulated flight cockpit monitor overlay background */}
            <div className="absolute inset-0 pointer-events-none bg-radial-gradient flex items-center justify-center opacity-35 select-none">
              <div className="border border-cyan-500/10 w-[80%] h-[80%] rounded-full animate-pulse" />
              <div className="absolute text-[8px] font-mono text-cyan-500/45 tracking-widest bottom-6">HUD RADAR SCANNER ACTIVE</div>
            </div>

            {/* Interactive Custom Menu Screen Frame */}
            <div
              onMouseMove={handleContainerMouseMove}
              onMouseUp={handleContainerMouseUp}
              style={{
                backgroundColor: theme.backgroundColor,
                borderColor: theme.borderColor,
                opacity: theme.opacity
              }}
              className="w-[740px] h-[480px] rounded-lg border-2 shadow-2xl relative overflow-hidden transition-all duration-150 flex flex-col select-none"
            >
              {/* Embedded X4 top window trim */}
              <div 
                style={{ borderColor: theme.borderColor, backgroundColor: `${theme.borderColor}15` }}
                className="px-4 py-2 border-b flex items-center justify-between font-mono"
              >
                <div className="flex items-center gap-1.5">
                  <span style={{ color: theme.borderColor }} className="font-extrabold text-xs tracking-wider uppercase">
                    {workspace.name || 'COCKPIT MENU'} MODULE
                  </span>
                  <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">v{workspace.version}</span>
                </div>
                <div style={{ backgroundColor: theme.borderColor }} className="w-2.5 h-2.5 rounded-full hover:opacity-85 cursor-pointer" />
              </div>

              {/* Grid canvas elements box */}
              <div className="flex-1 p-4 relative bg-[#000000]/15" 
                  style={{ 
                    backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px)', 
                    backgroundSize: '10px 10px' 
                  }}>
                
                {workspace.uiWidgets.length === 0 ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 font-mono text-xs text-center p-8 space-y-2">
                    <div className="p-3 rounded-full bg-white/5 border border-white/5">
                      <Layers className="w-6 h-6 text-slate-400" />
                    </div>
                    <span>Dashboard menu is empty. click "Menu Widgets" tab in the Left sidebar to build game controls.</span>
                  </div>
                ) : (
                  workspace.uiWidgets.map(widget => {
                    const isSelected = selectedWidget?.id === widget.id;
                    
                    return (
                      <div
                        key={widget.id}
                        style={{
                          left: widget.x,
                          top: widget.y,
                          width: widget.w,
                          height: widget.h,
                          borderColor: isSelected ? theme.accentColor : `${theme.borderColor}30`,
                          backgroundColor: isSelected ? '#ffffff04' : 'black/40'
                        }}
                        onMouseDown={(e) => startDragWidget(widget.id, e)}
                        className={`absolute rounded border flex flex-col justify-between group p-1.5 transition-shadow shadow-md hover:border-white/20 select-none cursor-move ${
                          isSelected ? 'ring-1 ring-cyan-500/50' : ''
                        }`}
                      >
                        {/* Drag handles & widgets rendering */}
                        <div className="flex-1 overflow-hidden pointer-events-none">
                          
                          {/* Windows Type Container */}
                          {widget.type === 'window' && (
                            <div className="w-full h-full border border-dashed border-slate-700 rounded-sm flex items-center justify-center font-mono text-[9px] uppercase text-slate-500">
                              Nested Window Workspace
                            </div>
                          )}

                          {/* Title Header decorator widget */}
                          {widget.type === 'header' && (
                            <div 
                              style={{ borderLeftColor: theme.borderColor, backgroundColor: `${theme.borderColor}10` }}
                              className="w-full py-1 px-2 border-l-2 font-mono text-[10px] font-bold text-slate-200 tracking-wider flex items-center"
                            >
                              {widget.label.toUpperCase()}
                            </div>
                          )}

                          {/* Button widget */}
                          {widget.type === 'button' && (
                            <div 
                              style={{ 
                                borderColor: theme.borderColor, 
                                backgroundColor: `${theme.borderColor}15`,
                                color: theme.borderColor
                              }}
                              className="w-full h-full border font-mono text-[10px] font-bold uppercase rounded flex items-center justify-center"
                            >
                              {widget.label || 'COMMAND'}
                            </div>
                          )}

                          {/* Stat/Cap progress bars */}
                          {widget.type === 'progressbar' && (
                            <div className="flex flex-col justify-center h-full gap-0.5 pointer-events-none px-1">
                              <div className="flex justify-between items-center text-[9px] font-mono text-slate-400 font-semibold uppercase">
                                <span>{widget.label || 'Metric'}</span>
                                <span style={{ color: theme.accentColor }}>{widget.properties.value || 75}%</span>
                              </div>
                              <div className="w-full bg-slate-950 h-2 rounded border border-white/5 overflow-hidden">
                                <div 
                                  style={{ 
                                    width: `${widget.properties.value || 75}%`, 
                                    backgroundColor: theme.accentColor 
                                  }} 
                                  className="h-full transition-all duration-300" 
                                />
                              </div>
                            </div>
                          )}

                          {/* Standard Table mock designer widget */}
                          {widget.type === 'table' && (
                            <div className="w-full h-full border border-white/5 rounded p-1 flex flex-col justify-between font-mono text-[8px] bg-black/40">
                              <div className="grid grid-cols-3 border-b border-white/10 pb-0.5 text-slate-400 uppercase font-bold tracking-tight">
                                <span>Entity</span>
                                <span>Target</span>
                                <span className="text-right">Reputation</span>
                              </div>
                              <div className="grid grid-cols-3 text-slate-300 truncate">
                                <span className="text-amber-500">Argon</span>
                                <span>Fleet Flag</span>
                                <span style={{ color: theme.accentColor }} className="text-right font-extrabold">+20</span>
                              </div>
                              <div className="grid grid-cols-3 text-slate-300 truncate border-t border-white/5 pt-0.5">
                                <span className="text-red-500">Xenon</span>
                                <span>Sectors Defense</span>
                                <span className="text-right font-extrabold text-red-500">-30</span>
                              </div>
                            </div>
                          )}

                          {/* Standard text widget */}
                          {widget.type === 'text' && (
                            <div className="text-[10px] font-mono text-slate-300 flex items-center h-full px-1">
                              {widget.label}
                            </div>
                          )}

                          {/* Select element box */}
                          {widget.type === 'dropdown' && (
                            <div style={{ borderColor: `${theme.borderColor}40` }} className="border rounded bg-black/80 flex items-center justify-between p-1 text-[8px] font-mono text-slate-400">
                              <span>{widget.label || 'Select Mode...'}</span>
                              <span className="text-slate-500">▼</span>
                            </div>
                          )}

                          {/* Input element box */}
                          {widget.type === 'input' && (
                            <div style={{ borderColor: `${theme.borderColor}60` }} className="border rounded bg-black/80 flex items-center p-1.5 text-[8.5px] font-mono text-slate-350 w-full h-full">
                              <span className="text-slate-550 mr-1 select-none">&gt;</span>
                              <span className="flex-1 overflow-hidden truncate text-slate-300">{widget.properties.placeholder || 'Type transmission command...'}</span>
                              <span style={{ backgroundColor: theme.borderColor }} className="w-1.5 h-2.5 animate-pulse ml-0.5" />
                            </div>
                          )}

                          {/* Chat / Terminal log box */}
                          {widget.type === 'chat' && (
                            <div style={{ borderColor: `${theme.borderColor}30` }} className="w-full h-full border border-dashed rounded bg-black/60 p-2 flex flex-col justify-between font-mono text-[8px] leading-tight text-left">
                              <div style={{ color: theme.borderColor, borderBottomColor: `${theme.borderColor}20` }} className={`text-[7.5px] font-bold border-b pb-1 mb-1.5 flex items-center gap-1.5 uppercase tracking-wide`}>
                                <span className="relative flex h-1.5 w-1.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                                </span>
                                <span>{widget.label || 'COMMS INTEL FEED'}</span>
                              </div>
                              <div className="flex-1 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800">
                                {(widget.properties.messages || [
                                  '[SYSTEM]: Channel initialized',
                                  '[COCOPILOT]: Welcome back, Captain.',
                                  '[ARGON COMMAND]: Patrol Sector prime.'
                                ]).map((msg: string, i: number) => (
                                  <div key={i} className="text-slate-300 font-mono text-[7.5px] leading-tight break-all border-l border-white/5 pl-1">
                                    {msg}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Config actions inside the card element hover triggers */}
                        <div className="absolute right-1 top-1 hidden group-hover:flex items-center gap-1 z-10 bg-slate-900/90 rounded p-0.5 border border-white/10">
                          <button
                            onClick={(e) => deleteWidget(widget.id, e)}
                            title="Delete Widget"
                            className="p-1 rounded hover:bg-red-500/10 text-slate-400 hover:text-red-400"
                          >
                            <Trash className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Resize Handles bottom control nodes */}
                        <div className="absolute bottom-1 right-1 hidden group-hover:flex gap-0.5 z-10">
                          <button
                            onClick={(e) => resizeWidget(widget.id, 20, 0, e)}
                            title="Widen Width"
                            className="w-3.5 h-3.5 rounded bg-slate-800 text-[8px] font-bold text-slate-400 hover:bg-slate-700 flex items-center justify-center font-mono border border-white/5"
                          >
                            +W
                          </button>
                          <button
                            onClick={(e) => resizeWidget(widget.id, -20, 0, e)}
                            title="Shrink Width"
                            className="w-3.5 h-3.5 rounded bg-slate-800 text-[8px] font-bold text-slate-400 hover:bg-slate-700 flex items-center justify-center font-mono border border-white/5"
                          >
                            -W
                          </button>
                          <button
                            onClick={(e) => resizeWidget(widget.id, 0, 15, e)}
                            title="Extend Height"
                            className="w-3.5 h-3.5 rounded bg-slate-800 text-[8px] font-bold text-slate-400 hover:bg-slate-700 flex items-center justify-center font-mono border border-white/5"
                          >
                            +H
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* LUA Script Event Manager Tab content */
        <div id="lua_menu_manager_panel" className="flex-1 flex overflow-hidden bg-[#0a0c11]">
          {/* Left panel recipes for LUA */}
          <div className="w-72 border-r border-white/10 p-4 space-y-4 overflow-y-auto shrink-0 font-mono text-xs bg-[#11131c]/60">
            <div>
              <h3 className="text-xs font-bold text-cyan-400 border-b border-white/10 pb-1.5 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5" />
                LUA API TEMPLATES
              </h3>
              <p className="text-[10px] text-slate-500 mb-3 font-mono leading-relaxed bg-black/10 p-2 border border-white/5 rounded">
                Choose basic Lua frameworks to coordinate HUD window interaction callbacks, signals routing and player stats telemetry.
              </p>

              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedLuaTemplate('standard')}
                  className={`w-full text-left p-2.5 rounded border transition-all flex flex-col justify-start gap-1 cursor-pointer ${
                    selectedLuaTemplate === 'standard'
                      ? 'border-cyan-500 bg-cyan-600/10 text-cyan-300'
                      : 'border-white/5 bg-[#171a24] text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="text-[11px] font-bold uppercase">HUD Buttons Trigger Hooks</div>
                  <div className="text-[9.5px] text-slate-500">Catch cockpit events & send cues signals</div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedLuaTemplate('telemetry')}
                  className={`w-full text-left p-2.5 rounded border transition-all flex flex-col justify-start gap-1 cursor-pointer ${
                    selectedLuaTemplate === 'telemetry'
                      ? 'border-cyan-500 bg-cyan-600/10 text-cyan-300'
                      : 'border-white/5 bg-[#171a24] text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="text-[11px] font-bold uppercase">Dynamic Shield Telemetry</div>
                  <div className="text-[9.5px] text-slate-500">Inject raw real-time stats into HUD charts</div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedLuaTemplate('custom')}
                  className={`w-full text-left p-2.5 rounded border transition-all flex flex-col justify-start gap-1 cursor-pointer ${
                    selectedLuaTemplate === 'custom'
                      ? 'border-cyan-500 bg-cyan-600/10 text-cyan-300'
                      : 'border-white/5 bg-[#171a24] text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="text-[11px] font-bold uppercase font-sans">LUA Custom Setup Script</div>
                  <div className="text-[9.5px] text-slate-500 font-mono">Custom console print logger loop</div>
                </button>
              </div>

              <div className="mt-3 pt-3 border-t border-white/10 space-y-1.5">
                <div className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Vetted X4 patterns (the hard ones, done right)</div>
                {LUA_SNIPPETS.map(sn => (
                  <button key={sn.id} type="button" onClick={() => setSelectedLuaTemplate(sn.id)}
                    className={`w-full text-left p-2.5 rounded border transition-all flex flex-col justify-start gap-1 cursor-pointer ${selectedLuaTemplate === sn.id ? 'border-cyan-500 bg-cyan-600/10 text-cyan-300' : 'border-white/5 bg-[#171a24] text-slate-400 hover:text-white'}`}>
                    <div className="text-[11px] font-bold uppercase">{sn.title}</div>
                    <div className="text-[9.5px] text-slate-500">{sn.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3 bg-cyan-900/15 rounded-md border border-cyan-500/20 text-[10.5px] leading-relaxed text-slate-400 space-y-1.5">
              <span className="font-bold text-cyan-400 uppercase tracking-tight flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5" /> LUA UI Execution Context:
              </span>
              <p className="font-sans text-[10px]">
                In X4, LUA runs inside the client GUI sandboxed state. It binds to widgets defined in XML layouts and fires actions towards the Mission Director (MD) script for state changes.
              </p>
            </div>
          </div>

          {/* Center portion Lua Editor preview */}
          <div className="flex-1 flex flex-col border-r border-white/10 overflow-hidden">
            <div className="p-3 border-b border-white/10 shrink-0 flex items-center justify-between bg-black/25">
              <div className="flex items-center gap-1">
                <Terminal className="w-4 h-4 text-cyan-400 animate-pulse" />
                <span className="font-sans text-xs font-bold text-slate-200">Interactive Lua Interface Controller (/ui/addon_menu.lua)</span>
              </div>
              <div className="flex items-center gap-1.5">
                {luaMode === 'edit' && (
                  <button type="button" onClick={insertSelectedPattern} title="Append the selected left-hand pattern to the buffer"
                    className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/15 hover:bg-cyan-500/30 border border-cyan-500/30 text-cyan-300 font-bold uppercase font-mono">Insert pattern</button>
                )}
                <button type="button" onClick={() => setLuaMode('preview')}
                  className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase font-mono ${luaMode === 'preview' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:text-white'}`}>Preview</button>
                <button type="button" onClick={() => setLuaMode('edit')}
                  className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase font-mono ${luaMode === 'edit' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:text-white'}`}>Edit Buffer</button>
              </div>
            </div>

            {/* Editable custom Lua buffer OR compiled-code preview */}
            {luaMode === 'edit' ? (
              <textarea
                value={workspace.customLua || ''}
                onChange={e => setWorkspace(prev => ({ ...prev, customLua: e.target.value }))}
                spellCheck={false}
                placeholder={"-- Your custom Lua. Packaged to ui/<id>_custom.lua on compile.\n-- Select a pattern at left, then press Insert pattern above."}
                className="flex-1 w-full p-4 bg-black/35 font-mono text-[11px] leading-normal text-emerald-200 outline-none resize-none"
              />
            ) : (
            <div className="flex-1 p-4 overflow-y-auto bg-black/35 font-mono text-[11px] leading-normal selection:bg-cyan-500/25 text-slate-400 select-text">
              <pre className="whitespace-pre">
                {LUA_SNIPPETS.some(sn => sn.id === selectedLuaTemplate) ? (
                  fillLuaSnippet(selectedLuaTemplate, snippetValues)
                ) : selectedLuaTemplate === 'standard' ? (
                  `-- X4 foundations Client Interface Controller
-- Target Path: /ui/addon_menu.lua
-- Binds widgets defined visually inside HUD Layout Configurator to game actions

local menu = {
  name = "${workspace.name || "Custom_HUD"}",
  version = "${workspace.version || "1.0.0"}",
  widgets = {}
}

function menu.onInit()
  -- Register visual layout
  RegisterLayout("ui/menu_layout_config.xml")
  DebugError("HUD Loaded: " .. menu.name)

  -- Wire interactive button clicks to signals queue
  ${workspace.uiWidgets.filter(w => w.type === 'button').map(w => `-- Trigger: Button "${w.label}" clicked
  AddUITrigger("${w.id}", "on_click", function()
    DebugError("Button trigger event: ${w.id}")
    -- Dispatch payload back to Mission Director Cue
    SignalCue("${w.properties.targetCue || 'MyMissionCue'}", {
      action = "activate_subsystem",
      widget = "${w.id}",
      timestamp = GetGameTime()
    })
  end)`).join('\n  ') || '-- Build "Button" widgets inside the designer canvas to generate interactive signals code instantly'}
end

function menu.cleanup()
  -- Drop event listeners to avoid out-of-sector memory leaks
  RemoveAllUITriggers()
end

return menu`
                ) : selectedLuaTemplate === 'telemetry' ? (
                  `-- Shield Telemetry Real-time data feed
-- Retrieves current player vessel shielding rates and updates progressbar widgets

local telemetry = {
  active = true
}

function telemetry.startUpdateLoop()
  local targetShip = GetPlayerShip()
  if not targetShip then return end

  -- Spawn coroutine update loop every 0.1s
  CreateCoroutine(function()
    while telemetry.active do
      local maxShield = GetMaxShield(targetShip)
      local curShield = GetCurrentShield(targetShip)
      local percent = 0
      
      if maxShield > 0 then
        percent = math.floor((curShield / maxShield) * 100)
      end

      -- Update Progressbar defined inside the layout config XML
      ${workspace.uiWidgets.filter(w => w.type === 'progressbar').map(w => `UpdateProgressBarValue("${w.id}", percent)`).join('\n      ') || '-- Create a "ProgressBar" widget inside the Layout Designer to auto-target progress updating loops'}
      
      Wait(100) -- delay 100ms
    end
  end)
end

function telemetry.stop()
  telemetry.active = false
end

return telemetry`
                ) : (
                  `-- Raw custom setup menu script addon
-- Initialize telemetry HUD elements inside faction headquarters console

RegisterEvent("on_station_dock", function(playerShip, stationEntity)
  if stationEntity == "faction.player.hq" then
    -- Spawn custom cockpit menu
    OpenUIFrame("ui/menu_layout_config.xml")
    WriteToLogbook("HQ Console active: Custom cockpit variables loaded.")
  end
end)

function DebugError(msg)
  Helper.print("[X4-Mod-Studio Debug Console]: " .. tostring(msg))
end`
                )}
              </pre>
            </div>
            )}
            
            <div className="p-3 border-t border-white/5 bg-[#12141a] flex justify-between shrink-0 font-mono text-[10px] text-slate-500">
              <span>Status: Synchronized with visual widget IDs</span>
              <button
                onClick={() => {
                  const code = selectedLuaTemplate === 'standard' 
                    ? `local menu = { name = "${workspace.name}" }` 
                    : `-- Custom lua addon`;
                  const snip = LUA_SNIPPETS.find(sn => sn.id === selectedLuaTemplate);
                  navigator.clipboard.writeText(snip ? fillLuaSnippet(selectedLuaTemplate, snippetValues) : code);
                  alert("LUA Code template copied!");
                }}
                className="hover:text-cyan-400 font-bold uppercase transition-all cursor-pointer"
              >
                Copy LUA Code To Clipboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
