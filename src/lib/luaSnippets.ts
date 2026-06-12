/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lever 3 — Lua/UI editor edge-hardening (templatize).
 *
 * A vetted library of the *harder* X4 Lua patterns that modders otherwise get wrong:
 * the MD <-> Lua event bridge, async HTTP callbacks, sending data back to MD, guarded
 * menu registration, and a guarded periodic update. These are insertable templates for
 * the HUD & LUA UI Lua editor — real X4 conventions (RegisterEvent / AddUITriggeredEvent /
 * Helper.registerMenu), guarded so a missing global never hard-errors in-game.
 *
 * Each snippet uses <PLACEHOLDER> tokens the editor can prompt for. The studio never
 * fabricates engine APIs that don't exist; where the real construction belongs to X4's
 * Helper/widgetSystem, the snippet calls into it rather than inventing calls.
 */

export type LuaSnippetCategory = 'events' | 'http' | 'menu' | 'lifecycle';

export interface LuaSnippet {
  id: string;
  title: string;
  category: LuaSnippetCategory;
  description: string;
  /** <UPPERCASE> tokens the user fills in. */
  placeholders: string[];
  lua: string;
}

export const LUA_SNIPPETS: LuaSnippet[] = [
  {
    id: 'md_to_lua_event',
    title: 'MD → Lua event handler',
    category: 'events',
    description: 'Receive an MD `raise_lua_event` (name="<NS>.<EVENT>") and read its param table.',
    placeholders: ['<NS>', '<EVENT>'],
    lua: [
      '-- MD side:  <raise_lua_event name="\'<NS>.<EVENT>\'" param="..." />',
      '-- The param is read back with the GetNPCBlackboard / event-param convention.',
      'RegisterEvent("<NS>.<EVENT>", function(_, param)',
      '    -- param is the value MD passed (table, string, or number).',
      '    DebugError("[<NS>] <EVENT> received: " .. tostring(param))',
      '    -- ... handle it ...',
      'end)'
    ].join('\n')
  },
  {
    id: 'lua_to_md_signal',
    title: 'Lua → MD signal',
    category: 'events',
    description: 'Send a result from Lua back to MD, where a cue listens for the UI-triggered event.',
    placeholders: ['<NS>', '<EVENT>'],
    lua: [
      '-- Lua -> MD: fire a UI event MD can react to with',
      '--   <event_ui_triggered screen="\'<NS>\'" control="\'<EVENT>\'" />',
      'local function notifyMD(payload)',
      '    AddUITriggeredEvent("<NS>", "<EVENT>", payload)',
      'end',
      '',
      'notifyMD({ ok = true })'
    ].join('\n')
  },
  {
    id: 'async_http_request',
    title: 'Async HTTP request (non-blocking)',
    category: 'http',
    description: 'Call an external local process without blocking the game loop; handle the JSON response in the callback.',
    placeholders: ['<HTTP_CLIENT>', '<URL>', '<NS>', '<EVENT>'],
    lua: [
      'local http = <HTTP_CLIENT>   -- e.g. require("extensions.sn_mod_support_apis.lua.simple_http")',
      'local json = require("json")',
      '',
      'local function callExternal(payload)',
      '    http.request({',
      '        method = "POST",',
      '        url = "<URL>",',
      '        body = json.encode(payload or {}),',
      '        headers = { ["Content-Type"] = "application/json" }',
      '    }, function(err, response)',
      '        if err ~= nil then',
      '            AddUITriggeredEvent("<NS>", "<EVENT>.error", tostring(err))',
      '            return',
      '        end',
      '        local ok, decoded = pcall(json.decode, response and response.body or "")',
      '        AddUITriggeredEvent("<NS>", "<EVENT>.response", ok and decoded or {})',
      '    end)',
      'end'
    ].join('\n')
  },
  {
    id: 'menu_registration',
    title: 'Register a custom menu (guarded)',
    category: 'menu',
    description: "Register a menu via X4's Helper, guarded so a missing global doesn't hard-error during load.",
    placeholders: ['<MENU_NAME>'],
    lua: [
      'local menu = { name = "<MENU_NAME>" }',
      '',
      'local function init()',
      '    if Menus == nil then return end   -- guard: global may not be ready',
      '    for _, m in ipairs(Menus) do',
      '        if m.name == menu.name then return end  -- already registered',
      '    end',
      '    table.insert(Menus, menu)',
      '    if Helper and Helper.registerMenu then',
      '        Helper.registerMenu(menu)',
      '    end',
      'end',
      '',
      'function menu.onShowMenu()',
      '    -- build/refresh the menu here via Helper / widgetSystem',
      'end',
      '',
      'init()'
    ].join('\n')
  },
  {
    id: 'guarded_update_loop',
    title: 'Guarded periodic update',
    category: 'lifecycle',
    description: 'Run logic on a fixed interval without leaking time or hard-erroring if the frame API is missing.',
    placeholders: ['<INTERVAL_SECONDS>'],
    lua: [
      'local accum = 0',
      'local INTERVAL = <INTERVAL_SECONDS>',
      '',
      'local function onUpdate()',
      '    local now = (GetCurRealTime and GetCurRealTime()) or 0',
      '    if now - accum < INTERVAL then return end',
      '    accum = now',
      '    -- ... periodic work ...',
      'end',
      '',
      'if SetScript then SetScript("onUpdate", onUpdate) end'
    ].join('\n')
  }
];

export function getLuaSnippet(id: string): LuaSnippet | undefined {
  return LUA_SNIPPETS.find(s => s.id === id);
}

/** Fill a snippet's <PLACEHOLDER> tokens from a map; unfilled tokens are left in place. */
export function fillLuaSnippet(id: string, values: Record<string, string>): string {
  const snip = getLuaSnippet(id);
  if (!snip) return '';
  let out = snip.lua;
  for (const token of snip.placeholders) {
    const key = token.replace(/[<>]/g, '');
    if (values[key] != null) out = out.split(token).join(String(values[key]));
  }
  return out;
}

const balanced = (s: string, open: string, close: string) =>
  (s.split(open).length - 1) === (s.split(close).length - 1);

/**
 * Self-test oracle for the Lua snippet library. Validates each snippet is well-formed
 * (non-empty, unique id, declared category, balanced ( ) and { }, declared placeholders
 * actually appear, and any RegisterEvent/AddUITriggeredEvent/http.request call is shaped
 * correctly). Returns { allPassed, passed, total, checks }.
 */
export function runLuaSnippetSelftest() {
  const checks: { name: string; pass: boolean; detail?: any }[] = [];
  const ok = (name: string, pass: boolean, detail?: any) => checks.push({ name, pass, detail });

  const ids = LUA_SNIPPETS.map(s => s.id);
  ok('non_empty_library', LUA_SNIPPETS.length >= 5);
  ok('unique_ids', new Set(ids).size === ids.length);
  ok('all_have_category', LUA_SNIPPETS.every(s => ['events', 'http', 'menu', 'lifecycle'].includes(s.category)));
  ok('all_non_empty_lua', LUA_SNIPPETS.every(s => typeof s.lua === 'string' && s.lua.trim().length > 0));
  ok('all_balanced_parens', LUA_SNIPPETS.every(s => balanced(s.lua, '(', ')')));
  ok('all_balanced_braces', LUA_SNIPPETS.every(s => balanced(s.lua, '{', '}')));
  ok('declared_placeholders_present', LUA_SNIPPETS.every(s => s.placeholders.every(p => s.lua.includes(p))));

  // event bridge correctness
  ok('md_to_lua_uses_RegisterEvent', getLuaSnippet('md_to_lua_event')!.lua.includes('RegisterEvent("<NS>.<EVENT>"'));
  ok('lua_to_md_uses_AddUITriggeredEvent', getLuaSnippet('lua_to_md_signal')!.lua.includes('AddUITriggeredEvent("<NS>", "<EVENT>"'));

  // http snippet correctness
  const http = getLuaSnippet('async_http_request')!.lua;
  ok('http_async_callback', http.includes('function(err, response)') && http.includes('http.request('));
  ok('http_json_encode_decode', http.includes('json.encode(') && http.includes('json.decode'));
  ok('http_routes_response_and_error', http.includes('.response') && http.includes('.error'));

  // menu snippet is guarded
  const menu = getLuaSnippet('menu_registration')!.lua;
  ok('menu_guards_missing_globals', menu.includes('if Menus == nil then return end') && menu.includes('if Helper and Helper.registerMenu'));

  // lifecycle snippet is guarded + interval-limited
  const life = getLuaSnippet('guarded_update_loop')!.lua;
  ok('update_loop_guarded_and_throttled', life.includes('if SetScript then') && life.includes('< INTERVAL then return end'));

  // fill replaces tokens
  const filled = fillLuaSnippet('md_to_lua_event', { NS: 'myext', EVENT: 'get_status' });
  ok('fill_replaces_tokens', filled.includes('myext.get_status') && !filled.includes('<NS>'));

  const passed = checks.filter(c => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
