/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * UI widget validation for the existing HUD & LUA UI **Layout GUI Designer**
 * (free-form `uiWidgets` with x/y/w/h pixel positions). This is the genuinely-useful
 * capability brought over from the (now-removed) parallel grid canvas: the free-form
 * designer has no structural validation, so this flags duplicate ids, degenerate sizes,
 * negative positions, out-of-frame placement, and overlaps — without inventing a second
 * widget model. Pure and testable.
 */

export interface ValidatableWidget {
  id: string;
  type?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  includeInBuild?: boolean;
}

export type UiWidgetSeverity = 'error' | 'warning';
export type UiWidgetCode = 'duplicate_id' | 'bad_id' | 'degenerate_size' | 'negative_position' | 'out_of_frame' | 'overlap';

export interface UiWidgetFinding {
  severity: UiWidgetSeverity;
  code: UiWidgetCode;
  widgetId?: string;
  otherId?: string;
  message: string;
}

function rectsOverlap(a: ValidatableWidget, b: ValidatableWidget): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Validate the designer's widgets. `frame` (optional) is the cockpit/module frame size;
 * widgets outside it won't render in-game. Overlaps are warnings (HUD layering can be
 * intentional); duplicate ids / degenerate sizes / negative positions are errors.
 */
export function validateUiWidgets(widgets: ValidatableWidget[], frame?: { w: number; h: number }): UiWidgetFinding[] {
  const list = Array.isArray(widgets) ? widgets : [];
  const findings: UiWidgetFinding[] = [];
  const seen = new Set<string>();

  for (const w of list) {
    if (!w || typeof w !== 'object') continue;
    if (!w.id) findings.push({ severity: 'error', code: 'bad_id', message: 'A widget has no id.' });
    else if (seen.has(w.id)) findings.push({ severity: 'error', code: 'duplicate_id', widgetId: w.id, message: `Duplicate widget id "${w.id}".` });
    else seen.add(w.id);

    if (!(w.w > 0) || !(w.h > 0)) findings.push({ severity: 'error', code: 'degenerate_size', widgetId: w.id, message: `Widget "${w.id}" has a non-positive size (${w.w}×${w.h}).` });
    if (w.x < 0 || w.y < 0) findings.push({ severity: 'error', code: 'negative_position', widgetId: w.id, message: `Widget "${w.id}" has a negative position (${w.x}, ${w.y}).` });
    if (frame && frame.w > 0 && frame.h > 0 && (w.x + (w.w || 0) > frame.w || w.y + (w.h || 0) > frame.h)) {
      findings.push({ severity: 'warning', code: 'out_of_frame', widgetId: w.id, message: `Widget "${w.id}" extends past the frame (${frame.w}×${frame.h}); it may not render in-game.` });
    }
  }

  // pairwise overlap (warning)
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (!a || !b || !(a.w > 0) || !(a.h > 0) || !(b.w > 0) || !(b.h > 0)) continue;
      if (rectsOverlap(a, b)) findings.push({ severity: 'warning', code: 'overlap', widgetId: a.id, otherId: b.id, message: `Widget "${a.id}" overlaps "${b.id}".` });
    }
  }
  return findings;
}

/** Self-test oracle. */
export function runUiWidgetValidateSelftest() {
  const checks: { name: string; pass: boolean; detail?: any }[] = [];
  const ok = (name: string, pass: boolean, detail?: any) => checks.push({ name, pass, detail });

  const clean: ValidatableWidget[] = [
    { id: 'title', type: 'header', x: 0, y: 0, w: 200, h: 30 },
    { id: 'bar', type: 'progressbar', x: 0, y: 40, w: 200, h: 20 },
    { id: 'btn', type: 'button', x: 0, y: 70, w: 90, h: 24 }
  ];
  ok('clean_no_findings', validateUiWidgets(clean, { w: 300, h: 200 }).length === 0, validateUiWidgets(clean, { w: 300, h: 200 }));

  const dup: ValidatableWidget[] = [{ id: 'x', x: 0, y: 0, w: 10, h: 10 }, { id: 'x', x: 50, y: 50, w: 10, h: 10 }];
  ok('flags_duplicate_id', validateUiWidgets(dup).some(f => f.code === 'duplicate_id'));

  ok('flags_degenerate', validateUiWidgets([{ id: 'a', x: 0, y: 0, w: 0, h: 10 }]).some(f => f.code === 'degenerate_size'));
  ok('flags_negative', validateUiWidgets([{ id: 'a', x: -5, y: 0, w: 10, h: 10 }]).some(f => f.code === 'negative_position'));

  const overlap: ValidatableWidget[] = [{ id: 'a', x: 0, y: 0, w: 100, h: 100 }, { id: 'b', x: 50, y: 50, w: 100, h: 100 }];
  ok('flags_overlap_as_warning', validateUiWidgets(overlap).some(f => f.code === 'overlap' && f.severity === 'warning'));

  ok('flags_out_of_frame', validateUiWidgets([{ id: 'a', x: 280, y: 0, w: 100, h: 20 }], { w: 300, h: 200 }).some(f => f.code === 'out_of_frame'));
  ok('no_out_of_frame_without_frame', !validateUiWidgets([{ id: 'a', x: 9999, y: 0, w: 100, h: 20 }]).some(f => f.code === 'out_of_frame'));
  ok('adjacent_not_overlapping', validateUiWidgets([{ id: 'a', x: 0, y: 0, w: 50, h: 50 }, { id: 'b', x: 50, y: 0, w: 50, h: 50 }]).every(f => f.code !== 'overlap'));
  ok('empty_safe', validateUiWidgets([]).length === 0);

  const passed = checks.filter(c => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
