/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tier 2 / T1.2 — snap-grid WYSIWYG UI layout canvas.
 *
 * A visual grid where you pick a widget type and click a cell to place it; the layout
 * is validated live (overlaps / out-of-bounds via `validateUILayout`) and the generated
 * Lua descriptor table is previewed. The layout persists on the workspace (`uiLayout`)
 * and the compiler packages it to `ui/<id>_layout.lua`. The descriptor is the contract;
 * X4 builds the actual widgets from it at runtime (T1.3).
 */

import React, { useMemo, useState } from 'react';
import { LayoutGrid, Trash, AlertTriangle, Code2, MousePointerClick } from 'lucide-react';
import { ModWorkspace } from '../types';
import {
  UI_WIDGET_TYPES, validateUILayout, generateLayoutLua,
  type UILayoutDescriptor, type GridWidget, type UIWidgetType
} from '../lib/uiLayout';

interface UILayoutCanvasProps {
  workspace: ModWorkspace;
  setWorkspace: React.Dispatch<React.SetStateAction<ModWorkspace>>;
}

const DEFAULT_LAYOUT: UILayoutDescriptor = { name: 'hud_layout', rows: 4, cols: 4, widgets: [] };

const TYPE_COLOR: Record<string, string> = {
  window: 'border-cyan-500/60 bg-cyan-500/10 text-cyan-200',
  table: 'border-sky-500/60 bg-sky-500/10 text-sky-200',
  button: 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200',
  label: 'border-slate-500/60 bg-slate-500/10 text-slate-200',
  progressbar: 'border-amber-500/60 bg-amber-500/10 text-amber-200',
  textinput: 'border-violet-500/60 bg-violet-500/10 text-violet-200',
  selector: 'border-fuchsia-500/60 bg-fuchsia-500/10 text-fuchsia-200',
  chatlog: 'border-teal-500/60 bg-teal-500/10 text-teal-200',
  icon: 'border-rose-500/60 bg-rose-500/10 text-rose-200'
};

export default function UILayoutCanvas({ workspace, setWorkspace }: UILayoutCanvasProps) {
  const layout = workspace.uiLayout || DEFAULT_LAYOUT;
  const [selectedType, setSelectedType] = useState<UIWidgetType>('button');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const update = (fn: (l: UILayoutDescriptor) => UILayoutDescriptor) =>
    setWorkspace(prev => ({ ...prev, uiLayout: fn(prev.uiLayout || DEFAULT_LAYOUT) }));

  const findings = useMemo(() => validateUILayout(layout), [layout]);
  const errorCount = findings.filter(f => f.severity === 'error').length;
  const lua = useMemo(() => {
    try { return errorCount === 0 ? generateLayoutLua(layout, workspace.id || 'mod') : ''; } catch { return ''; }
  }, [layout, errorCount, workspace.id]);

  // occupancy: cellKey -> widget (for click-to-place + render)
  const occ = useMemo(() => {
    const m = new Map<string, GridWidget>();
    for (const w of layout.widgets) {
      const rs = w.rowSpan || 1, cs = w.colSpan || 1;
      for (let r = w.row; r < w.row + rs; r++) for (let c = w.col; c < w.col + cs; c++) m.set(`${r},${c}`, w);
    }
    return m;
  }, [layout.widgets]);

  const placeAt = (row: number, col: number) => {
    if (occ.has(`${row},${col}`)) return; // occupied
    const n = layout.widgets.length + 1;
    const w: GridWidget = { id: `${selectedType}_${n}`, type: selectedType, row, col, rowSpan: 1, colSpan: 1 };
    update(l => ({ ...l, widgets: [...l.widgets, w] }));
    setSelectedId(w.id);
  };
  const updateWidget = (id: string, patch: Partial<GridWidget>) =>
    update(l => ({ ...l, widgets: l.widgets.map(w => (w.id === id ? { ...w, ...patch } : w)) }));
  const removeWidget = (id: string) => { update(l => ({ ...l, widgets: l.widgets.filter(w => w.id !== id) })); setSelectedId(null); };

  const selected = layout.widgets.find(w => w.id === selectedId) || null;
  const inputCls = 'w-full px-1.5 py-1 rounded bg-black/60 border border-white/10 text-white font-mono text-[10px] focus:outline-none focus:border-cyan-500';

  // build explicit-position cells: widget top-lefts + empty placeholders
  const cells: React.ReactNode[] = [];
  for (let r = 1; r <= layout.rows; r++) {
    for (let c = 1; c <= layout.cols; c++) {
      const w = occ.get(`${r},${c}`);
      if (w) {
        if (w.row === r && w.col === c) {
          cells.push(
            <button key={`w-${w.id}`} type="button" onClick={() => setSelectedId(w.id)}
              style={{ gridColumn: `${w.col} / span ${w.colSpan || 1}`, gridRow: `${w.row} / span ${w.rowSpan || 1}` }}
              className={`min-h-[42px] rounded border ${TYPE_COLOR[w.type] || 'border-white/20'} ${selectedId === w.id ? 'ring-2 ring-white/60' : ''} flex flex-col items-center justify-center text-[9px] font-bold uppercase p-1 overflow-hidden`}>
              <span className="truncate w-full text-center">{w.type}</span>
              {w.label && <span className="truncate w-full text-center opacity-70 normal-case">{w.label}</span>}
            </button>
          );
        }
        // covered (not top-left): render nothing (the spanning widget covers it)
      } else {
        cells.push(
          <button key={`e-${r}-${c}`} type="button" onClick={() => placeAt(r, c)}
            style={{ gridColumn: c, gridRow: r }}
            className="min-h-[42px] rounded border border-dashed border-white/10 hover:border-cyan-500/50 hover:bg-cyan-500/5 text-white/0 hover:text-cyan-400/60 flex items-center justify-center text-[9px] transition-colors"
            title={`Place ${selectedType} at (${r}, ${c})`}>+</button>
        );
      }
    }
  }

  return (
    <div className="h-full flex overflow-hidden">
      {/* Left: palette + grid */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
        <div className="flex items-center gap-2 border-b border-white/10 pb-2">
          <LayoutGrid className="w-4 h-4 text-cyan-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-cyan-400">UI Layout Canvas</h2>
          <span className="ml-auto flex items-center gap-1 text-[9px] text-slate-500"><MousePointerClick className="w-3 h-3" />pick a type, click a cell</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-slate-400 block mb-1 uppercase text-[8.5px] font-bold">Layout name</label>
            <input className={inputCls} value={layout.name} spellCheck={false} onChange={e => update(l => ({ ...l, name: e.target.value }))} placeholder="hud_layout" />
          </div>
          <div className="flex items-end gap-2">
            <div><label className="text-slate-400 block mb-1 uppercase text-[8.5px] font-bold">Rows</label>
              <input type="number" min={1} max={12} className={inputCls} value={layout.rows} onChange={e => update(l => ({ ...l, rows: Math.max(1, Number(e.target.value) || 1) }))} /></div>
            <div><label className="text-slate-400 block mb-1 uppercase text-[8.5px] font-bold">Cols</label>
              <input type="number" min={1} max={12} className={inputCls} value={layout.cols} onChange={e => update(l => ({ ...l, cols: Math.max(1, Number(e.target.value) || 1) }))} /></div>
          </div>
        </div>

        {/* palette */}
        <div className="flex flex-wrap gap-1">
          {UI_WIDGET_TYPES.map(t => (
            <button key={t} type="button" onClick={() => setSelectedType(t)}
              className={`px-2 py-1 rounded text-[9px] font-bold uppercase border ${selectedType === t ? TYPE_COLOR[t] + ' ring-1 ring-white/40' : 'border-white/10 text-slate-400 hover:text-white'}`}>{t}</button>
          ))}
        </div>

        {/* grid */}
        <div className="grid gap-1.5 p-2 rounded-lg border border-white/10 bg-black/30"
          style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))` }}>
          {cells}
        </div>

        {findings.length > 0 && (
          <div className="rounded border border-white/10 bg-black/40 divide-y divide-white/5">
            {findings.map((f, i) => (
              <div key={i} className={`flex items-start gap-1.5 px-2 py-1.5 text-[10px] ${f.severity === 'error' ? 'text-red-400' : 'text-amber-400'}`}>
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /><span>{f.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: selected-widget inspector + Lua preview */}
      <div className="w-[40%] min-w-[340px] border-l border-white/10 bg-[#0c0e14] flex flex-col overflow-hidden">
        <div className="px-3 py-2 border-b border-white/10 text-[11px] font-mono text-cyan-400 font-semibold uppercase flex items-center gap-2">
          <Code2 className="w-4 h-4" />ui/{(workspace.id || 'mod')}_layout.lua
        </div>
        {selected && (
          <div className="p-3 border-b border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-200 font-mono">{selected.id}</span>
              <button onClick={() => removeWidget(selected.id)} className="p-1 text-slate-500 hover:text-red-400" title="Remove widget"><Trash className="w-3.5 h-3.5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-slate-500 text-[8.5px] uppercase font-bold block mb-0.5">Label</label>
                <input className={inputCls} value={selected.label || ''} onChange={e => updateWidget(selected.id, { label: e.target.value })} placeholder="(optional)" /></div>
              <div><label className="text-slate-500 text-[8.5px] uppercase font-bold block mb-0.5">Binding</label>
                <input className={inputCls} value={selected.binding || ''} onChange={e => updateWidget(selected.id, { binding: e.target.value })} placeholder="$var (optional)" /></div>
              <div><label className="text-slate-500 text-[8.5px] uppercase font-bold block mb-0.5">Row span</label>
                <input type="number" min={1} className={inputCls} value={selected.rowSpan || 1} onChange={e => updateWidget(selected.id, { rowSpan: Math.max(1, Number(e.target.value) || 1) })} /></div>
              <div><label className="text-slate-500 text-[8.5px] uppercase font-bold block mb-0.5">Col span</label>
                <input type="number" min={1} className={inputCls} value={selected.colSpan || 1} onChange={e => updateWidget(selected.id, { colSpan: Math.max(1, Number(e.target.value) || 1) })} /></div>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-auto p-3 font-mono text-[10.5px] leading-relaxed text-slate-300 whitespace-pre select-text scrollbar-thin">
          {errorCount > 0
            ? <span className="text-slate-600 italic">Fix the {errorCount} layout error(s) to generate the Lua.</span>
            : <pre className="whitespace-pre">{lua}</pre>}
        </div>
        <div className="px-3 py-1.5 border-t border-white/10 text-[9px] text-slate-500 leading-relaxed">
          A validated layout descriptor — packaged to <code className="text-cyan-500">ui/&lt;id&gt;_layout.lua</code> on compile. X4 builds the widgets from this table at runtime.
        </div>
      </div>
    </div>
  );
}
