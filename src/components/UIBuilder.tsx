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
  Move
} from 'lucide-react';
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
          <span className="font-semibold text-slate-200">X4 CUSTOM MENU STYLING CONFIGURATOR</span>
        </div>
        
        {/* Preset selections */}
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
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Custom Theme sliders */}
        <div className="w-64 border-r border-white/10 bg-[#12141a] p-4 space-y-4 font-mono text-xs">
          <h4 className="text-slate-200 uppercase font-bold text-[10px] tracking-wider mb-2 flex items-center gap-1.5 border-b border-white/5 pb-1">
            <Palette className="w-3.5 h-3.5 text-cyan-400" /> Theme Parameters
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

          <div className="p-3 rounded bg-cyan-950/10 border border-cyan-500/20 mt-3 space-y-1.5">
            <span className="text-cyan-400 font-bold block text-[10px] uppercase">Simulation Guide:</span>
            <p className="text-[10px] text-slate-400 leading-relaxed font-sans">
              Drag widgets within the cockpit window simulation framework. Use bottom resizing buttons to enlarge parameters. Changes dynamically synchronize into the generated Lua XML schema.
            </p>
          </div>
        </div>

        {/* Large Game Cockpit Simulator Window Frame */}
        <div className="flex-1 bg-black p-6 flex items-center justify-center relative overflow-auto">
          
          {/* Simulated flight cockpit monitor overlay background */}
          <div className="absolute inset-0 pointer-events-none bg-radial-gradient flex items-center justify-center opacity-30 select-none">
            <div className="border border-cyan-500/10 w-[80%] h-[80%] rounded-full animate-pulse" />
            <div className="absolute text-[8px] font-mono text-cyan-500/40 tracking-widest bottom-6">HUD RADAR SCANNER ACTIVE</div>
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
    </div>
  );
}
