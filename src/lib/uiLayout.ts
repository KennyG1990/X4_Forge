/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * UI layout — the engine-correct, responsive model for X4 menus/HUD.
 *
 * X4's UI is fTable-native (Helper.createFtable rows/cells), NOT absolute pixels, and
 * absolute coordinates clip/overflow across resolutions, aspect ratios, and HUD scale.
 * So the canonical *compile model* is a logical grid (rows/cols + row/col span) emitted
 * as a declarative Lua table that a generic createMenu loader builds into an ftable at
 * runtime. This module is that model + its validation + its Lua emit, PLUS the bridge
 * (`pixelLayoutToGrid`) that turns the free-form designer's pixel widgets into a
 * validated grid descriptor — so the comfortable visual editor feeds the engine-correct
 * pipeline instead of a parallel one.
 *
 * Honesty note: `generateLayoutLua` emits DATA only (no fabricated Helper calls); the
 * generic runtime loader that turns this table into real ftable construction is the
 * deferred, in-game-verified piece (T1.3).
 */

export type UIWidgetType =
  | 'window' | 'table' | 'button' | 'label' | 'progressbar'
  | 'textinput' | 'selector' | 'chatlog' | 'icon';

export const UI_WIDGET_TYPES: UIWidgetType[] = [
  'window', 'table', 'button', 'label', 'progressbar', 'textinput', 'selector', 'chatlog', 'icon'
];

export interface GridWidget {
  id: string;
  type: UIWidgetType;
  row: number;   // 1-based
  col: number;   // 1-based
  rowSpan?: number;
  colSpan?: number;
  label?: string;
  binding?: string;
}

export interface UILayoutDescriptor {
  name: string;
  rows: number;
  cols: number;
  widgets: GridWidget[];
}

export type UILayoutSeverity = 'error' | 'warning';
export type UILayoutCode =
  | 'bad_name' | 'bad_grid' | 'duplicate_id' | 'bad_id'
  | 'invalid_type' | 'out_of_bounds' | 'overlap' | 'empty_layout';

export interface UILayoutFinding {
  severity: UILayoutSeverity;
  code: UILayoutCode;
  widgetId?: string;
  message: string;
}

const ID_RE = /^[a-z][a-z0-9_]*$/i;

function span(n: number | undefined): number {
  return Number.isInteger(n) && (n as number) >= 1 ? (n as number) : 1;
}

export function validateUILayout(layout: UILayoutDescriptor): UILayoutFinding[] {
  const f: UILayoutFinding[] = [];
  if (!layout || typeof layout !== 'object') return [{ severity: 'error', code: 'bad_name', message: 'Layout is missing or not an object.' }];

  if (!layout.name || !ID_RE.test(layout.name)) f.push({ severity: 'error', code: 'bad_name', message: `Layout name "${layout.name ?? ''}" must match ${ID_RE}.` });
  const rows = layout.rows, cols = layout.cols;
  if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(cols) || cols < 1) {
    f.push({ severity: 'error', code: 'bad_grid', message: `Grid must be at least 1×1 (got ${rows}×${cols}).` });
  }

  const widgets = Array.isArray(layout.widgets) ? layout.widgets : [];
  if (widgets.length === 0) f.push({ severity: 'warning', code: 'empty_layout', message: 'Layout has no widgets.' });

  const gridOk = Number.isInteger(rows) && rows >= 1 && Number.isInteger(cols) && cols >= 1;
  const occupied = new Map<string, string>();
  const seen = new Set<string>();

  for (const w of widgets) {
    if (!w || typeof w !== 'object') { f.push({ severity: 'error', code: 'bad_id', message: 'A widget entry is missing or not an object.' }); continue; }
    if (!w.id || !ID_RE.test(w.id)) f.push({ severity: 'error', code: 'bad_id', widgetId: w.id, message: `Widget id "${w.id ?? ''}" must match ${ID_RE}.` });
    else if (seen.has(w.id)) f.push({ severity: 'error', code: 'duplicate_id', widgetId: w.id, message: `Duplicate widget id "${w.id}".` });
    else seen.add(w.id);

    if (UI_WIDGET_TYPES.indexOf(w.type) === -1) f.push({ severity: 'error', code: 'invalid_type', widgetId: w.id, message: `Widget "${w.id}" has invalid type "${w.type}".` });

    const rs = span(w.rowSpan), cs = span(w.colSpan);
    const inBounds = Number.isInteger(w.row) && Number.isInteger(w.col) && w.row >= 1 && w.col >= 1;
    if (!inBounds) {
      f.push({ severity: 'error', code: 'out_of_bounds', widgetId: w.id, message: `Widget "${w.id}" has an invalid position (row ${w.row}, col ${w.col}).` });
      continue;
    }
    if (gridOk && (w.row + rs - 1 > rows || w.col + cs - 1 > cols)) {
      f.push({ severity: 'error', code: 'out_of_bounds', widgetId: w.id, message: `Widget "${w.id}" (row ${w.row}, col ${w.col}, span ${rs}×${cs}) extends past the ${rows}×${cols} grid.` });
      continue;
    }
    if (gridOk) {
      for (let r = w.row; r < w.row + rs; r++) {
        for (let c = w.col; c < w.col + cs; c++) {
          const key = `${r},${c}`;
          const other = occupied.get(key);
          if (other) f.push({ severity: 'error', code: 'overlap', widgetId: w.id, message: `Widget "${w.id}" overlaps "${other}" at cell (${r}, ${c}).` });
          else occupied.set(key, w.id || '?');
        }
      }
    }
  }
  return f;
}

function luaStr(s: string): string {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ') + '"';
}

export function generateLayoutLua(layout: UILayoutDescriptor, modId: string): string {
  const errs = validateUILayout(layout).filter(x => x.severity === 'error');
  if (errs.length > 0) throw new Error(`Cannot generate layout Lua: ${errs.length} error(s): ${errs.map(e => e.message).join('; ')}`);

  const widgetLines = layout.widgets.map(w => {
    const parts = [
      `id = ${luaStr(w.id)}`, `type = ${luaStr(w.type)}`,
      `row = ${w.row}`, `col = ${w.col}`,
      `rowSpan = ${span(w.rowSpan)}`, `colSpan = ${span(w.colSpan)}`
    ];
    if (w.label) parts.push(`label = ${luaStr(w.label)}`);
    if (w.binding) parts.push(`binding = ${luaStr(w.binding)}`);
    return `        { ${parts.join(', ')} }`;
  }).join(',\n');

  return [
    `-- Auto-generated by X4 Forge — responsive UI layout descriptor for "${layout.name}" (mod ${modId})`,
    `-- DATA descriptor: a generic createMenu loader builds an ftable (rows/cells) from this`,
    `-- table at runtime, so it scales across resolutions / aspect ratios / HUD scale.`,
    `-- No runtime Helper/widgetSystem calls are fabricated here.`,
    ``,
    `local layout = {`,
    `    name = ${luaStr(layout.name)},`,
    `    grid = { rows = ${layout.rows}, cols = ${layout.cols} },`,
    `    widgets = {`,
    widgetLines,
    `    }`,
    `}`,
    ``,
    `return layout`,
    ``
  ].join('\n');
}

// ---------------------------------------------------------------------------------------
// BRIDGE: free-form pixel widgets (the existing Layout GUI Designer model) -> grid descriptor
// ---------------------------------------------------------------------------------------

export interface PixelWidget {
  id: string;
  type?: string;
  x: number; y: number; w: number; h: number;
  label?: string;
  properties?: Record<string, any>;
}

/** Map the designer's free-form widget types to the engine-grid widget types. */
const PIXEL_TYPE_MAP: Record<string, UIWidgetType> = {
  window: 'window', table: 'table', button: 'button', text: 'label', label: 'label',
  progressbar: 'progressbar', dropdown: 'selector', selector: 'selector', header: 'label',
  input: 'textinput', textinput: 'textinput', chat: 'chatlog', chatlog: 'chatlog', icon: 'icon'
};

/** Sorted unique numbers within an epsilon (snap near-equal coordinates together). */
function uniqSorted(nums: number[], eps = 4): number[] {
  const s = nums.slice().sort((a, b) => a - b);
  const out: number[] = [];
  for (const n of s) if (out.length === 0 || n - out[out.length - 1] > eps) out.push(n);
  return out;
}
function trackIndex(edges: number[], value: number, eps = 4): number {
  for (let i = 0; i < edges.length; i++) if (Math.abs(edges[i] - value) <= eps) return i;
  // nearest lower edge
  let idx = 0;
  for (let i = 0; i < edges.length; i++) if (edges[i] <= value + eps) idx = i;
  return idx;
}

/**
 * Quantize free-form pixel widgets into a validated grid descriptor. Column boundaries
 * are derived from the distinct widget left/right edges (rows from top/bottom), so each
 * widget maps to a row/col + span by which grid lines it crosses — turning an absolute
 * layout into the engine-correct logical grid. `name` should be a valid identifier.
 */
export function pixelLayoutToGrid(widgets: PixelWidget[], name = 'hud_layout'): UILayoutDescriptor {
  const list = (Array.isArray(widgets) ? widgets : []).filter(w => w && w.w > 0 && w.h > 0);
  if (list.length === 0) return { name, rows: 1, cols: 1, widgets: [] };

  const colEdges = uniqSorted(list.flatMap(w => [w.x, w.x + w.w]));
  const rowEdges = uniqSorted(list.flatMap(w => [w.y, w.y + w.h]));
  const cols = Math.max(1, colEdges.length - 1);
  const rows = Math.max(1, rowEdges.length - 1);

  const seen = new Set<string>();
  const gridWidgets: GridWidget[] = list.map((w, i) => {
    const c0 = trackIndex(colEdges, w.x), c1 = trackIndex(colEdges, w.x + w.w);
    const r0 = trackIndex(rowEdges, w.y), r1 = trackIndex(rowEdges, w.y + w.h);
    const col = c0 + 1, row = r0 + 1;
    const colSpan = Math.max(1, c1 - c0), rowSpan = Math.max(1, r1 - r0);
    let id = (w.id && ID_RE.test(w.id)) ? w.id : `w_${i + 1}`;
    while (seen.has(id)) id = `${id}_`;
    seen.add(id);
    const type = PIXEL_TYPE_MAP[(w.type || '').toLowerCase()] || 'label';
    const gw: GridWidget = { id, type, row, col, rowSpan, colSpan };
    if (w.label) gw.label = w.label;
    const bind = w.properties && (w.properties.binding || w.properties.value);
    if (bind) gw.binding = String(bind);
    return gw;
  });

  return { name: ID_RE.test(name) ? name : 'hud_layout', rows, cols, widgets: gridWidgets };
}

export function runUILayoutSelftest() {
  const checks: { name: string; pass: boolean; detail?: any }[] = [];
  const ok = (name: string, pass: boolean, detail?: any) => checks.push({ name, pass, detail });

  const clean: UILayoutDescriptor = {
    name: 'hud_panel', rows: 3, cols: 3,
    widgets: [
      { id: 'title', type: 'window', row: 1, col: 1, colSpan: 3, label: 'Status' },
      { id: 'shields', type: 'progressbar', row: 2, col: 1, colSpan: 2, binding: '$shield' },
      { id: 'refresh', type: 'button', row: 2, col: 3, label: 'Refresh' },
      { id: 'log', type: 'chatlog', row: 3, col: 1, colSpan: 3 }
    ]
  };
  ok('clean_validates', validateUILayout(clean).filter(x => x.severity === 'error').length === 0);
  let lua = '', threw = false;
  try { lua = generateLayoutLua(clean, 'mymod'); } catch { threw = true; }
  ok('generates_without_throwing', !threw && lua.length > 0);
  ok('lua_has_grid', lua.includes('grid = { rows = 3, cols = 3 }'));
  ok('lua_has_all_widgets', clean.widgets.every(w => lua.includes(`id = "${w.id}"`)));
  ok('lua_is_data_only', lua.includes('return layout') && !/Helper\.|CreateWidget|widgetSystem\./.test(lua));

  const bad: UILayoutDescriptor = {
    name: 'Bad Name', rows: 2, cols: 2,
    widgets: [
      { id: 'a', type: 'window', row: 1, col: 1, colSpan: 2 },
      { id: 'a', type: 'button', row: 2, col: 1 },
      { id: 'c', type: 'sparkle' as any, row: 2, col: 2 },
      { id: 'd', type: 'label', row: 2, col: 2 },
      { id: 'e', type: 'icon', row: 3, col: 1 }
    ]
  };
  const bf = validateUILayout(bad);
  const has = (code: string) => bf.some(x => x.code === code);
  ok('flags_bad_name', has('bad_name'));
  ok('flags_duplicate_id', has('duplicate_id'));
  ok('flags_invalid_type', has('invalid_type'));
  ok('flags_overlap', has('overlap'));
  ok('flags_out_of_bounds', has('out_of_bounds'));
  let badThrew = false; try { generateLayoutLua(bad, 'x'); } catch { badThrew = true; }
  ok('generator_refuses_broken_layout', badThrew);
  ok('empty_widgets_warns', validateUILayout({ name: 'x', rows: 1, cols: 1, widgets: [] }).some(x => x.code === 'empty_layout'));

  // --- bridge: pixel -> grid ---
  const pix: PixelWidget[] = [
    { id: 'title', type: 'header', x: 0, y: 0, w: 300, h: 30, label: 'Status' },     // full top row, spans both cols
    { id: 'bar', type: 'progressbar', x: 0, y: 30, w: 150, h: 20 },                   // bottom-left (contiguous)
    { id: 'btn', type: 'button', x: 150, y: 30, w: 150, h: 20, label: 'Go' }          // bottom-right (contiguous)
  ];
  const grid = pixelLayoutToGrid(pix, 'hud_from_pixels');
  ok('bridge_clean', validateUILayout(grid).filter(x => x.severity === 'error').length === 0, validateUILayout(grid));
  ok('bridge_derives_cols', grid.cols === 2);
  ok('bridge_derives_rows', grid.rows === 2);
  ok('bridge_title_spans_cols', !!grid.widgets.find(w => w.id === 'title' && w.row === 1 && w.col === 1 && w.colSpan === 2));
  ok('bridge_maps_types', grid.widgets.find(w => w.id === 'title')!.type === 'label' && grid.widgets.find(w => w.id === 'btn')!.type === 'button');
  ok('bridge_no_overlap', !validateUILayout(grid).some(x => x.code === 'overlap'));
  ok('bridge_empty_safe', pixelLayoutToGrid([]).widgets.length === 0);

  const passed = checks.filter(c => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
