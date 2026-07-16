/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Deterministic parser for pasted X4 Lua/XPL runtime log text.
 *
 * This is intentionally author-time inspection, not live game tailing. It
 * recognizes the runtime shapes X4 writes for Lua stack frames, XPL aborts,
 * restricted UI calls, and file-signature warnings, then correlates them to the
 * active Lua buffer when possible.
 */

export type LuaRuntimeSeverity = 'error' | 'warning' | 'info';

export interface LuaRuntimeFile {
  rel: string;
  text: string;
  source?: string;
}

export interface LuaRuntimeSymbols {
  files: string[];
  events: string[];
  uiEvents: string[];
  functions: string[];
}

export interface LuaRuntimeFrame {
  file: string;
  line?: number;
  functionName?: string;
  raw: string;
  matchedRel?: string;
}

export interface LuaRuntimeIssue {
  severity: LuaRuntimeSeverity;
  code: 'lua.runtime_error' | 'lua.restricted_call' | 'lua.signature_warning' | 'lua.stack_frame';
  lineNo: number;
  raw: string;
  message: string;
  file?: string;
  line?: number;
  functionName?: string;
  restrictedFunction?: string;
  matchedRel?: string;
  eventNames: string[];
  frames: LuaRuntimeFrame[];
}

export interface LuaRuntimeLogResult {
  issues: LuaRuntimeIssue[];
  frames: LuaRuntimeFrame[];
  symbols: LuaRuntimeSymbols;
  totals: {
    lines: number;
    issues: number;
    errors: number;
    warnings: number;
    frames: number;
    matchedFiles: number;
  };
}

type Check = { name: string; pass: boolean; detail?: string };

const REGISTER_EVENT_RE = /\bRegisterEvent\s*\(\s*["']([^"']+)["']/g;
const UI_TRIGGER_RE = /\bAddUITriggeredEvent\s*\(\s*(?:(["'])([^"']+)\1\s*,\s*)?(["'])([^"']+)\3/g;
const FUNCTION_RE = /\b(?:local\s+)?function\s+([A-Za-z_][A-Za-z0-9_:.]*)\s*\(/g;
const ASSIGNED_FUNCTION_RE = /\b([A-Za-z_][A-Za-z0-9_.:]*)\s*=\s*function\s*\(/g;

const RUNTIME_LUA_RE = /(?:^|\s)([A-Za-z]:[\\/][^:\n]+?\.lua|\.?[\\/][^:\n]+?\.lua|ui[\\/][^:\n]+?\.lua):(\d+):\s*(.+)$/i;
const STACK_FRAME_RE = /^\s*(?:\[[Cc]\]:\s*)?(?:in function\s+["']([^"']+)["']|([A-Za-z]:[\\/][^:\n]+?\.lua|\.?[\\/][^:\n]+?\.lua|ui[\\/][^:\n]+?\.lua):(\d+):\s*in function\s+["']?([^"']+)["']?)\s*$/i;
const XPL_FILE_RE = /([A-Za-z]:[\\/][^:\n]+?\.(?:xpl|lua)|\.?[\\/][^:\n]+?\.(?:xpl|lua)|ui[\\/][^:\n]+?\.(?:xpl|lua))\((\d+)\):\s*(.+)$/i;
const RESTRICTED_RE = /Restricted function\s+([A-Za-z_][A-Za-z0-9_.]*)\s*\(\)\s+called from non-verified source\s+['"]([^'"]+)['"]/i;
const SIGNATURE_RE = /Failed to verify the file signature for file\s+['"]([^'"]+)['"]/i;

function normalizePath(value: string): string {
  return value
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^[A-Za-z]:\//, '')
    .toLowerCase();
}

function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(values).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function collectMatches(text: string, pattern: RegExp): string[] {
  const found: string[] = [];
  pattern.lastIndex = 0;
  let match = pattern.exec(text);
  while (match) {
    found.push(match[1]);
    match = pattern.exec(text);
  }
  return found;
}

export function extractLuaRuntimeSymbols(files: LuaRuntimeFile[]): LuaRuntimeSymbols {
  const fileNames = new Set<string>();
  const events = new Set<string>();
  const uiEvents = new Set<string>();
  const functions = new Set<string>();

  for (const file of files || []) {
    if (!file?.rel) continue;
    fileNames.add(file.rel);
    const text = file.text || '';
    for (const eventName of collectMatches(text, REGISTER_EVENT_RE)) events.add(eventName);

    UI_TRIGGER_RE.lastIndex = 0;
    let trigger = UI_TRIGGER_RE.exec(text);
    while (trigger) {
      const namespace = trigger[2];
      const control = trigger[4];
      uiEvents.add(namespace ? `${namespace}.${control}` : control);
      trigger = UI_TRIGGER_RE.exec(text);
    }

    for (const fnName of collectMatches(text, FUNCTION_RE)) functions.add(fnName);
    for (const fnName of collectMatches(text, ASSIGNED_FUNCTION_RE)) functions.add(fnName);
  }

  return {
    files: uniqueSorted(fileNames),
    events: uniqueSorted(events),
    uiEvents: uniqueSorted(uiEvents),
    functions: uniqueSorted(functions)
  };
}

function matchKnownFile(file: string, knownFiles: string[]): string | undefined {
  const normalized = normalizePath(file);
  return knownFiles.find(rel => {
    const relNorm = normalizePath(rel);
    return normalized === relNorm || normalized.endsWith(`/${relNorm}`);
  });
}

function parseFrame(raw: string, knownFiles: string[]): LuaRuntimeFrame | null {
  const stackMatch = raw.match(STACK_FRAME_RE);
  if (stackMatch) {
    const functionName = stackMatch[1] || stackMatch[4] || undefined;
    const file = stackMatch[2] || '[C]';
    const line = stackMatch[3] ? Number(stackMatch[3]) : undefined;
    const matchedRel = file === '[C]' ? undefined : matchKnownFile(file, knownFiles);
    return { raw, file, line, functionName, matchedRel };
  }

  const luaMatch = raw.match(RUNTIME_LUA_RE);
  if (!luaMatch) return null;
  const file = luaMatch[1];
  const line = Number(luaMatch[2]);
  const matchedRel = matchKnownFile(file, knownFiles);
  return { raw, file, line, matchedRel };
}

function correlatedEventNames(raw: string, symbols: LuaRuntimeSymbols): string[] {
  const names = [...symbols.events, ...symbols.uiEvents, ...symbols.functions];
  return uniqueSorted(names.filter(name => raw.includes(name)));
}

function collectFollowingFrames(lines: string[], startIndex: number, knownFiles: string[]): LuaRuntimeFrame[] {
  const frames: LuaRuntimeFrame[] = [];
  for (let i = startIndex + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || /^\[[^\]]+\]\s+\d/.test(trimmed)) break;
    if (/^stack traceback:$/i.test(trimmed)) continue;
    const frame = parseFrame(lines[i], knownFiles);
    if (!frame) {
      if (frames.length > 0) break;
      continue;
    }
    frames.push(frame);
  }
  return frames;
}

function runtimeIssueFromLine(raw: string, lineNo: number, symbols: LuaRuntimeSymbols, knownFiles: string[], lines: string[], index: number): LuaRuntimeIssue | null {
  const restricted = raw.match(RESTRICTED_RE);
  if (restricted) {
    const xpl = raw.match(XPL_FILE_RE);
    const file = xpl?.[1] || restricted[2];
    const line = xpl?.[2] ? Number(xpl[2]) : undefined;
    return {
      severity: 'error',
      code: 'lua.restricted_call',
      lineNo,
      raw,
      message: raw.trim(),
      file,
      line,
      restrictedFunction: restricted[1],
      matchedRel: matchKnownFile(file, knownFiles),
      eventNames: correlatedEventNames(raw, symbols),
      frames: collectFollowingFrames(lines, index, knownFiles)
    };
  }

  const signature = raw.match(SIGNATURE_RE);
  if (signature) {
    const file = signature[1];
    return {
      severity: 'warning',
      code: 'lua.signature_warning',
      lineNo,
      raw,
      message: raw.trim(),
      file,
      matchedRel: matchKnownFile(file, knownFiles),
      eventNames: correlatedEventNames(raw, symbols),
      frames: []
    };
  }

  if (raw.match(STACK_FRAME_RE)) return null;

  const xpl = raw.match(XPL_FILE_RE);
  if (xpl) {
    const file = xpl[1];
    return {
      severity: 'error',
      code: 'lua.runtime_error',
      lineNo,
      raw,
      message: xpl[3].trim(),
      file,
      line: Number(xpl[2]),
      matchedRel: matchKnownFile(file, knownFiles),
      eventNames: correlatedEventNames(raw, symbols),
      frames: collectFollowingFrames(lines, index, knownFiles)
    };
  }

  const lua = raw.match(RUNTIME_LUA_RE);
  if (lua) {
    const file = lua[1];
    const frame = parseFrame(raw, knownFiles);
    return {
      severity: 'error',
      code: 'lua.runtime_error',
      lineNo,
      raw,
      message: lua[3].trim(),
      file,
      line: Number(lua[2]),
      functionName: frame?.functionName,
      matchedRel: matchKnownFile(file, knownFiles),
      eventNames: correlatedEventNames(raw, symbols),
      frames: collectFollowingFrames(lines, index, knownFiles)
    };
  }

  return null;
}

export function analyzeLuaRuntimeLog(logText: string, files: LuaRuntimeFile[] = []): LuaRuntimeLogResult {
  const text = typeof logText === 'string' ? logText : '';
  const lines = text.split(/\r?\n/);
  const symbols = extractLuaRuntimeSymbols(files);
  const knownFiles = symbols.files;
  const issues: LuaRuntimeIssue[] = [];
  const frames: LuaRuntimeFrame[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;

    const frame = parseFrame(raw, knownFiles);
    if (frame) frames.push(frame);

    const issue = runtimeIssueFromLine(raw, i + 1, symbols, knownFiles, lines, i);
    if (issue) issues.push(issue);
  }

  const matched = new Set<string>();
  for (const issue of issues) if (issue.matchedRel) matched.add(issue.matchedRel);
  for (const frame of frames) if (frame.matchedRel) matched.add(frame.matchedRel);

  return {
    issues,
    frames,
    symbols,
    totals: {
      lines: lines.filter(line => line.trim()).length,
      issues: issues.length,
      errors: issues.filter(issue => issue.severity === 'error').length,
      warnings: issues.filter(issue => issue.severity === 'warning').length,
      frames: frames.length,
      matchedFiles: matched.size
    }
  };
}

export function runLuaRuntimeLogSelftest() {
  const checks: Check[] = [];
  const ok = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, detail });

  const files: LuaRuntimeFile[] = [
    {
      rel: 'ui/ai_influence_chat.lua',
      text: [
        'local menu = {}',
        'function menu.onResponse() return true end',
        'RegisterEvent("ai_influence.chat", menu.onResponse)',
        'AddUITriggeredEvent("ai_influence", "chat.response")',
        'return menu'
      ].join('\n'),
      source: 'workspace'
    },
    {
      rel: 'ui/other.lua',
      text: 'local function helper() return true end',
      source: 'workspace'
    }
  ];

  const log = [
    "[=ERROR=] 22.90 C:/Steam/steamapps/common/X4 Foundations/ui/addons/ego_gameoptions/gameoptions.xpl(6340): (from presentation 'ui/widget/presentations/widget_fullscreen/widget_fullscreen.bgf') Restricted function OnlineGetVersionIncompatibilityState() called from non-verified source 'ui/addons/ego_gameoptions/gameoptions.xpl'! Aborting call!",
    "File I/O: Failed to verify the file signature for file '.\\ui\\addons\\ego_gameoptions\\gameoptions.xpl'",
    "ui/ai_influence_chat.lua:42: attempt to index a nil value while handling ai_influence.chat and ai_influence.chat.response",
    'stack traceback:',
    "\tui/ai_influence_chat.lua:42: in function 'menu.onResponse'",
    "\t[C]: in function 'xpcall'"
  ].join('\n');

  const result = analyzeLuaRuntimeLog(log, files);
  const restricted = result.issues.find(issue => issue.code === 'lua.restricted_call');
  const signature = result.issues.find(issue => issue.code === 'lua.signature_warning');
  const runtime = result.issues.find(issue => issue.code === 'lua.runtime_error' && issue.matchedRel === 'ui/ai_influence_chat.lua');

  ok('extracts_register_event', result.symbols.events.includes('ai_influence.chat'));
  ok('extracts_ui_trigger_event', result.symbols.uiEvents.includes('ai_influence.chat.response'));
  ok('extracts_function_symbol', result.symbols.functions.includes('menu.onResponse'));
  ok('parses_restricted_call', restricted?.restrictedFunction === 'OnlineGetVersionIncompatibilityState', restricted?.restrictedFunction);
  ok('captures_xpl_file_line', restricted?.file?.endsWith('gameoptions.xpl') === true && restricted.line === 6340, `${restricted?.file}:${restricted?.line}`);
  ok('parses_signature_warning', signature?.severity === 'warning' && signature.file?.includes('gameoptions.xpl') === true);
  ok('parses_lua_runtime_error', runtime?.line === 42 && runtime.message.includes('nil value'), `${runtime?.line}:${runtime?.message}`);
  ok('matches_known_lua_file', result.totals.matchedFiles === 1, String(result.totals.matchedFiles));
  ok('captures_stack_frame', result.frames.some(frame => frame.functionName === 'menu.onResponse' && frame.line === 42));
  ok('attaches_following_frame_to_issue', runtime?.frames.some(frame => frame.functionName === 'menu.onResponse') === true);
  ok('correlates_events_in_log_line', runtime?.eventNames.includes('ai_influence.chat') === true && runtime.eventNames.includes('ai_influence.chat.response') === true, runtime?.eventNames.join(','));
  ok('empty_log_safe', analyzeLuaRuntimeLog('', files).totals.issues === 0);
  ok('no_false_suffix_match', analyzeLuaRuntimeLog('ui/ai_influence_chat.lua.bak:42: broken', files).totals.matchedFiles === 0);

  const passed = checks.filter(check => check.pass).length;
  return { allPassed: passed === checks.length, pass: passed === checks.length, passed, total: checks.length, checks };
}
