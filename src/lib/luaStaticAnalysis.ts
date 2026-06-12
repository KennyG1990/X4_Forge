/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Deterministic Lua static analysis for Extension Doctor.
 *
 * Layer 1: baseline Lua hygiene from luaparse (syntax + undefined globals).
 * Layer 2: Forge-native X4 rules for engine/runtime hazards.
 *
 * Globals are intentionally deterministic: a fixed seed of Lua/X4 globals plus
 * global definitions discovered from the scanned installed Lua files. AI can
 * suggest candidates later, but those suggestions must not silently enter this
 * allowlist.
 */

import { parse } from 'luaparse';

export interface LuaFileInput {
  rel: string;
  text: string;
  source: 'loose' | 'packed';
  sourcePath: string;
  extension: { folder: string; id: string; name?: string };
}

export interface LuaStaticFinding {
  layer: 'baseline' | 'x4';
  severity: 'error' | 'warning' | 'info';
  code: string;
  rel: string;
  message: string;
  symbol?: string;
  line?: number;
  column?: number;
  source: 'loose' | 'packed';
  sourcePath: string;
}

export interface LuaStaticAnalysisResult {
  filesScanned: number;
  globalAllowlistSize: number;
  findings: LuaStaticFinding[];
}

const LUA_STANDARD_GLOBALS = new Set([
  '_G', '_VERSION',
  'assert', 'collectgarbage', 'dofile', 'error', 'getfenv', 'getmetatable', 'ipairs',
  'load', 'loadfile', 'loadstring', 'module', 'next', 'pairs', 'pcall', 'print',
  'rawequal', 'rawget', 'rawset', 'require', 'select', 'setfenv', 'setmetatable',
  'tonumber', 'tostring', 'type', 'unpack', 'xpcall',
  'coroutine', 'debug', 'io', 'math', 'os', 'package', 'string', 'table'
]);

const X4_ENGINE_GLOBALS = new Set([
  'AddUITriggeredEvent', 'DebugError', 'DebugText', 'GetCurTime', 'GetNPCBlackboard',
  'GetPlayerID', 'Helper', 'IsValidWidgetElement', 'OnlineGetUserItemAmount',
  'OnlineGetUserItems', 'RegisterEvent', 'RemoveEvent', 'SetNPCBlackboard',
  'SetScript', 'SignalObject', 'TraceBack', 'ffi', 'json', 'widgetSystem'
]);

const RESTRICTED_X4_UI_CALLS = [
  { name: 'OnlineGetUserItemAmount', pattern: /\bOnlineGetUserItemAmount\s*\(/ },
  { name: 'OnlineGetUserItems', pattern: /\bOnlineGetUserItems\b/ }
];

function walkAst(node: any, visit: (node: any) => void) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'range' || key === 'comments' || key === 'tokens' || key === 'globals') continue;
    if (Array.isArray(value)) {
      for (const item of value) walkAst(item, visit);
    } else if (value && typeof value === 'object') {
      walkAst(value, visit);
    }
  }
}

function globalNameFromExpression(expr: any): string | null {
  if (!expr) return null;
  if (expr.type === 'Identifier') return expr.name;
  if (expr.type === 'MemberExpression') return globalNameFromExpression(expr.base);
  return null;
}

function parseLua(text: string) {
  return parse(text, {
    comments: false,
    locations: true,
    ranges: true,
    scope: true,
    luaVersion: '5.2'
  });
}

function collectGlobalDefinitions(files: LuaFileInput[]): Set<string> {
  const defs = new Set<string>();
  for (const file of files) {
    let ast: any;
    try { ast = parseLua(file.text); } catch { continue; }
    walkAst(ast, node => {
      if (node.type === 'AssignmentStatement') {
        for (const variable of node.variables || []) {
          const name = globalNameFromExpression(variable);
          if (name) defs.add(name);
        }
      }
      if (node.type === 'FunctionDeclaration' && !node.isLocal) {
        const name = globalNameFromExpression(node.identifier);
        if (name) defs.add(name);
      }
    });
  }
  return defs;
}

export function analyzeLuaFiles(files: LuaFileInput[]): LuaStaticAnalysisResult {
  const allow = new Set([...LUA_STANDARD_GLOBALS, ...X4_ENGINE_GLOBALS, ...collectGlobalDefinitions(files)]);
  const findings: LuaStaticFinding[] = [];

  for (const file of files) {
    const relLower = file.rel.toLowerCase();
    let ast: any;
    try {
      ast = parseLua(file.text);
    } catch (error: any) {
      findings.push({
        layer: 'baseline',
        severity: 'error',
        code: 'lua.syntax_error',
        rel: file.rel,
        message: `Lua parser error in ${file.rel}: ${error?.message || 'syntax error'}`,
        line: error?.line,
        column: error?.column,
        source: file.source,
        sourcePath: file.sourcePath
      });
      continue;
    }

    const seenGlobals = new Set<string>();
    for (const g of ast.globals || []) {
      const name = g?.name;
      if (!name || allow.has(name) || seenGlobals.has(name)) continue;
      seenGlobals.add(name);
      findings.push({
        layer: 'baseline',
        severity: 'info',
        code: 'lua.undefined_global',
        rel: file.rel,
        message: `${file.rel} references global "${name}" that is not in the deterministic Lua/X4 allowlist and is not defined by scanned Lua files.`,
        symbol: name,
        line: g?.loc?.start?.line,
        column: g?.loc?.start?.column,
        source: file.source,
        sourcePath: file.sourcePath
      });
      if (seenGlobals.size >= 8) break;
    }

    if (relLower.endsWith('.lua') && relLower.startsWith('ui/')) {
      for (const fn of RESTRICTED_X4_UI_CALLS) {
        if (!fn.pattern.test(file.text)) continue;
        findings.push({
          layer: 'x4',
          severity: 'error',
          code: 'lua.restricted_online_call',
          rel: file.rel,
          message: `Calls or patches restricted UI function ${fn.name} from ${file.rel}. X4 can abort online user-item calls from non-verified sources; later menu errors are likely cascade symptoms.`,
          symbol: fn.name,
          source: file.source,
          sourcePath: file.sourcePath
        });
      }
    }
  }

  return { filesScanned: files.length, globalAllowlistSize: allow.size, findings };
}

export function runLuaStaticAnalysisSelftest(): { pass: boolean; checks: { name: string; pass: boolean; detail?: string }[] } {
  const files: LuaFileInput[] = [
    {
      rel: 'ui/good.lua',
      text: 'local x = 1\nHelper.foo(x)\nfunction MyGlobal.ok() return true end\n',
      source: 'loose',
      sourcePath: 'good'
      , extension: { folder: 'good', id: 'good' }
    },
    {
      rel: 'ui/bad.lua',
      text: 'local amount = OnlineGetUserItemAmount("paint")\nMissingGlobalCall()\n',
      source: 'packed',
      sourcePath: 'ext_01.cat',
      extension: { folder: 'bad', id: 'bad' }
    },
    {
      rel: 'ui/broken.lua',
      text: 'function nope(\n',
      source: 'loose',
      sourcePath: 'broken',
      extension: { folder: 'broken', id: 'broken' }
    }
  ];
  const result = analyzeLuaFiles(files);
  const has = (code: string, pred?: (f: LuaStaticFinding) => boolean) =>
    result.findings.some(f => f.code === code && (!pred || pred(f)));
  const checks = [
    { name: 'syntax_error_detected', pass: has('lua.syntax_error', f => f.rel === 'ui/broken.lua') },
    { name: 'restricted_x4_call_detected', pass: has('lua.restricted_online_call', f => f.rel === 'ui/bad.lua' && f.layer === 'x4' && f.severity === 'error') },
    { name: 'undefined_global_detected', pass: has('lua.undefined_global', f => f.symbol === 'MissingGlobalCall' && f.layer === 'baseline') },
    { name: 'x4_seed_global_not_flagged', pass: !result.findings.some(f => f.code === 'lua.undefined_global' && f.symbol === 'Helper') },
    { name: 'scanned_global_definition_not_flagged', pass: !result.findings.some(f => f.code === 'lua.undefined_global' && f.symbol === 'MyGlobal') }
  ];
  return { pass: checks.every(c => c.pass), checks };
}
