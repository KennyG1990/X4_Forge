/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * T4.3 (#43) — Lua↔MD binding helper. The deferred "canvas arrow" was a cross-view
 * drag (UI widgets live in the HUD&LUA builder, MD nodes on the Scripts canvas), so
 * instead this surfaces the binding CONTEXTUALLY on a selected cue: it shows the exact,
 * correct two-way glue to wire an in-game UI/Lua widget to that cue. It does NOT invent
 * engine APIs — it instantiates the already-vetted `luaSnippets` patterns
 * (`RegisterEvent` / `raise_lua_event` for MD→Lua, `AddUITriggeredEvent` /
 * `event_ui_triggered` for Lua→MD) with the cue's own event name. Pure; no I/O.
 */

import type { MDNode } from '../types';
import { fillLuaSnippet } from './luaSnippets';

export interface LuaMdBinding {
  cueId: string;
  cueLabel: string;
  /** UI-event namespace/category (the cue's namespace, or a sensible default). */
  ns: string;
  /** the event key used on both sides for this cue. */
  event: string;
  /** Trigger this cue FROM a UI/Lua widget. */
  fromUi: { lua: string; md: string };
  /** Notify a UI/Lua widget FROM this cue. */
  toUi: { md: string; lua: string };
}

function cueName(cue: MDNode): string {
  return (cue.properties?.name && String(cue.properties.name).trim()) || cue.label || cue.id;
}
/** Safe identifier token for an event key (X4 event names are dotted identifiers). */
function eventKey(cue: MDNode): string {
  return cueName(cue).replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'cue_event';
}

/** Build the deterministic Lua↔MD binding glue for a cue, or null if it's not a cue. */
export function luaMdBinding(cue: MDNode, nsOverride?: string): LuaMdBinding | null {
  if (!cue || cue.type !== 'cue') return null;
  const ns = (nsOverride || (cue.properties?.namespace && String(cue.properties.namespace).trim()) || 'this');
  const event = eventKey(cue);
  return {
    cueId: cue.id,
    cueLabel: cueName(cue),
    ns,
    event,
    // Lua → MD: the widget fires a UI event; the cue listens via <event_ui_triggered>.
    fromUi: {
      lua: fillLuaSnippet('lua_to_md_signal', { NS: ns, EVENT: event }),
      md: `<event_ui_triggered screen="'${ns}'" control="'${event}'" />`,
    },
    // MD → Lua: the cue raises a named Lua event; the widget receives it via RegisterEvent.
    toUi: {
      md: `<raise_lua_event name="'${ns}.${event}'" param="..." />`,
      lua: fillLuaSnippet('md_to_lua_event', { NS: ns, EVENT: event }),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Deterministic oracle. House shape: { allPassed, pass, passed, total, checks[] }.
 * ------------------------------------------------------------------ */
export function runLuaMdBindingSelftest(): {
  allPassed: boolean; pass: boolean; passed: number; total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, cond: boolean, detail?: string) => checks.push({ name, pass: !!cond, detail });
  const N = (id: string, type: any, props: any = {}): MDNode =>
    ({ id, type, xmlTag: type, properties: props, label: id, x: 0, y: 0, propertiesSchema: [], inputs: [], outputs: [] } as any);

  const cue = N('c1', 'cue', { name: 'On Player Docks', namespace: 'myext' });
  const b = luaMdBinding(cue)!;
  ok('binds a cue', !!b && b.cueId === 'c1');
  // event key is sanitized from the cue name
  ok('event key sanitized', b.event === 'On_Player_Docks', b.event);
  ok('uses cue namespace', b.ns === 'myext', b.ns);
  // Lua→MD uses the VERIFIED AddUITriggeredEvent pattern with the cue's ns/event substituted
  ok('fromUi.lua uses AddUITriggeredEvent', b.fromUi.lua.includes('AddUITriggeredEvent("myext", "On_Player_Docks"') && !b.fromUi.lua.includes('<NS>'), b.fromUi.lua);
  ok('fromUi.md uses event_ui_triggered', b.fromUi.md === `<event_ui_triggered screen="'myext'" control="'On_Player_Docks'" />`, b.fromUi.md);
  // MD→Lua uses the VERIFIED raise_lua_event + RegisterEvent pair
  ok('toUi.md uses raise_lua_event', b.toUi.md === `<raise_lua_event name="'myext.On_Player_Docks'" param="..." />`, b.toUi.md);
  ok('toUi.lua uses RegisterEvent', b.toUi.lua.includes('RegisterEvent("myext.On_Player_Docks"') && !b.toUi.lua.includes('<EVENT>'), b.toUi.lua);

  // namespace defaults to 'this' when the cue has none; override wins
  ok('ns defaults to this', luaMdBinding(N('c2', 'cue', { name: 'X' }))!.ns === 'this');
  ok('ns override wins', luaMdBinding(cue, 'override_ns')!.ns === 'override_ns');
  // non-cue → null
  ok('non-cue returns null', luaMdBinding(N('a1', 'action', { sound: 'x' })) === null);
  // degenerate name still yields a usable event key
  ok('degenerate name → fallback key', luaMdBinding(N('c3', 'cue', { name: '   ' }))!.event === 'c3' || luaMdBinding(N('c3', 'cue', {}))!.event === 'c3');

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
