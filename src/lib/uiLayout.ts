/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tier 2 / T1.1 — UI layout-descriptor engine (the validated core of the WYSIWYG
 * Lua-UI canvas builder).
 *
 * Models a HUD/menu layout as a grid of widgets, validates it (unique ids, valid types,
 * in-bounds positions, NO overlaps), and emits a Lua *descriptor table*. It deliberately
 * does NOT fabricate `Helper`/widgetSystem construction calls — X4 builds the actual
 * widgets at runtime from this table via the menu's createMenu hook (same honest stance
 * as `generateUILuaScript`). The descriptor is the contract; the runtime construction
 * (T1.3) is grown separately and gated behind in-game verification.
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
  /** 1-based grid position. */
  row: number;
  col: number;
  rowSpan?: number;
  colSpan?: number;
  label?: string;
  /** Optional data binding (MD variable / value expression the widget reads). */
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

/** Validate a layout. Errors block generation; an empty array means it's clean. */
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
  // occupancy: only meaningful when grid is valid
  const occupied = new Map<string, string>(); // "r,c" -> widgetId
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

/**
 * Emit the Lua descriptor table for a layout. Throws if the layout has errors.
 * The output is data, not fabricated runtime calls — the createMenu hook builds widgets
 * from it (kept consistent with the studio's existing UI-Lua honesty).
 */
export function generateLayoutLua(layout: UILayoutDescriptor, modId: string): string {
  const errs = validateUILayout(layout).filter(x => x.severity === 'error');
  if (errs.length > 0) throw new Error(`Cannot generate layout Lua: ${errs.length} error(s): ${errs.map(e => e.message).join('; ')}`);

  const widgetLines = layout.widgets.map(w => {
    const parts = [
      `id = ${luaStr(w.id)}`,
      `type = ${luaStr(w.type)}`,
      `row = ${w.row}`,
      `col = ${w.col}`,
      `rowSpan = ${span(w.rowSpan)}`,
      `colSpan = ${span(w.colSpan)}`
    ];
    if (w.label) parts.push(`label = ${luaStr(w.label)}`);
    if (w.binding) parts.push(`binding = ${luaStr(w.binding)}`);
    return `        { ${parts.join(', ')} }`;
  }).join(',\n');

  return [
    `-- Auto-generated by X4:MD Studio — UI layout descriptor for "${layout.name}" (mod ${modId})`,
    `-- This is a DATA descriptor; the menu's createMenu hook builds the widgets from it`,
    `-- via X4's Helper / widgetSystem (ftable rows & cells). No runtime calls are fabricated here.`,
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

/** Self-test oracle. */
export function runUILayoutSelftest() {
  const checks: { name: string; pass: boolean; detail?: any }[] = [];
  const ok = (name: string, pass: boolean, detail?: any) => checks.push({ name, pass, detail });

  const clean: UILayoutDescriptor = {
    name: 'hud_panel',
    rows: 3, cols: 3,
    widgets: [
      { id: 'title', type: 'window', row: 1, col: 1, colSpan: 3, label: 'Status' },
      { id: 'shields', type: 'progressbar', row: 2, col: 1, colSpan: 2, binding: '$shield' },
      { id: 'refresh', type: 'button', row: 2, col: 3, label: 'Refresh' },
      { id: 'log', type: 'chatlog', row: 3, col: 1, colSpan: 3 }
    ]
  };
  ok('clean_validates', validateUILayout(clean).filter(x => x.severity === 'error').length === 0, validateUILayout(clean));

  let lua = '', threw = false;
  try { lua = generateLayoutLua(clean, 'mymod'); } catch { threw = true; }
  ok('generates_without_throwing', !threw && lua.length > 0);
  ok('lua_has_grid', lua.includes('grid = { rows = 3, cols = 3 }'));
  ok('lua_has_all_widgets', clean.widgets.every(w => lua.includes(`id = "${w.id}"`)));
  ok('lua_has_binding', lua.includes('binding = "$shield"'));
  ok('lua_is_data_only', lua.includes('return layout') && !/Helper\.|CreateWidget|widgetSystem\./.test(lua));

  // broken: bad name, dup id, invalid type, out of bounds, overlap
  const bad: UILayoutDescriptor = {
    name: 'Bad Name',
    rows: 2, cols: 2,
    widgets: [
      { id: 'a', type: 'window', row: 1, col: 1, colSpan: 2 },
      { id: 'a', type: 'button', row: 2, col: 1 },                 // duplicate id
      { id: 'c', type: 'sparkle' as any, row: 2, col: 2 },         // invalid type
      { id: 'd', type: 'label', row: 2, col: 2 },                  // overlaps c
      { id: 'e', type: 'icon', row: 3, col: 1 }                    // out of bounds
    ]
  };
  const bf = validateUILayout(bad);
  const has = (code: string) => bf.some(x => x.code === code);
  ok('flags_bad_name', has('bad_name'));
  ok('flags_duplicate_id', has('duplicate_id'));
  ok('flags_invalid_type', has('invalid_type'));
  ok('flags_overlap', has('overlap'));
  ok('flags_out_of_bounds', has('out_of_bounds'));

  let badThrew = false;
  try { generateLayoutLua(bad, 'x'); } catch { badThrew = true; }
  ok('generator_refuses_broken_layout', badThrew);

  ok('empty_widgets_warns', validateUILayout({ name: 'x', rows: 1, cols: 1, widgets: [] }).some(x => x.code === 'empty_layout'));

  const passed = checks.filter(c => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
