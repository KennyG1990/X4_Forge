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
import { type X4UiSourceLocation } from './x4UiCallModel';
import { type X4UiLintFinding, type X4UiLintResult } from './x4UiLint';
import { analyzeX4UiFile } from './x4UiAnalysisCache';
import { buildX4MenuLuaRuntimeInventory, normalizeX4UiSourcePath, registeredX4MenuLuaPaths, type X4MenuLuaRuntimeInventory } from './x4UiSourceBundle';

/**
 * Strip Lua comments so source-pattern rules match CODE, not prose. Without this the
 * djfhe/package.path rules false-positive on the very warning comments that tell authors
 * NOT to write those patterns (e.g. aic_uix.lua documents the hazard in a `--` comment).
 * Removes long-bracket block comments (--[[ ]], --[=[ ]=]) then line comments. Not
 * string-literal aware, which is fine here: real `require(...)` / `package.path` code has no
 * leading `--`, so only commentary is removed.
 */
export function stripLuaComments(src: string): string {
  let s = src.replace(/--\[(=*)\[[\s\S]*?\]\1\]/g, ' ');
  s = s.replace(/--[^\n]*/g, ' ');
  return s;
}

export interface LuaFileInput {
  rel: string;
  text: string;
  source: 'loose' | 'packed';
  sourcePath: string;
  extension: { folder: string; id: string; name?: string; menuLuaPaths?: ReadonlySet<string>; runtimeInventory?: X4MenuLuaRuntimeInventory };
}

type LuaScopeSource = Omit<LuaFileInput, 'text'>;
export type LuaManifestScopeInput = LuaScopeSource & {
  extension: LuaFileInput['extension'] & { runtimeInventory: X4MenuLuaRuntimeInventory };
};

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
  /** Structured X4 UI rule context retained for richer consumers. */
  cause?: string;
  failureMode?: string;
  evidenceBoundary?: string;
  nextAction?: string;
}

export interface LuaStaticX4UiFileResult {
  rel: string;
  source: 'loose' | 'packed';
  sourcePath: string;
  /** The pure per-file result; gap details are intentionally not flattened. */
  result: X4UiLintResult;
}

export interface LuaStaticX4UiSummary {
  filesAnalyzed: number;
  errorCount: number;
  warningCount: number;
  verificationGapCount: number;
  filesWithErrors: number;
  filesWithWarnings: number;
  cleanCount: number;
  unverifiedCount: number;
  truncatedCount: number;
}

export interface LuaStaticAnalysisResult {
  filesScanned: number;
  globalAllowlistSize: number;
  findings: LuaStaticFinding[];
  x4UiResults: LuaStaticX4UiFileResult[];
  x4UiSummary: LuaStaticX4UiSummary;
  runtimeScope: LuaRuntimeScopeResult;
}

export type LuaRuntimeScopeCheck = 'lua.syntax' | 'lua.registrations' | 'lua.globals-order';
export interface LuaRuntimeScopeGap {
  check: 'lua.registrations' | 'lua.globals-order';
  rel: string;
  sourcePath: string;
  line?: number;
  column?: number;
  reason: string;
}
export interface LuaRuntimeScopeStage {
  check: LuaRuntimeScopeCheck;
  status: 'pass' | 'fail' | 'partial' | 'unavailable' | 'not-applicable';
  files: readonly { rel: string; sourcePath: string }[];
  gapCount: number;
  evidenceBoundary: string;
}
export interface LuaRuntimeScopeResult {
  stages: readonly LuaRuntimeScopeStage[];
  gaps: readonly LuaRuntimeScopeGap[];
  truncated: boolean;
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
  'AddUITriggeredEvent', 'ConvertStringTo64Bit', 'DebugError', 'DebugText', 'GetComponentData',
  'GetCurRealTime', 'GetCurTime', 'GetNPCBlackboard', 'GetPlayerID', 'GetWareData',
  // X4 9.00 widget_fullscreen.lua:18830 exports GetTopRow via AddGlobalAccess.
  'GetTopRow', 'Helper', 'IsValidWidgetElement', 'OpenMenu', 'ReadText', 'OnlineGetUserItemAmount',
  'OnlineGetUserItems', 'RegisterEvent', 'RemoveEvent', 'RemoveScript', 'SetNPCBlackboard',
  'SetScript', 'SignalObject', 'TraceBack', 'ffi', 'json', 'widgetSystem'
]);

const RESTRICTED_X4_UI_CALLS = [
  { name: 'OnlineGetUserItemAmount', pattern: /\bOnlineGetUserItemAmount\s*\(/ },
  { name: 'OnlineGetUserItems', pattern: /\bOnlineGetUserItems\b/ }
];

const X4_UI_MODELED_CALL_NAMES = new Set([
  'createFrameHandle', 'addTable', 'setColWidthPercent', 'setColWidth', 'addRow',
  'setColSpan', 'display', 'OpenMenu', 'setText', 'setText2', 'createText', 'createEditBox',
  'setDefaultCellProperties', 'setDefaultComplexCellProperties', 'setHotkey'
]);

const X4_UI_VERIFICATION_SUMMARY_CODE = 'x4-ui.verification-gap';
const X4_UI_TRUNCATION_CODE = 'x4-ui.truncated-evidence';

function globalNameFromExpression(expr: any): string | null {
  let root = expr;
  while (root?.type === 'MemberExpression') root = root.base;
  return root?.type === 'Identifier' ? root.name : null;
}

function environmentMutationTarget(expr: any): boolean {
  let root = expr;
  while (root?.type === 'MemberExpression' || root?.type === 'IndexExpression') root = root.base;
  return root?.type === 'Identifier' && root.isLocal === false && ['_G', '_ENV', 'package'].includes(root.name);
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

function normalizeLuaFile(file: LuaFileInput): LuaFileInput {
  // Official X4 Lua files can begin with one decoded UTF-8 BOM. Remove only that
  // marker once so every analyzer layer sees the same source without shifting lines.
  if (file.text.charCodeAt(0) !== 0xFEFF) return file;
  return { ...file, text: file.text.slice(1) };
}

const SCOPE_UNVERIFIED = 'lua.runtime_scope_unverified';
const GLOBAL_BEFORE_DEFINITION = 'lua.global_before_definition';
const MAX_SCOPE_DEPTH = 64;
const MAX_SCOPE_NODES = 100_000;
const MAX_SCOPE_FACTS = 8192;
const MAX_SCOPE_GAPS = 64;
type LuaPhase = 'load' | 'deferred' | 'unknown';
interface LuaFactContext {
  phase: LuaPhase;
  conditional: boolean;
  protected: boolean;
  guards: ReadonlySet<string>;
  authority?: 'pcall' | 'type';
}
interface LuaGlobalEvent {
  kind: 'read' | 'write' | 'boundary';
  name: string;
  node: any;
  phase: LuaPhase;
  conditional: boolean;
  guarded: boolean;
  protected: boolean;
  authority?: 'pcall' | 'type';
  value?: 'non-nil' | 'nil' | 'unknown';
  boundary?: 'environment' | 'opaque';
}
interface ParsedLuaFacts {
  error?: any;
  globals: { name: string; loc?: any }[];
  legacyDefinitions: Set<string>;
  events: LuaGlobalEvent[];
  gaps: { node?: any; reason: string }[];
  truncated: boolean;
  uiLikely: boolean;
}

/** One bounded source traversal, not a Lua interpreter or invocation graph. */
function collectLuaFacts(file: LuaFileInput, ast: any): ParsedLuaFacts {
  const result: ParsedLuaFacts = {
    globals: (ast.globals || []).map((node: any) => ({ name: node.name, loc: node.loc })),
    legacyDefinitions: new Set(), events: [], gaps: [], truncated: false, uiLikely: isUiLikelyLua(file)
  };
  let nodes = 0;
  const gapKeys = new Set<string>();
  const gap = (reason: string, node?: any): void => {
    if (gapKeys.has(reason)) return;
    if (result.gaps.length >= MAX_SCOPE_GAPS) { result.truncated = true; return; }
    gapKeys.add(reason);
    // Retain positions only; do not keep an AST subtree alive through gap evidence.
    result.gaps.push({ reason, node: node?.loc ? { loc: node.loc } : undefined });
  };
  const event = (kind: LuaGlobalEvent['kind'], name: string, node: any, context: LuaFactContext,
    value?: LuaGlobalEvent['value'], guarded = false, boundary?: LuaGlobalEvent['boundary']): void => {
    if (result.events.length >= MAX_SCOPE_FACTS) { result.truncated = true; return; }
    result.events.push({ kind, name, node: { loc: node?.loc }, phase: context.phase,
      conditional: context.conditional, protected: context.protected,
      guarded: guarded || context.guards.has(name), authority: context.authority, value, boundary });
  };
  const environmentAlias = (node: any): boolean => node?.type === 'Identifier' && node.isLocal === false
    && ['_G', '_ENV', 'package', 'getfenv'].includes(node.name);
  const environmentBoundary = (node: any, context: LuaFactContext, reason: string): void => {
    event('boundary', '', node, context, undefined, false, 'environment');
    gap(reason, node);
  };
  const truth = (node: any): boolean | undefined => {
    if (node?.type === 'NilLiteral') return false;
    if (node?.type === 'BooleanLiteral') return node.value;
    if (['NumericLiteral', 'StringLiteral', 'TableConstructorExpression', 'FunctionDeclaration'].includes(node?.type)) return true;
    return undefined;
  };
  const nonNilValue = (node: any, name: string): LuaGlobalEvent['value'] => {
    if (!node || node.type === 'NilLiteral') return 'nil';
    const literal = (value: any): boolean => ['NumericLiteral', 'StringLiteral', 'BooleanLiteral', 'TableConstructorExpression', 'FunctionDeclaration'].includes(value?.type);
    if (literal(node)) return 'non-nil';
    if (node.type === 'LogicalExpression' && node.operator === 'or' && node.left?.type === 'Identifier'
      && node.left.name === name && node.left.isLocal === false && literal(node.right)) return 'non-nil';
    return 'unknown';
  };
  const addGuard = (context: LuaFactContext, node: any): LuaFactContext => {
    if (node?.type !== 'Identifier' || node.isLocal !== false) return context;
    return { ...context, guards: new Set([...context.guards, node.name]) };
  };
  const legacyMetadata = (node: any): void => {
    if (node.type === 'AssignmentStatement') for (const variable of node.variables || []) {
      const legacy = globalNameFromExpression(variable);
      if (legacy) result.legacyDefinitions.add(legacy);
    }
    if (node.type === 'FunctionDeclaration' && !node.isLocal && node.identifier) {
      const legacy = globalNameFromExpression(node.identifier);
      if (legacy) result.legacyDefinitions.add(legacy);
    }
    const callName = callNameFromAst(node);
    if (callName && X4_UI_MODELED_CALL_NAMES.has(callName)) result.uiLikely = true;
  };
  // Unreachable nodes still carry the pre-existing lexical compatibility and
  // UI eligibility facts, but cannot provide ordered runtime facts.
  const legacyOnly = (node: any, depth: number): void => {
    if (!node || typeof node !== 'object') return;
    if (++nodes > MAX_SCOPE_NODES || depth > MAX_SCOPE_DEPTH) { result.truncated = true; return; }
    legacyMetadata(node);
    for (const [key, child] of Object.entries(node)) {
      if (['loc', 'range', 'comments', 'tokens', 'globals'].includes(key)) continue;
      if (Array.isArray(child)) for (const item of child) legacyOnly(item, depth + 1);
      else if (child && typeof child === 'object') legacyOnly(child, depth + 1);
    }
  };
  const statements = (body: any[], context: LuaFactContext, depth: number): boolean => {
    let mayExit = false;
    for (const node of body || []) {
      if (mayExit) gap('A possible chunk exit makes subsequent load-time availability conditional.', node);
      mayExit = visit(node, mayExit ? { ...context, conditional: true } : context, depth + 1) || mayExit;
      if (nodes > MAX_SCOPE_NODES || depth > MAX_SCOPE_DEPTH) break;
    }
    return mayExit;
  };
  const functionBody = (node: any, context: LuaFactContext, depth: number): void => {
    if ((node.parameters || []).some((parameter: any) => parameter.name === '_ENV')) {
      environmentBoundary(node, context, 'A function parameter replaces _ENV within its body, so bare global providers there are unverified.');
    }
    statements(node.body || [], context, depth + 1);
  };
  const visit = (node: any, context: LuaFactContext, depth: number, existenceTest = false): boolean => {
    if (!node || typeof node !== 'object') return false;
    if (++nodes > MAX_SCOPE_NODES || depth > MAX_SCOPE_DEPTH) { result.truncated = true; return false; }
    legacyMetadata(node);
    const nested = (child: any, next = context, test = false): boolean => visit(child, next, depth + 1, test);
    const conditional = { ...context, conditional: true };
    switch (node.type) {
      case 'Chunk': return statements(node.body, context, depth);
      case 'Identifier':
        if (node.isLocal === false) event('read', node.name, node, context, undefined, existenceTest);
        if (node.name === '_ENV') gap('An explicit Lua environment reference is not resolved.', node);
        if (environmentAlias(node)) gap('An environment value may be aliased and its global effects are unverified.', node);
        return false;
      case 'AssignmentStatement': {
        for (const init of node.init || []) nested(init);
        for (const variable of node.variables || []) if (variable.type !== 'Identifier') nested(variable);
        if ((node.init || []).some(environmentAlias)) {
          environmentBoundary(node, context, 'An environment alias assignment may allow writes through another name.');
        }
        (node.variables || []).forEach((variable: any, index: number) => {
          if (environmentMutationTarget(variable)) {
            environmentBoundary(variable, context, 'Global environment or package mutation prevents complete source-only availability proof.');
          }
          if (variable.type === 'Identifier' && variable.isLocal === false) {
            const init = node.init?.[index];
            const tail = node.init?.[node.init.length - 1];
            const hasMultiValueTail = tail?.type === 'VarargLiteral' || /CallExpression$/.test(tail?.type || '');
            const value = !init && hasMultiValueTail ? 'unknown' : nonNilValue(init, variable.name);
            event('write', variable.name, variable, context, value);
            if (context.phase !== 'load' || context.conditional || value === 'unknown') gap('Conditional, deferred or unknown-value global writes are not unconditional providers.', variable);
          }
        });
        return false;
      }
      case 'LocalStatement':
        for (const init of node.init || []) nested(init);
        if ((node.variables || []).some((variable: any) => variable.name === '_ENV')) {
          environmentBoundary(node, context, 'A lexical _ENV binding changes global lookup and is not resolved.');
        } else if ((node.init || []).some(environmentAlias)) {
          environmentBoundary(node, context, 'An environment alias assignment may allow writes through another name.');
        }
        return false;
      case 'FunctionDeclaration': {
        if (node.identifier?.type === 'Identifier' && node.identifier.isLocal === false && !node.isLocal) {
          event('write', node.identifier.name, node.identifier, context, 'non-nil');
          if (context.phase !== 'load' || context.conditional) gap('Conditional or deferred function definitions are not unconditional providers.', node.identifier);
        } else if (node.identifier && node.identifier.type !== 'Identifier') nested(node.identifier);
        if (environmentMutationTarget(node.identifier) || (node.isLocal && node.identifier?.name === '_ENV'))
          environmentBoundary(node, context, 'Global environment or package mutation prevents complete source-only availability proof.');
        functionBody(node, { ...context, phase: 'deferred', protected: false, authority: undefined, guards: new Set() }, depth);
        return false;
      }
      case 'CallStatement': nested(node.expression); return false;
      case 'CallExpression':
      case 'StringCallExpression':
      case 'TableCallExpression': {
        const rawArguments = node.arguments ?? node.argument;
        const args = Array.isArray(rawArguments) ? rawArguments : rawArguments ? [rawArguments] : [];
        const directName = node.base?.type === 'Identifier' && node.base.isLocal === false ? node.base.name : undefined;
        if (node.base?.type === 'FunctionDeclaration' && !node.base.identifier) {
          for (const argument of args) nested(argument);
          functionBody(node.base, context, depth);
          return false;
        }
        nested(node.base);
        const protectedCall = directName === 'pcall';
        const exactProtectedClosure = protectedCall && args[0]?.type === 'FunctionDeclaration' && !args[0].identifier;
        const callbacks: { body: any; context: LuaFactContext }[] = [];
        for (let index = 0; index < args.length; index += 1) {
          const argument = args[index];
          if (argument.type === 'FunctionDeclaration' && !argument.identifier) {
            if (protectedCall && index === 0) callbacks.push({ body: argument,
              context: { ...context, conditional: true, protected: true, authority: 'pcall' } });
            else {
              gap('A passed callback may run immediately or later; its invocation time is not expanded.', argument);
              callbacks.push({ body: argument, context: { ...context, phase: 'unknown', guards: new Set() } });
            }
          } else if (index === 0 && argument.type === 'Identifier' && protectedCall) {
            nested(argument, { ...context, protected: true, authority: 'pcall' });
          } else if (index === 0 && argument.type === 'Identifier' && directName === 'type' && args.length === 1) {
            nested(argument, { ...context, authority: 'type' }, true);
          } else nested(argument);
        }
        // Every argument expression is evaluated before the callee can invoke
        // any closure, including pcall's first argument.
        for (const callback of callbacks) functionBody(callback.body, callback.context, depth);
        const literalFfi = directName === 'require' && args.length === 1 && args[0]?.type === 'StringLiteral'
          && /^(["'])ffi\1$/.test(args[0].raw || '');
        const plainTableMutation = ['rawset', 'setmetatable'].includes(directName || '') && args[0]?.type === 'TableConstructorExpression';
        if (directName && ['require', 'dofile', 'load', 'loadfile', 'loadstring', 'getfenv', 'setfenv', 'module', 'rawset', 'setmetatable', 'AddGlobalAccess', 'MakeGlobalAvailable', 'SetEGOGlobals'].includes(directName) && !literalFfi && !plainTableMutation) {
          environmentBoundary(node, context, 'Dynamic loading, exported globals or environment mutation is not resolved.');
        } else if (!directName || directName === 'xpcall' || (protectedCall && !exactProtectedClosure)
          || (!LUA_STANDARD_GLOBALS.has(directName) && !X4_ENGINE_GLOBALS.has(directName))) {
          event('boundary', '', node, context, undefined, false, 'opaque');
          gap('A named or indirect callable is not expanded; any globals it changes or reads remain unproven.', node);
        } else {
          // A seeded callee only becomes opaque here if its authority is rebound in the supplied scope.
          event('boundary', directName, node, context, undefined, false, 'opaque');
        }
        if (directName === 'rawget') gap('A raw table lookup may read a dynamic environment and is not resolved as a bare global.', node);
        return false;
      }
      case 'MemberExpression':
      case 'IndexExpression':
        if (environmentMutationTarget(node)) gap('A global-environment table lookup is not resolved as a bare global.', node);
        nested(node.base);
        if (node.type === 'IndexExpression') nested(node.index);
        return false;
      case 'LogicalExpression': {
        const leftTruth = truth(node.left);
        nested(node.left, context, node.left?.type === 'Identifier');
        if ((node.operator === 'and' && leftTruth === false) || (node.operator === 'or' && leftTruth === true)) {
          legacyOnly(node.right, depth + 1);
          return false;
        }
        const next = leftTruth === undefined ? conditional : context;
        nested(node.right, node.operator === 'and' ? addGuard(next, node.left) : next);
        return false;
      }
      case 'UnaryExpression': nested(node.argument, context, node.operator === 'not' && node.argument?.type === 'Identifier'); return false;
      case 'BinaryExpression': {
        const equalityTest = ['==', '~='].includes(node.operator)
          && (node.left?.type === 'NilLiteral' || node.right?.type === 'NilLiteral');
        nested(node.left, context, equalityTest && node.left?.type === 'Identifier');
        nested(node.right, context, equalityTest && node.right?.type === 'Identifier');
        return false;
      }
      case 'IfStatement': {
        let priorUnknown = false;
        let priorTrue = false;
        let mayExit = false;
        for (const clause of node.clauses || []) {
          if (priorTrue) { legacyOnly(clause, depth + 1); continue; }
          if (clause.condition) nested(clause.condition, priorUnknown ? conditional : context, clause.condition.type === 'Identifier');
          const known = clause.condition ? truth(clause.condition) : true;
          if (known === false) {
            for (const statement of clause.body || []) legacyOnly(statement, depth + 1);
            continue;
          }
          const branch = priorUnknown || known === undefined ? conditional : context;
          mayExit = statements(clause.body, addGuard(branch, clause.condition), depth + 1) || mayExit;
          if (known === true) priorTrue = true;
          else priorUnknown = true;
        }
        return mayExit;
      }
      case 'DoStatement': return statements(node.body, context, depth);
      case 'WhileStatement': nested(node.condition, context, node.condition?.type === 'Identifier'); break;
      case 'RepeatStatement': break;
      case 'ForNumericStatement': nested(node.start); nested(node.end); nested(node.step); break;
      case 'ForGenericStatement': for (const iterator of node.iterators || []) nested(iterator); break;
      case 'ReturnStatement': for (const argument of node.arguments || []) nested(argument); return true;
      case 'GotoStatement': gap('Goto control flow is not expanded.', node); return true;
      case 'LabelStatement': gap('Label control flow is not expanded.', node); return false;
      case 'BreakStatement': return false;
      case 'TableConstructorExpression': for (const field of node.fields || []) nested(field); return false;
      case 'TableKeyString': nested(node.value); return false;
      case 'TableKey': nested(node.key); nested(node.value); return false;
      case 'TableValue': nested(node.value); return false;
      case 'StringLiteral': case 'NumericLiteral': case 'BooleanLiteral': case 'NilLiteral': case 'VarargLiteral': return false;
      default:
        gap('An unsupported AST construct prevents complete global execution-scope proof.', node);
        for (const [key, child] of Object.entries(node)) {
          if (['loc', 'range', 'comments', 'tokens', 'globals'].includes(key)) continue;
          if (Array.isArray(child)) for (const item of child) nested(item, { ...conditional, phase: 'unknown' });
          else if (child && typeof child === 'object') nested(child, { ...conditional, phase: 'unknown' });
        }
        return false;
    }
    gap('Loop execution and its global effects are not expanded.', node);
    const mayExit = statements(node.body, node.type === 'WhileStatement' ? addGuard(conditional, node.condition) : conditional, depth + 1);
    if (node.type === 'RepeatStatement') nested(node.condition, conditional, node.condition?.type === 'Identifier');
    return mayExit;
  };
  visit(ast, { phase: 'load', conditional: false, protected: false, guards: new Set() }, 0);
  if (result.truncated) {
    gap('Lua runtime-scope analysis reached a depth, node, fact or evidence limit; unseen source is unverified.');
    // An unseen UI call cannot suppress the existing independent X4 UI checks.
    if (/\.lua$/i.test(file.rel)) result.uiLikely = true;
  }
  return result;
}

function analyzeRuntimeScopes(files: LuaFileInput[], manifestOnly: readonly LuaManifestScopeInput[],
  parsed: Map<LuaFileInput, ParsedLuaFacts>, gameGlobalFiles: Set<LuaFileInput>, seed: Set<string>, findings: LuaStaticFinding[]): LuaRuntimeScopeResult {
  const gaps: LuaRuntimeScopeGap[] = [];
  const gapsByFile = new Map<LuaScopeSource, LuaRuntimeScopeGap[]>();
  const gapKeys = new Map<LuaScopeSource, Set<string>>();
  const findingKeys = new Map<LuaFileInput, Set<string>>();
  const findingCounts = new Map<LuaFileInput, { info: number; warning: number }>();
  const globalFiles = new Set<LuaScopeSource>();
  let truncated = false;
  let knownInventories = 0;
  let knownGlobalFiles = 0;
  let unavailableInventories = 0;
  let registrationFailure = false;
  let orderFailure = false;
  const addGap = (file: LuaScopeSource, check: LuaRuntimeScopeGap['check'], reason: string, node?: any): void => {
    const keys = gapKeys.get(file) || new Set<string>();
    gapKeys.set(file, keys);
    const key = `${check}|${reason}`;
    if (keys.has(key)) return;
    if (keys.size >= MAX_SCOPE_GAPS - 1) {
      truncated = true;
      const limit = 'Lua runtime-scope evidence was truncated; additional source boundaries remain unverified.';
      if (!keys.has(limit)) {
        keys.add(limit);
        const limitGap: LuaRuntimeScopeGap = { check: 'lua.globals-order', rel: file.rel, sourcePath: file.sourcePath, reason: limit };
        gaps.push(limitGap);
        const fileGaps = gapsByFile.get(file) || [];
        gapsByFile.set(file, fileGaps);
        fileGaps.push(limitGap);
      }
      return;
    }
    keys.add(key);
    const sourceGap: LuaRuntimeScopeGap = { check, rel: file.rel, sourcePath: file.sourcePath, reason,
      ...(node?.loc ? { line: node.loc.start.line, column: node.loc.start.column } : {}) };
    gaps.push(sourceGap);
    const fileGaps = gapsByFile.get(file) || [];
    gapsByFile.set(file, fileGaps);
    fileGaps.push(sourceGap);
  };
  const finding = (file: LuaFileInput, name: string, node: any, provider?: { file: LuaFileInput; event: LuaGlobalEvent }): void => {
    const keys = findingKeys.get(file) || new Set<string>();
    findingKeys.set(file, keys);
    const code = provider ? GLOBAL_BEFORE_DEFINITION : 'lua.undefined_global';
    const severity = provider ? 'warning' : 'info';
    const key = `${code}|${name}`;
    if (keys.has(key)) return;
    if (provider) orderFailure = true;
    const counts = findingCounts.get(file) || { info: 0, warning: 0 };
    findingCounts.set(file, counts);
    if (counts[severity] >= 8) {
      addGap(file, 'lua.globals-order', 'Global advisory output was bounded; additional source references remain unverified.', node);
      truncated = true;
      return;
    }
    counts[severity] += 1;
    keys.add(key);
    if (!provider) addGap(file, 'lua.globals-order', 'An unseeded global reference has no supported definition in this source scope.', node);
    findings.push({ layer: 'baseline', severity, code, rel: file.rel,
      message: provider
        ? `${file.rel} reads global "${name}" at load time before its listed provider in ${provider.file.rel}:${provider.event.node.loc?.start?.line || 1}. This is bounded registered-source order, not proof of a runtime crash or external provider absence.`
        : `${file.rel} references global "${name}" that is not in the deterministic Lua/X4 seed or a supported definition in this source scope. Dynamic loading and unlisted providers are not inferred.`,
      symbol: name, line: node?.loc?.start?.line, column: node?.loc?.start?.column,
      source: file.source, sourcePath: file.sourcePath });
  };
  const ownFileHygiene = (file: LuaFileInput): void => {
    if (!gameGlobalFiles.has(file)) return;
    globalFiles.add(file);
    const facts = parsed.get(file)!;
    if (facts.truncated) {
      truncated = true;
      addGap(file, 'lua.globals-order', 'Lua runtime-scope analysis reached a limit; additional source is unverified.');
    }
    const own = new Set(facts.events.filter(event => event.kind === 'write').map(event => event.name));
    for (const reference of facts.globals) {
      if (!seed.has(reference.name) && !own.has(reference.name)) finding(file, reference.name, reference);
    }
  };
  const inventories = new Map<X4MenuLuaRuntimeInventory, LuaFileInput[]>();
  const actualPathsByFolder = new Map<string, Map<string, number>>();
  for (const file of files) {
    const path = normalizeX4UiSourcePath(file.rel).key;
    if (path) {
      const counts = actualPathsByFolder.get(file.extension.folder) || new Map<string, number>();
      actualPathsByFolder.set(file.extension.folder, counts);
      counts.set(path, (counts.get(path) || 0) + 1);
    }
    const inventory = file.extension.runtimeInventory;
    if (!inventory) {
      if (gameGlobalFiles.has(file)) {
        globalFiles.add(file);
        unavailableInventories += 1;
        addGap(file, 'lua.registrations', 'No runtime inventory was supplied; only context-free Lua hygiene was checked.');
        if (parsed.get(file)!.truncated) {
          truncated = true;
          addGap(file, 'lua.globals-order', 'Lua runtime-scope analysis reached a limit; additional source is unverified.');
        }
      }
      continue;
    }
    const group = inventories.get(inventory) || [];
    inventories.set(inventory, group);
    group.push(file);
  }
  for (const [inventory, group] of inventories) {
    const anchor = group[0];
    const filesByPath = new Map<string, LuaFileInput>();
    for (const file of group) {
      const key = normalizeX4UiSourcePath(file.rel).key;
      if (key && !filesByPath.has(key)) filesByPath.set(key, file);
    }
    for (const diagnostic of inventory.diagnostics) {
      const source = diagnostic.path ? filesByPath.get(diagnostic.path) : undefined;
      addGap(source || anchor, 'lua.registrations', diagnostic.message);
      if (inventory.manifestStatus === 'known' && diagnostic.severity === 'error') registrationFailure = true;
    }
    const rows = inventory.registrations;
    const matches = (row: typeof rows[number]): boolean => {
      const file = row.sourceIndex === undefined ? undefined : group[row.sourceIndex];
      return !!file && file.extension.folder === anchor.extension.folder
        && !!row.lookupKey && actualPathsByFolder.get(file.extension.folder)?.get(row.lookupKey) === 1
        && normalizeX4UiSourcePath(file.rel).key === row.lookupKey
        && (row.sourcePath === undefined || row.sourcePath === file.sourcePath);
    };
    const mismatch = group.some(file => file.extension.folder !== anchor.extension.folder)
      || rows.some(row => row.resolution === 'resolved' && !matches(row));
    if (inventory.manifestStatus !== 'known' || mismatch) {
      unavailableInventories += 1;
      for (const file of group) {
        globalFiles.add(file);
        if (gameGlobalFiles.has(file)) addGap(file, 'lua.registrations', mismatch
          ? 'Registration source index, unique exact path or provenance does not match this physical extension inventory.'
          : `Runtime manifest is ${inventory.manifestStatus}; cross-file providers and load order are unavailable.`);
        ownFileHygiene(file);
      }
      continue;
    }
    knownInventories += 1;
    const candidates = new Set<string>();
    const rebound = new Set<string>();
    const environments = new Map<number, typeof rows[number][]>();
    for (const row of rows) {
      const environment = environments.get(row.environmentIndex) || [];
      environments.set(row.environmentIndex, environment);
      environment.push(row);
      if (row.resolution !== 'resolved' || !matches(row)) continue;
      const file = group[row.sourceIndex!];
      globalFiles.add(file);
      if (!parsed.get(file)!.error) knownGlobalFiles += 1;
      for (const event of parsed.get(file)!.events) if (event.kind === 'write') {
        if (event.value !== 'nil') candidates.add(event.name);
        rebound.add(event.name);
      }
    }
    for (const environment of environments.values()) {
      const ordered: { file: LuaFileInput; event: LuaGlobalEvent }[] = [];
      let environmentUnknown = environment.some(row => row.resolution !== 'resolved');
      if (environmentUnknown && !environment.some(row => row.resolution === 'resolved' && matches(row))) {
        globalFiles.add(anchor);
        addGap(anchor, 'lua.globals-order', 'No resolved Lua was supplied for a registered menu environment; its global scope and order are unavailable.');
      }
      for (const row of environment) {
        if (row.resolution !== 'resolved' || !matches(row)) continue;
        const file = group[row.sourceIndex!];
        const facts = parsed.get(file)!;
        for (const sourceGap of facts.gaps) addGap(file, 'lua.globals-order', sourceGap.reason, sourceGap.node);
        if (facts.error) {
          environmentUnknown = true;
          addGap(file, 'lua.globals-order', 'Lua source did not parse; its global execution scope is unavailable.');
        }
        if (facts.truncated) {
          truncated = true;
          environmentUnknown = true;
          addGap(file, 'lua.globals-order', 'Lua runtime-scope analysis reached a depth, node, fact or evidence limit; unseen source is unverified.');
        }
        if (environments.size > 1) addGap(file, 'lua.registrations', 'Repeated menu environments have separate source-order boundaries; cross-environment execution is unproven.');
        if (environmentUnknown) addGap(file, 'lua.registrations', 'Unresolved registered sources may affect this menu environment; complete provider availability is unproven.');
        for (const event of facts.events) ordered.push({ file, event });
      }
      type Provider = typeof ordered[number];
      const unconditionalSourceWrite = (event: LuaGlobalEvent): boolean => event.phase === 'load' && !event.conditional
        && !event.protected && !(event.authority && rebound.has(event.authority)) && event.value === 'non-nil';
      const future = new Map<string, { providers: Provider[]; index: number }>();
      let sourceFile: LuaFileInput | undefined;
      let sourceEnvironmentKnown = true;
      for (const item of ordered) {
        const { file, event } = item;
        if (file !== sourceFile) {
          sourceFile = file;
          sourceEnvironmentKnown = true;
        }
        if (event.kind === 'boundary' && event.phase === 'load' && event.boundary === 'environment') sourceEnvironmentKnown = false;
        // These are source locations for ordering, not available runtime values.
        // Opaque call effects occur only after their callee and argument reads.
        if (!sourceEnvironmentKnown || event.kind !== 'write' || !unconditionalSourceWrite(event)) continue;
        const queue = future.get(event.name) || { providers: [], index: 0 };
        future.set(event.name, queue);
        queue.providers.push(item);
      }
      const available = new Map<string, 'seed' | Provider>();
      const maybeAvailable = new Set<string>();
      for (const name of seed) available.set(name, 'seed');
      for (const item of ordered) {
        const { file, event } = item;
        if (event.kind === 'boundary') {
          if (event.phase === 'load' && (!event.name || rebound.has(event.name))) {
            available.clear();
            maybeAvailable.clear();
            environmentUnknown = true;
            if (event.name) addGap(file, 'lua.globals-order', 'A rebound seeded callable may have opaque global effects.', event.node);
          }
          continue;
        }
        if (event.kind === 'write') {
          const queue = future.get(event.name);
          if (queue && queue.providers[queue.index] === item) queue.index += 1;
          if (!environmentUnknown && unconditionalSourceWrite(event)) {
            available.set(event.name, item);
            maybeAvailable.delete(event.name);
          } else if (event.phase === 'load' && !event.conditional && !event.protected && !event.authority) {
            available.delete(event.name);
            if (event.value === 'nil') maybeAvailable.delete(event.name);
            else maybeAvailable.add(event.name);
          } else if (event.value !== 'nil' || available.has(event.name)) {
            maybeAvailable.add(event.name);
            if (event.value !== 'non-nil') available.delete(event.name);
          }
          continue;
        }
        const present = available.get(event.name);
        const authorityUnknown = event.authority && rebound.has(event.authority);
        const phase = authorityUnknown ? 'unknown' : event.phase;
        if (authorityUnknown) addGap(file, 'lua.globals-order', 'A modeled guard or protected-call authority was rebound; its execution behavior is unproven.', event.node);
        if (present === 'seed' && !authorityUnknown) continue;
        if (phase !== 'load' || event.conditional || event.guarded || event.protected) {
          addGap(file, 'lua.globals-order', 'Guarded, protected, conditional or deferred global availability is not an unconditional load-time proof.', event.node);
          if (!event.guarded && !event.protected && !present && !candidates.has(event.name) && !seed.has(event.name)) finding(file, event.name, event.node);
          continue;
        }
        if (present) continue;
        if (seed.has(event.name)) {
          addGap(file, 'lua.globals-order', environmentUnknown
            ? 'Dynamic or incomplete environment state prevents a complete load-order conclusion.'
            : 'A Lua/X4 seed has been rebound; its current availability is not established.', event.node);
          continue;
        }
        const next = future.get(event.name);
        const provider = next?.providers[next.index];
        if (!environmentUnknown && !maybeAvailable.has(event.name) && provider) finding(file, event.name, event.node, provider);
        else if (!candidates.has(event.name)) finding(file, event.name, event.node);
        else addGap(file, 'lua.globals-order', 'A possible global provider is conditional, deferred, rebound or in a different menu environment.', event.node);
        if (environmentUnknown) addGap(file, 'lua.globals-order', 'Dynamic or incomplete environment state prevents a complete load-order conclusion.', event.node);
      }
    }
  }
  // A real manifest can exist without any readable Lua. Attribute its
  // registration evidence to the manifest itself, never to a fabricated Lua file.
  for (const manifest of manifestOnly) {
    const inventory = manifest.extension.runtimeInventory;
    for (const diagnostic of inventory.diagnostics) {
      const reason = diagnostic.path ? `${diagnostic.message} Target ${diagnostic.path}.` : diagnostic.message;
      addGap(manifest, 'lua.registrations', reason);
      if (inventory.manifestStatus === 'known' && diagnostic.severity === 'error') registrationFailure = true;
    }
    if (inventory.manifestStatus === 'known') knownInventories += 1;
    else {
      unavailableInventories += 1;
      addGap(manifest, 'lua.registrations', `Runtime manifest is ${inventory.manifestStatus}; registered-source availability is unproven.`);
    }
    if (inventory.manifestStatus !== 'known' || inventory.registrations.length) {
      globalFiles.add(manifest);
      addGap(manifest, 'lua.globals-order', 'No readable Lua was supplied for this manifest; registered global scope and order are unavailable.');
    }
  }
  for (const file of [...files, ...manifestOnly]) {
    const fileGaps = gapsByFile.get(file) || [];
    if (!fileGaps.length) continue;
    const first = fileGaps[0];
    findings.push({ layer: 'baseline', severity: 'info', code: SCOPE_UNVERIFIED, rel: file.rel,
      message: `${file.rel}: Lua runtime scope is not fully verified (${fileGaps.length} retained boundary reason(s)). ${first.reason} Bounded source analysis does not prove complete runtime loading, callback scheduling or UI behavior.`,
      line: first.line, column: first.column, source: file.source, sourcePath: file.sourcePath });
  }
  const references = (selected: Iterable<LuaScopeSource>) => [...selected].map(file => ({ rel: file.rel, sourcePath: file.sourcePath }));
  const registrationGaps = gaps.filter(gap => gap.check === 'lua.registrations').length;
  const globalGaps = gaps.filter(gap => gap.check === 'lua.globals-order').length;
  const runtimeFiles = [...files.filter(file => file.extension.runtimeInventory || gameGlobalFiles.has(file)), ...manifestOnly];
  const boundary = 'Bounded registered-source facts only; no complete dependency availability, invocation schedule, arbitrary Lua behavior, UI rendering or game acceptance is claimed.';
  return { gaps, truncated, stages: [
    { check: 'lua.syntax', status: !files.length ? 'not-applicable' : files.some(file => parsed.get(file)!.error) ? 'fail' : 'pass', files: references(files), gapCount: 0,
      evidenceBoundary: 'Syntax parsed with luaparse Lua 5.2; LuaJIT20 grammar parity and execution are separate.' },
    { check: 'lua.registrations', status: !runtimeFiles.length ? 'not-applicable' : registrationFailure ? 'fail'
      : !knownInventories && unavailableInventories ? 'unavailable' : registrationGaps ? 'partial' : 'pass',
      files: references(runtimeFiles), gapCount: registrationGaps, evidenceBoundary: boundary },
    { check: 'lua.globals-order', status: !globalFiles.size ? 'not-applicable' : orderFailure ? 'fail'
      : !knownGlobalFiles ? 'unavailable' : globalGaps || registrationGaps ? 'partial' : 'pass',
      files: references(globalFiles), gapCount: globalGaps, evidenceBoundary: boundary }
  ] };
}

function callNameFromAst(node: any): string | undefined {
  if (!node || node.type !== 'CallExpression') return undefined;
  const base = node.base;
  if (!base) return undefined;
  if (base.type === 'Identifier') return base.name;
  if (base.type === 'MemberExpression') return base.identifier?.name;
  if (base.type === 'IndexExpression' && base.index?.type === 'StringLiteral') return base.index.value;
  return undefined;
}

function isUiLikelyLua(file: LuaFileInput): boolean {
  const rel = file.rel.replace(/\\/g, '/').toLowerCase();
  if (!rel.endsWith('.lua')) return false;
  return rel.startsWith('ui/') || rel.startsWith('subst_lua/');
}

function fallbackUiLocation(file: LuaFileInput): X4UiSourceLocation {
  const lines = file.text.split(/\r?\n/);
  return {
    file: file.rel,
    sourcePath: file.sourcePath,
    start: { line: 1, column: 0, offset: 0 },
    end: {
      line: lines.length,
      column: lines[lines.length - 1]?.length || 0,
      offset: file.text.length
    }
  };
}

function x4UiFindingLocation(file: LuaFileInput, finding: X4UiLintFinding): X4UiSourceLocation {
  return finding.location || finding.source || fallbackUiLocation(file);
}

function x4UiSummaryLocation(file: LuaFileInput, result: X4UiLintResult, category?: string): X4UiSourceLocation {
  const gap = result.verificationGaps.find(item => !category || item.category === category);
  if (gap) return gap.location;
  const finding = result.findings.find(item => !category || item.category === category);
  return finding ? x4UiFindingLocation(file, finding) : fallbackUiLocation(file);
}

function x4UiFindingMessage(finding: X4UiLintFinding): string {
  return `${finding.message} Failure mode: ${finding.failureMode} Next action: ${finding.nextAction}`;
}

function makeX4UiFinding(
  file: LuaFileInput,
  code: string,
  severity: LuaStaticFinding['severity'],
  location: X4UiSourceLocation,
  message: string,
  cause: string,
  failureMode: string,
  evidenceBoundary: string,
  nextAction: string
): LuaStaticFinding {
  return {
    layer: 'x4',
    severity,
    code,
    rel: file.rel,
    message,
    line: location.start.line,
    column: location.start.column,
    source: file.source,
    sourcePath: file.sourcePath,
    cause,
    failureMode,
    evidenceBoundary,
    nextAction
  };
}

function projectX4UiResult(file: LuaFileInput, result: X4UiLintResult): LuaStaticFinding[] {
  const projected: LuaStaticFinding[] = [];
  const seen = new Set<string>();
  const add = (finding: LuaStaticFinding): void => {
    const key = [finding.code, finding.severity, finding.rel, finding.line || 0, finding.column || 0].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    projected.push(finding);
  };

  for (const finding of result.findings) {
    if (finding.severity !== 'error' && finding.severity !== 'warning') continue;
    const location = x4UiFindingLocation(file, finding);
    add(makeX4UiFinding(
      file,
      finding.code,
      finding.severity,
      location,
      x4UiFindingMessage(finding),
      finding.cause,
      finding.failureMode,
      finding.evidenceBoundary,
      finding.nextAction
    ));
  }

  if (!result.isStaticallyVerified) {
    const location = x4UiSummaryLocation(file, result);
    add(makeX4UiFinding(
      file,
      X4_UI_VERIFICATION_SUMMARY_CODE,
      'info',
      location,
      `${file.rel}: ${result.summary}. Detailed bounded X4 UI verification gaps remain in the structured per-file result. Failure mode: The complete static UI path is not proven safe; no in-game or render acceptance is claimed. Next action: Resolve the bounded static gap or verify this UI boundary in-game.`,
      `The X4 UI analysis reported ${result.verificationGapCount} bounded verification gap(s)${result.parsed ? '' : ' and did not complete parsing'}.`,
      'The complete static UI path is not proven safe; no in-game or render acceptance is claimed.',
      'Only source-located literal, resolved, non-truncated call-model facts are treated as proof.',
      'Resolve the bounded static gap or verify this UI boundary in-game.'
    ));
  }

  if (result.hasTruncatedEvidence || result.verificationGapsTruncated) {
    const location = x4UiSummaryLocation(file, result, 'truncated');
    add(makeX4UiFinding(
      file,
      X4_UI_TRUNCATION_CODE,
      'info',
      location,
      `${file.rel}: X4 UI verification evidence was truncated. Not statically verified. Detailed bounded gaps remain in the structured per-file result. Failure mode: Unseen bounded evidence may affect this result, so a clean static conclusion would be false. Next action: Reduce dynamic or unsupported UI evidence, then rerun analysis and verify the remaining boundary in-game.`,
      'The bounded X4 UI verification-gap list reached its cap.',
      'Unseen bounded evidence may affect this result, so a clean static conclusion would be false.',
      'The per-file result retains the bounded gap list and its truncation flag; it does not claim complete evidence.',
      'Reduce dynamic or unsupported UI evidence, then rerun analysis and verify the remaining boundary in-game.'
    ));
  }

  return projected;
}

function addX4UiResult(
  file: LuaFileInput,
  result: X4UiLintResult,
  results: LuaStaticX4UiFileResult[],
  summary: LuaStaticX4UiSummary,
  findings: LuaStaticFinding[]
): void {
  results.push({ rel: file.rel, source: file.source, sourcePath: file.sourcePath, result });
  summary.filesAnalyzed += 1;
  summary.errorCount += result.errorCount;
  summary.warningCount += result.warningCount;
  summary.verificationGapCount += result.verificationGapCount;
  if (result.hasErrors) summary.filesWithErrors += 1;
  if (result.hasWarnings) summary.filesWithWarnings += 1;
  if (result.status === 'clean') summary.cleanCount += 1;
  if (!result.isStaticallyVerified) summary.unverifiedCount += 1;
  if (result.hasTruncatedEvidence || result.verificationGapsTruncated) summary.truncatedCount += 1;
  findings.push(...projectX4UiResult(file, result));
}

// Hallucinated X4 UI functions: plausible-looking names that DO NOT exist in the engine, so any
// Lua calling them cannot run. Curated from the invented API LLMs (and the old UIBuilder template)
// emit. Kept conservative — only names confirmed not to be real X4 functions — to avoid false flags.
const FICTIONAL_UI_API = [
  'RegisterLayout', 'AddUITrigger', 'RemoveAllUITriggers', 'SignalCue', 'OpenUIFrame',
  'UpdateProgressBarValue', 'CreateCoroutine',
];

/**
 * X4 STANDALONE-MENU UI CONTRACT — the deterministic "schema" a custom menu's Lua MUST satisfy to
 * actually RENDER in-game. Every item was paid for in live debugging of the AI-Influence chat
 * window (which took hours to render). Encode it so the Forge validates UI elements against a
 * known-working configuration instead of building blind. The UIBuilder generates code to this
 * schema; analyzeLuaFiles() enforces the crisply-detectable items (see `ref` codes).
 *
 * Ground truth: SirNukes `simple_menu/Standalone_Menu.lua` + the live fix where `Helper` was nil at
 * file load, got cached, so registerMenu never ran and the frame never displayed.
 */
export const X4_STANDALONE_MENU_SCHEMA = {
  description: 'A custom standalone X4 menu renders only if its Lua satisfies all of these.',
  requires: [
    { id: 'name',       must: 'menu table has a unique `name` field (OpenMenu(name) matches menu.name)', enforced: 'lua.menu_never_opened (name+open)' },
    { id: 'onShowMenu', must: 'defines menu.onShowMenu — the engine calls it after OpenMenu',           enforced: 'lua.menu_never_opened' },
    { id: 'frame',      must: 'builds the frame via Helper.createFrameHandle(menu, ...) + frame:display()', enforced: 'lua.fictional_ui_api (no fake builders)' },
    { id: 'registered', must: 'inserts the menu into _G.Menus AND calls Helper.registerMenu(menu)',      enforced: 'doc (timing not statically enforced yet)' },
    { id: 'opened',     must: 'opened via OpenMenu(name, nil, nil, true) somewhere in the addon',        enforced: 'lua.menu_never_opened' },
    { id: 'lazyHelper', must: 'reads the global Helper LAZILY (rawget(_G,"Helper")) at use time — never caches the file-load value, which is nil', enforced: 'lua.helper_cached_at_load' },
  ],
  forbids: [
    { id: 'fictionalApi',       mustNot: 'call hallucinated UI functions (RegisterLayout, AddUITrigger, OpenUIFrame, ...)', enforced: 'lua.fictional_ui_api' },
    { id: 'helperCachedAtLoad', mustNot: '`local Helper = Helper` at file scope without a lazy refetch — Helper is nil at menu-file load, so registerMenu never runs and display() bails (the window never renders)', enforced: 'lua.helper_cached_at_load' },
  ],
} as const;

export function analyzeLuaFiles(files: LuaFileInput[], manifestOnly: readonly LuaManifestScopeInput[] = []): LuaStaticAnalysisResult {
  const normalizedFiles = files.map(normalizeLuaFile);
  const parsed = new Map<LuaFileInput, ParsedLuaFacts>();
  for (const file of normalizedFiles) {
    let ast: any;
    try { ast = parseLua(file.text); }
    catch (error) {
      parsed.set(file, { error, globals: [], legacyDefinitions: new Set(), events: [], gaps: [], truncated: false, uiLikely: isUiLikelyLua(file) });
      continue;
    }
    try { parsed.set(file, collectLuaFacts(file, ast)); }
    catch {
      // An internal analysis failure is unavailable coverage, never a syntax error.
      parsed.set(file, { globals: (ast.globals || []).map((node: any) => ({ name: node.name, loc: node.loc })),
        legacyDefinitions: new Set(), events: [], gaps: [{ reason: 'Lua runtime-scope analysis failed internally; source execution scope is unavailable.' }],
        truncated: true, uiLikely: isUiLikelyLua(file) });
    }
  }
  // Standalone host tools have their own globals. A registered tools file shares the game's namespace.
  const gameGlobalFiles = new Set(normalizedFiles.filter(file => {
    const key = normalizeX4UiSourcePath(file.rel).key ?? '';
    return !key.toLowerCase().startsWith('tools/') || file.extension.menuLuaPaths?.has(key);
  }));
  const seed = new Set([...LUA_STANDARD_GLOBALS, ...X4_ENGINE_GLOBALS]);
  // Preserve the context-free API's historical namespace convention. Explicit
  // runtime inventories never consume this flat compatibility allowlist.
  const allow = new Set(seed);
  for (const file of gameGlobalFiles) if (!file.extension.runtimeInventory) {
    for (const name of parsed.get(file)!.legacyDefinitions) allow.add(name);
  }
  const findings: LuaStaticFinding[] = [];
  const x4UiResults: LuaStaticX4UiFileResult[] = [];
  const x4UiSummary: LuaStaticX4UiSummary = {
    filesAnalyzed: 0,
    errorCount: 0,
    warningCount: 0,
    verificationGapCount: 0,
    filesWithErrors: 0,
    filesWithWarnings: 0,
    cleanCount: 0,
    unverifiedCount: 0,
    truncatedCount: 0
  };

  for (const file of normalizedFiles) {
    const relLower = file.rel.toLowerCase();
    const facts = parsed.get(file)!;
    if (facts.error) {
      const error = facts.error;
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
      if (isUiLikelyLua(file)) {
        const x4UiResult = analyzeX4UiFile({
          rel: file.rel,
          text: file.text,
          sourcePath: file.sourcePath
        });
        addX4UiResult(file, x4UiResult, x4UiResults, x4UiSummary, findings);
      }
      continue;
    }

    const seenGlobals = new Set<string>();
    for (const g of gameGlobalFiles.has(file) && !file.extension.runtimeInventory ? facts.globals : []) {
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

    if (relLower.endsWith('.lua')) {
      // Match against comment-stripped source so a warning COMMENT mentioning these patterns
      // doesn't trip the rule (the false-positive that flagged a clean aic_uix.lua).
      const codeText = stripLuaComments(file.text);
      // The provider extension itself (djfhe_http) legitimately requires its own client from its
      // internal modules (e.g. djfhe/http/request.lua) — that is NOT the consumer hazard. Exempt
      // it by OWNING extension id (not by path), so a consumer that wrongly vendors djfhe still flags.
      const ownerId = (file.extension?.id || file.extension?.folder || '').toLowerCase();
      const isDjfheProvider = ownerId === 'djfhe_http';
      // djfhe_http hazard: requiring the INTERNAL client module poisons djfhe's own module
      // cache and breaks its 50ms update loop FOREVER ("loop or previous error loading module
      // 'djfhe.http.client'"). Consumers must require only "djfhe.http.request" and drive it
      // with the fluent Request.new(METHOD):setUrl():setBody():send(callback) API.
      if (!isDjfheProvider && /require\s*\(\s*['"]djfhe\.http\.client['"]\s*\)/.test(codeText)) {
        findings.push({
          layer: 'x4', severity: 'error', code: 'lua.djfhe_internal_require', rel: file.rel,
          message: `${file.rel} requires djfhe's INTERNAL module "djfhe.http.client". This poisons djfhe's module cache and breaks its update loop every tick. Require only "djfhe.http.request" and use Request.new(M):setUrl():setBody():send(cb).`,
          symbol: 'djfhe.http.client', source: file.source, sourcePath: file.sourcePath
        });
      }
      // A broad "extensions/?.lua" on package.path can shadow or create require-loops for
      // OTHER extensions' modules (it contributed to the djfhe cache poisoning above). Add
      // only the specific dependency path, e.g. "extensions/<dep>/lua/?.lua".
      if (/extensions\/\?\.lua/.test(codeText)) {
        findings.push({
          layer: 'x4', severity: 'warning', code: 'lua.broad_package_path', rel: file.rel,
          message: `${file.rel} adds a broad "extensions/?.lua" to package.path, which can shadow or create require-loops for other extensions. Add only the specific dependency path (e.g. "extensions/<dep>/lua/?.lua").`,
          source: file.source, sourcePath: file.sourcePath
        });
      }
      // UI validator (1/2): hallucinated X4 UI API that cannot run.
      for (const fn of FICTIONAL_UI_API) {
        if (new RegExp('\\b' + fn + '\\s*\\(').test(codeText)) {
          findings.push({
            layer: 'x4', severity: 'error', code: 'lua.fictional_ui_api', rel: file.rel,
            message: `${file.rel} calls "${fn}(...)", which is not a real X4 function — it cannot run. Use the verified menu API: Helper.createFrameHandle, OpenMenu(name), AddUITriggeredEvent, frame:display().`,
            symbol: fn, source: file.source, sourcePath: file.sourcePath
          });
        }
      }
    }

    if (facts.uiLikely) {
      const x4UiResult = analyzeX4UiFile({
        rel: file.rel,
        text: file.text,
        sourcePath: file.sourcePath
      });
      addX4UiResult(file, x4UiResult, x4UiResults, x4UiSummary, findings);
    }
  }

  const runtimeScope = analyzeRuntimeScopes(normalizedFiles, manifestOnly, parsed, gameGlobalFiles, seed, findings);

  // UI validator (2/2) — validate against the KNOWN-WORKING menu configuration. A standalone X4
  // window renders ONLY when opened by the engine function OpenMenu(name), which then calls
  // onShowMenu -> createFrameHandle -> frame:display(). A menu that builds a frame but is never
  // opened won't appear (the exact bug that cost hours). Cross-file per addon, because the
  // OpenMenu call often lives in a sibling controller lua, not the menu file itself.
  // (Ref config: SirNukes simple_menu/Standalone_Menu.lua.)
  const byExt = new Map<string, LuaFileInput[]>();
  for (const f of normalizedFiles) {
    if (!f.rel.toLowerCase().endsWith('.lua')) continue;
    const key = (file => (file.extension?.id || file.extension?.folder || ''))(f).toLowerCase();
    (byExt.get(key) || byExt.set(key, []).get(key)!).push(f);
  }
  for (const group of byExt.values()) {
    const coded = group.map(f => ({ f, code: stripLuaComments(f.text) }));
    const opensSomewhere = coded.some(({ code }) => /\bOpenMenu\s*\(/.test(code));
    for (const { f, code } of coded) {
      const buildsMenu = /createFrameHandle\s*\(/.test(code) || /\bonShowMenu\b/.test(code) || /\bregisterMenu\s*\(/.test(code);
      if (buildsMenu && !opensSomewhere) {
        findings.push({
          layer: 'x4', severity: 'error', code: 'lua.menu_never_opened', rel: f.rel,
          message: `${f.rel} builds a menu (createFrameHandle/onShowMenu/registerMenu) but no Lua in this addon calls OpenMenu(name). X4 renders a standalone menu ONLY when the engine function OpenMenu(name) opens it (which then calls onShowMenu). Add menu.open() -> OpenMenu(menu.name, ...). Ref: SirNukes simple_menu/Standalone_Menu.lua.`,
          source: f.source, sourcePath: f.sourcePath
        });
      }
      // Schema rule (lazyHelper): a menu file that CACHES the global Helper at file load
      // (`local Helper = Helper`) without ever re-reading it lazily. Helper is nil when a menu
      // file first executes, so the cached value stays nil → Helper.registerMenu never runs and
      // display() bails on `if not Helper`. The window never renders. THE bug that cost hours.
      // Fix: `local Helper = rawget(_G,"Helper")` + re-fetch at use time. (X4_STANDALONE_MENU_SCHEMA)
      if (buildsMenu) {
        const cachesHelperAtLoad = /local\s+Helper\s*=\s*Helper\b/.test(code);
        const lazyHelper = /rawget\s*\(\s*_G\s*,\s*['"]Helper['"]\s*\)/.test(code);
        if (cachesHelperAtLoad && !lazyHelper) {
          findings.push({
            layer: 'x4', severity: 'error', code: 'lua.helper_cached_at_load', rel: f.rel,
            message: `${f.rel} caches the global Helper at file load (\`local Helper = Helper\`). Helper is nil when a menu file first loads, so registerMenu never runs and display() bails — the window never renders. Read Helper lazily: \`local Helper = rawget(_G,"Helper")\` and re-fetch at use time. Ref: AI-Influence chat-window fix + SirNukes Standalone_Menu deferred Init.`,
            source: f.source, sourcePath: f.sourcePath
          });
        }
      }
    }

  }

  return {
    filesScanned: files.length,
    globalAllowlistSize: allow.size,
    findings,
    x4UiResults,
    x4UiSummary,
    runtimeScope
  };
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
    },
    {
      rel: 'ui/djfhe_bad.lua',
      text: 'local c = require("djfhe.http.client")\npackage.path = package.path .. ";extensions/?.lua"\n',
      source: 'loose',
      sourcePath: 'djfhe_bad',
      extension: { folder: 'djfhe_bad', id: 'djfhe_bad' }
    },
    {
      // Mirrors aic_uix.lua: the hazards appear ONLY inside a warning comment. Must NOT flag.
      rel: 'ui/djfhe_comment.lua',
      text: '-- Do NOT require("djfhe.http.client") and do NOT add a broad "extensions/?.lua" to package.path.\n--[[ block: require("djfhe.http.client") / extensions/?.lua ]]\nlocal Request = require("djfhe.http.request")\n',
      source: 'loose',
      sourcePath: 'djfhe_comment',
      extension: { folder: 'djfhe_comment', id: 'djfhe_comment' }
    },
    {
      // The PROVIDER's own internal module legitimately requires its client → must NOT flag.
      rel: 'lua/djfhe/http/request.lua',
      text: 'local Client = require("djfhe.http.client")\nreturn Client\n',
      source: 'loose',
      sourcePath: 'djfhe_http_provider',
      extension: { folder: 'djfhe_http', id: 'djfhe_http' }
    },
    {
      // UI validator: builds a menu frame but NOTHING in this addon opens it via OpenMenu -> the
      // window will never render. This is the exact bug class (must flag).
      rel: 'ui/menu_noopen.lua',
      text: 'local menu = { name = "M" }\nfunction menu.onShowMenu() menu.frame = Helper.createFrameHandle(menu, {}); menu.frame:display() end\nif Helper then Helper.registerMenu(menu) end\nreturn menu\n',
      source: 'loose', sourcePath: 'noopenmod',
      extension: { folder: 'noopenmod', id: 'noopenmod' }
    },
    {
      // The KNOWN-WORKING config (matches the live-fixed AI-Influence chat window): a menu file
      // that reads Helper LAZILY (rawget) + a sibling controller that opens it via OpenMenu.
      rel: 'ui/menu.lua',
      text: 'local Helper = rawget(_G, "Helper")\nlocal function refreshHelper() if not Helper then Helper = rawget(_G, "Helper") end return Helper end\nlocal menu = { name = "Good" }\nfunction menu.onShowMenu() refreshHelper(); menu.frame = Helper.createFrameHandle(menu, {}); menu.frame:display() end\nfunction menu.ensureRegistered() refreshHelper(); if Helper then Helper.registerMenu(menu) end end\nreturn menu\n',
      source: 'loose', sourcePath: 'openmod',
      extension: { folder: 'openmod', id: 'openmod' }
    },
    {
      rel: 'ui/ctrl.lua',
      text: 'local function open() if OpenMenu then OpenMenu("Good", nil, nil, true) end end\nRegisterEvent("x.open", open)\nRemoveScript()\n',
      source: 'loose', sourcePath: 'openmod',
      extension: { folder: 'openmod', id: 'openmod' }
    },
    {
      // BROKEN against the schema: caches Helper at file load (the hours-long bug). It IS opened
      // (sibling controller), so this isolates lua.helper_cached_at_load from menu_never_opened.
      rel: 'ui/menu_cached.lua',
      text: 'local Helper = Helper\nlocal menu = { name = "C" }\nfunction menu.onShowMenu() menu.frame = Helper.createFrameHandle(menu, {}); menu.frame:display() end\nif Helper then Helper.registerMenu(menu) end\nreturn menu\n',
      source: 'loose', sourcePath: 'cachedmod',
      extension: { folder: 'cachedmod', id: 'cachedmod' }
    },
    {
      rel: 'ui/cached_ctrl.lua',
      text: 'local function open() if OpenMenu then OpenMenu("C", nil, nil, true) end end\nRegisterEvent("c.open", open)\n',
      source: 'loose', sourcePath: 'cachedmod',
      extension: { folder: 'cachedmod', id: 'cachedmod' }
    },
    {
      // Hallucinated X4 UI API that cannot run (must flag).
      rel: 'ui/fake.lua',
      text: 'RegisterLayout("ui/x.xml")\nAddUITrigger("b", "on_click", function() end)\n',
      source: 'loose', sourcePath: 'fakemod',
      extension: { folder: 'fakemod', id: 'fakemod' }
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
    { name: 'x4_open_menu_global_not_flagged', pass: !has('lua.undefined_global', f => f.rel === 'ui/ctrl.lua' && f.symbol === 'OpenMenu') },
    { name: 'x4_remove_script_global_not_flagged', pass: !has('lua.undefined_global', f => f.rel === 'ui/ctrl.lua' && f.symbol === 'RemoveScript') },
    { name: 'scanned_global_definition_not_flagged', pass: !result.findings.some(f => f.code === 'lua.undefined_global' && f.symbol === 'MyGlobal') },
    { name: 'djfhe_internal_require_detected', pass: has('lua.djfhe_internal_require', f => f.rel === 'ui/djfhe_bad.lua' && f.layer === 'x4' && f.severity === 'error') },
    { name: 'broad_package_path_detected', pass: has('lua.broad_package_path', f => f.rel === 'ui/djfhe_bad.lua' && f.severity === 'warning') },
    { name: 'djfhe_internal_require_NOT_flagged_in_comment', pass: !has('lua.djfhe_internal_require', f => f.rel === 'ui/djfhe_comment.lua') },
    { name: 'broad_package_path_NOT_flagged_in_comment', pass: !has('lua.broad_package_path', f => f.rel === 'ui/djfhe_comment.lua') },
    // A4: the djfhe_http provider's own internal require is exempt; the consumer (djfhe_bad.lua) still flags.
    { name: 'djfhe_provider_internal_require_exempt', pass: !has('lua.djfhe_internal_require', f => f.rel === 'lua/djfhe/http/request.lua') },
    { name: 'djfhe_consumer_internal_require_still_flagged', pass: has('lua.djfhe_internal_require', f => f.rel === 'ui/djfhe_bad.lua' && f.severity === 'error') },
    // UI validator vs the known-working menu config:
    { name: 'ui_menu_never_opened_flagged', pass: has('lua.menu_never_opened', f => f.rel === 'ui/menu_noopen.lua' && f.severity === 'error') },
    { name: 'ui_menu_with_OpenMenu_not_flagged', pass: !has('lua.menu_never_opened', f => f.rel === 'ui/menu.lua') },
    { name: 'ui_fictional_api_flagged', pass: has('lua.fictional_ui_api', f => f.rel === 'ui/fake.lua' && f.symbol === 'RegisterLayout' && f.severity === 'error') },
    { name: 'ui_real_api_not_flagged_as_fictional', pass: !has('lua.fictional_ui_api', f => f.rel === 'ui/menu.lua') },
    // Schema rule (lazyHelper): caching Helper at file load is the hours-long bug — must flag;
    // the lazy-rawget known-working menu must NOT flag.
    { name: 'ui_helper_cached_at_load_flagged', pass: has('lua.helper_cached_at_load', f => f.rel === 'ui/menu_cached.lua' && f.severity === 'error') },
    { name: 'ui_lazy_helper_not_flagged', pass: !has('lua.helper_cached_at_load', f => f.rel === 'ui/menu.lua') },
    { name: 'ui_cached_menu_isolated_from_never_opened', pass: !has('lua.menu_never_opened', f => f.rel === 'ui/menu_cached.lua') }
  ];

  const focusedFile = (rel: string, text: string, id = 'focused'): LuaFileInput => ({
    rel,
    text,
    source: 'loose',
    sourcePath: `${id}:${rel}`,
    extension: { folder: id, id }
  });
  const menuLuaPaths = registeredX4MenuLuaPaths(`<addon name="RoleProbe"><environment type="menus">
    <file name="./tools/registered.lua"/><file name="tools/../tool.lua"/>
    <!-- <file name="tools/standalone.lua"/> -->
  </environment></addon>`);
  const roleFiles = [
    focusedFile('ui/main.lua', 'GetCurRealTime(); GetComponentData(); ConvertStringTo64Bit(); GetWareData(); ReadText(1001,1); ToolOnly(); GetWareDat(); RegisteredTool()'),
    focusedFile('tools/standalone.lua', 'ToolOnly = function() end; ToolOnlyMissing()'),
    focusedFile('tools/registered.lua', 'RegisteredTool = function() end; RegisteredMissing()'),
    focusedFile('tools/Registered.lua', 'WrongCaseMissing()'),
    focusedFile('tools/broken.lua', 'function malformed('),
  ].map(file => ({ ...file, extension: { ...file.extension, menuLuaPaths } }));
  const neighbor = focusedFile('tools/registered.lua', 'NeighborMissing()', 'neighbor');
  const roleFindings = analyzeLuaFiles([...roleFiles, { ...neighbor, extension: { ...neighbor.extension, id: 'focused' } }]).findings;
  checks.push({ name: 'tools_globals_stay_out_of_the_game_namespace', pass:
    roleFindings.filter(f => f.code === 'lua.undefined_global').map(f => f.symbol).sort().join(',')
      === 'GetWareDat,RegisteredMissing,ToolOnly' });
  checks.push({ name: 'standalone_tools_still_report_syntax_errors', pass:
    roleFindings.some(f => f.code === 'lua.syntax_error' && f.rel === 'tools/broken.lua') });
  const rejectedRegistrations = [
    '<addon name="Malformed"><environment type="menus"><file name="tools/invalid.lua"/></addon>',
    '<addon><environment type="menus"><file name="tools/unnamed.lua"/></environment></addon>',
    '<addon xmlns="urn:other" name="Foreign"><environment type="menus"><file name="tools/foreign.lua"/></environment></addon>',
    `<addon name="Deep"><environment type="menus"><file name="tools/deep.lua"/></environment>${'<n>'.repeat(256)}${'</n>'.repeat(256)}</addon>`,
  ];
  checks.push({ name: 'menu_registration_requires_a_safe_direct_manifest_entry', pass:
    menuLuaPaths.size === 1 && menuLuaPaths.has('tools/registered.lua')
    && rejectedRegistrations.every(xml => registeredX4MenuLuaPaths(xml).size === 0) });
  const cleanUiText = [
    "local menu = { name = 'M', layer = 1 }",
    'local frame = Helper.createFrameHandle(menu, { layer = 1 })',
    'local table = frame:addTable(12)',
    "OpenMenu('M', nil, nil, true)",
    ''
  ].join('\n');
  const warningUiText = cleanUiText.replace('frame:addTable(12)', 'frame:addTable(13)');
  const errorUiText = cleanUiText.replace('frame:addTable(12)', 'frame:addTable(24)');
  const dynamicUiText = [
    "local menu = { name = 'M', layer = 1 }",
    'local frame = Helper.createFrameHandle(menu, { layer = 1 })',
    'local count = getCount()',
    'local table = frame:addTable(count)',
    "OpenMenu('M', nil, nil, true)",
    ''
  ].join('\n');
  const truncationUiText = Array.from({ length: 180 }, (_, index) =>
    `local table${index} = frame${index}:addTable(count${index})`
  ).join('\n');

  const bomValidAnalysis = analyzeLuaFiles([
    focusedFile('scripts/bom_valid.lua', '\uFEFFlocal value = 1\nreturn value\n', 'bom-valid')
  ]);
  const bomInvalidAnalysis = analyzeLuaFiles([
    focusedFile('scripts/bom_invalid.lua', '\uFEFFfunction nope(\n', 'bom-invalid')
  ]);
  const bomUiAnalysis = analyzeLuaFiles([
    focusedFile('ui/bom_too_many_columns.lua', `\uFEFF${warningUiText}`, 'bom-ui')
  ]);
  const nonBomUiAnalysis = analyzeLuaFiles([
    focusedFile('ui/bom_too_many_columns.lua', warningUiText, 'bom-ui')
  ]);

  const cleanUiAnalysis = analyzeLuaFiles([focusedFile('ui/clean12.lua', cleanUiText, 'clean12')]);
  const warningUiAnalysis = analyzeLuaFiles([focusedFile('ui/warning_columns.lua', warningUiText, 'warning13')]);
  const errorUiAnalysis = analyzeLuaFiles([focusedFile('ui/too_many_columns.lua', errorUiText, 'error24')]);
  const dynamicUiAnalysis = analyzeLuaFiles([focusedFile('ui/dynamic_count.lua', dynamicUiText, 'dynamic')]);
  const mixedUiAnalysis = analyzeLuaFiles([focusedFile('ui/error_and_gap.lua', [
    "local menu = { name = 'M', layer = 1 }",
    'local frame = Helper.createFrameHandle(menu, { layer = 1 })',
    'local fatalTable = frame:addTable(24)',
    'local count = getCount()',
    'local dynamicTable = frame:addTable(count)',
    "OpenMenu('M', nil, nil, true)",
    ''
  ].join('\n'), 'mixed')]);
  const brokenUiAnalysis = analyzeLuaFiles([focusedFile('ui/broken_ui.lua', 'function nope(\n', 'broken-ui')]);
  const truncationUiAnalysis = analyzeLuaFiles([focusedFile('ui/truncated.lua', truncationUiText, 'truncated')]);
  const nonUiAnalysis = analyzeLuaFiles([
    focusedFile('scripts/regular.lua', 'local value = math.abs(-1)\nreturn value\n', 'non-ui')
  ]);
  const outsideUiAnalysis = analyzeLuaFiles([
    focusedFile('lua/outside_ui.lua', cleanUiText, 'outside-ui')
  ]);

  const cleanUiResult = cleanUiAnalysis.x4UiResults[0]?.result;
  const warningUiResult = warningUiAnalysis.x4UiResults[0]?.result;
  const errorUiResult = errorUiAnalysis.x4UiResults[0]?.result;
  const errorUiFinding = errorUiAnalysis.findings.find(finding =>
    finding.rel === 'ui/too_many_columns.lua' && finding.code === 'x4-ui.add-table-column-limit'
  );
  const dynamicUiResult = dynamicUiAnalysis.x4UiResults[0]?.result;
  const mixedUiResult = mixedUiAnalysis.x4UiResults[0]?.result;
  const brokenUiResult = brokenUiAnalysis.x4UiResults[0]?.result;
  const truncationUiResult = truncationUiAnalysis.x4UiResults[0]?.result;
  const dynamicSummaryFindings = dynamicUiAnalysis.findings.filter(finding =>
    finding.rel === 'ui/dynamic_count.lua' && finding.code === X4_UI_VERIFICATION_SUMMARY_CODE
  );
  const truncationSummaryFindings = truncationUiAnalysis.findings.filter(finding =>
    finding.rel === 'ui/truncated.lua' && finding.code === X4_UI_VERIFICATION_SUMMARY_CODE
  );
  const truncationFindings = truncationUiAnalysis.findings.filter(finding =>
    finding.rel === 'ui/truncated.lua' && finding.code === X4_UI_TRUNCATION_CODE
  );
  const bomUiFinding = bomUiAnalysis.findings.find(finding =>
    finding.layer === 'x4' && finding.code === 'x4-ui.add-table-column-limit'
  );
  const nonBomUiFinding = nonBomUiAnalysis.findings.find(finding =>
    finding.layer === 'x4' && finding.code === 'x4-ui.add-table-column-limit'
  );

  checks.push(
    {
      name: 'bom_prefixed_valid_lua_has_no_syntax_error',
      pass: !bomValidAnalysis.findings.some(finding => finding.code === 'lua.syntax_error')
    },
    {
      name: 'bom_prefixed_invalid_lua_still_has_syntax_error',
      pass: bomInvalidAnalysis.findings.some(finding =>
        finding.code === 'lua.syntax_error' && finding.rel === 'scripts/bom_invalid.lua')
    },
    {
      name: 'bom_prefixed_x4_ui_warning_matches_non_bom_line',
      pass: bomUiFinding?.code === nonBomUiFinding?.code
        && bomUiFinding?.severity === 'warning'
        && nonBomUiFinding?.severity === 'warning'
        && bomUiFinding?.line === nonBomUiFinding?.line
        && bomUiFinding?.line === 3
        && bomUiFinding?.column === nonBomUiFinding?.column
        && !bomUiAnalysis.findings.some(finding => finding.code === 'lua.syntax_error')
    },
    {
      name: 'x4_ui_clean_12_column_structured_summary',
      pass: cleanUiResult?.summary === 'No known rule violated'
        && cleanUiResult.status === 'clean'
        && cleanUiResult.isStaticallyVerified
        && !cleanUiResult.hasErrors
        && !cleanUiResult.hasWarnings
        && cleanUiAnalysis.x4UiSummary.cleanCount === 1
        && !cleanUiAnalysis.findings.some(finding =>
          finding.rel === 'ui/clean12.lua' && finding.layer === 'x4'
            && (finding.severity === 'error' || finding.severity === 'warning'))
    },
    {
      name: 'x4_ui_add_table_13_is_warning_and_not_clean',
      pass: warningUiResult?.status === 'warnings'
        && warningUiResult.summary === 'Known X4 UI warning reported'
        && warningUiResult.warningCount === 1
        && warningUiResult.hasWarnings
        && !warningUiResult.hasErrors
        && warningUiResult.isStaticallyVerified
        && warningUiAnalysis.x4UiSummary.warningCount === 1
        && warningUiAnalysis.x4UiSummary.errorCount === 0
        && warningUiAnalysis.findings.some(finding =>
          finding.rel === 'ui/warning_columns.lua' && finding.code === 'x4-ui.add-table-column-limit'
            && finding.severity === 'warning'
            && finding.message.includes('13-23')
            && finding.message.includes('valid 13-column tables')
            && !finding.message.includes('ENTIRE frame'))
    },
    {
      name: 'x4_ui_add_table_24_is_blocking_with_structured_cause',
      pass: errorUiResult?.status === 'errors'
        && errorUiResult.summary === 'Known X4 UI rule violated'
        && errorUiResult.hasErrors === true
        && errorUiResult.errorCount === 1
        && !errorUiResult.hasWarnings
        && errorUiResult.isStaticallyVerified
        && errorUiFinding?.severity === 'error'
        && errorUiFinding.line === 3
        && errorUiFinding.column !== undefined
        && errorUiFinding.message.includes('12 passed / 24 failed / 13-23 unbisected')
        && errorUiFinding.failureMode?.includes('conversation-open') === true
        && errorUiFinding.failureMode?.includes('ENTIRE frame') === true
        && errorUiFinding.cause?.includes('measured mod refusal boundary') === true
        && errorUiFinding.evidenceBoundary?.includes('13-23 unbisected') === true
        && errorUiFinding.evidenceBoundary?.includes('valid 13-column tables') === true
        && errorUiFinding.nextAction?.includes('twelve or fewer') === true
    },
    {
      name: 'x4_ui_dynamic_count_unverified_summary_only',
      pass: dynamicUiResult?.summary === 'Not statically verified'
        && dynamicUiResult.status === 'not-statically-verified'
        && dynamicUiResult.hasVerificationGaps
        && !dynamicUiResult.isStaticallyVerified
        && !dynamicUiResult.hasErrors
        && !dynamicUiResult.hasWarnings
        && dynamicSummaryFindings.length === 1
        && dynamicSummaryFindings[0].severity === 'info'
        && dynamicUiAnalysis.x4UiSummary.unverifiedCount === 1
    },
    {
      name: 'x4_ui_errors_and_gaps_remain_independent',
      pass: mixedUiResult?.hasErrors === true
        && mixedUiResult.hasVerificationGaps
        && !mixedUiResult.isStaticallyVerified
        && mixedUiResult.status === 'not-statically-verified'
        && mixedUiAnalysis.findings.some(finding =>
          finding.rel === 'ui/error_and_gap.lua' && finding.code === 'x4-ui.add-table-column-limit'
            && finding.severity === 'error')
        && mixedUiAnalysis.findings.filter(finding =>
          finding.rel === 'ui/error_and_gap.lua' && finding.code === X4_UI_VERIFICATION_SUMMARY_CODE
            && finding.severity === 'info').length === 1
    },
    {
      name: 'x4_ui_parse_failure_cannot_be_clean',
      pass: brokenUiResult?.parsed === false
        && brokenUiResult.summary === 'Not statically verified'
        && brokenUiResult.hasVerificationGaps
        && !brokenUiResult.isStaticallyVerified
        && brokenUiAnalysis.x4UiSummary.cleanCount === 0
    },
    {
      name: 'x4_ui_truncation_is_distinct_and_structured',
      pass: truncationUiResult?.hasTruncatedEvidence === true
        && truncationUiResult.verificationGapsTruncated
        && truncationUiResult.status === 'not-statically-verified'
        && !truncationUiResult.isStaticallyVerified
        && truncationSummaryFindings.length === 1
        && truncationFindings.length === 1
        && truncationSummaryFindings[0].severity === 'info'
        && truncationFindings[0].severity === 'info'
        && truncationUiAnalysis.x4UiSummary.truncatedCount === 1
    },
    {
      name: 'non_ui_lua_skips_x4_ui_analysis',
      pass: nonUiAnalysis.x4UiResults.length === 0
        && nonUiAnalysis.x4UiSummary.filesAnalyzed === 0
    },
    {
      name: 'out_of_folder_ui_signal_is_analyzed',
      pass: outsideUiAnalysis.x4UiResults.length === 1
        && outsideUiAnalysis.x4UiResults[0].rel === 'lua/outside_ui.lua'
        && outsideUiAnalysis.x4UiResults[0].result.summary === 'No known rule violated'
    },
    {
      name: 'x4_ui_analysis_is_deterministic',
      pass: JSON.stringify(analyzeLuaFiles([
        focusedFile('ui/clean12.lua', cleanUiText, 'repeat'),
        focusedFile('ui/warning_columns.lua', warningUiText, 'repeat'),
        focusedFile('ui/too_many_columns.lua', errorUiText, 'repeat')
      ])) === JSON.stringify(analyzeLuaFiles([
        focusedFile('ui/clean12.lua', cleanUiText, 'repeat'),
        focusedFile('ui/warning_columns.lua', warningUiText, 'repeat'),
        focusedFile('ui/too_many_columns.lua', errorUiText, 'repeat')
      ]))
    }
  );
  const consumerPath = 'ui/scope-consumer.lua';
  const providerPath = 'ui/scope-provider.lua';
  const providerText = 'function OrderedGlobal() end';
  const runtimeCase = (consumerText: string, provider = providerText,
    order: readonly string[] = [consumerPath, providerPath], xml?: string): LuaStaticAnalysisResult => {
    const sources = [focusedFile(consumerPath, consumerText, 'scope'), focusedFile(providerPath, provider, 'scope')];
    const runtimeInventory = buildX4MenuLuaRuntimeInventory({
      uiXml: xml ?? `<addon name="ScopeProbe"><environment type="menus">${order.map(rel => `<file name="${rel}"/>`).join('')}</environment></addon>`,
      luaFiles: sources.map(file => ({ path: file.rel, text: file.text, sourcePath: file.sourcePath }))
    });
    return analyzeLuaFiles(sources.map(file => ({ ...file, extension: { ...file.extension, runtimeInventory } })));
  };
  const scopeFinding = (result: LuaStaticAnalysisResult, code: string, symbol = 'OrderedGlobal') =>
    result.findings.find(finding => finding.code === code && finding.symbol === symbol && finding.rel === consumerPath);
  const manifestOnlyCase = (uiXml: string): LuaStaticAnalysisResult => analyzeLuaFiles([], [{
    rel: 'ui.xml', source: 'loose', sourcePath: 'manifest-only:ui.xml',
    extension: { folder: 'manifest-only', id: 'manifest-only', runtimeInventory: buildX4MenuLuaRuntimeInventory({ uiXml, luaFiles: [] }) }
  }]);
  const emptyManifest = manifestOnlyCase('<addon name="ScopeProbe"><environment type="menus"/></addon>');
  const missingManifestTarget = manifestOnlyCase('<addon name="ScopeProbe"><environment type="menus"><file name="ui/missing.lua"/></environment></addon>');
  const invalidManifestOnly = manifestOnlyCase('<addon');
  const hasUnknownConsumerEnvironment = (result: LuaStaticAnalysisResult): boolean => result.runtimeScope.gaps.some(gap =>
    gap.rel === consumerPath && gap.reason.includes('Dynamic or incomplete environment state'));
  const scopeChecks = [
    { name: 'runtime_unlisted_provider_cannot_mask_registered_use', pass: !!scopeFinding(runtimeCase('OrderedGlobal()', providerText, [consumerPath]), 'lua.undefined_global') },
    { name: 'runtime_later_registered_provider_is_positioned', pass: scopeFinding(runtimeCase('\nOrderedGlobal()'), GLOBAL_BEFORE_DEFINITION)?.line === 2 },
    { name: 'runtime_earlier_registered_provider_resolves', pass: !scopeFinding(runtimeCase('OrderedGlobal()', providerText, [providerPath, consumerPath]), GLOBAL_BEFORE_DEFINITION)
      && !scopeFinding(runtimeCase('OrderedGlobal()', providerText, [providerPath, consumerPath]), 'lua.undefined_global') },
    { name: 'runtime_same_file_rhs_precedes_writes', pass: scopeFinding(runtimeCase('OtherValue, OrderedGlobal = OrderedGlobal, 1'), GLOBAL_BEFORE_DEFINITION)?.line === 1 },
    { name: 'runtime_local_or_member_write_is_not_a_provider', pass: !!scopeFinding(runtimeCase('OrderedGlobal()', 'local OrderedGlobal = {}; OrderedGlobal.member = true', [providerPath, consumerPath]), 'lua.undefined_global')
      && !!scopeFinding(runtimeCase('OrderedGlobal()', 'function OrderedGlobal.member() end', [providerPath, consumerPath]), 'lua.undefined_global') },
    { name: 'runtime_conditional_provider_is_unproven', pass: !scopeFinding(runtimeCase('OrderedGlobal()', 'if Condition then function OrderedGlobal() end end', [providerPath, consumerPath]), GLOBAL_BEFORE_DEFINITION)
      && runtimeCase('OrderedGlobal()', 'if Condition then function OrderedGlobal() end end', [providerPath, consumerPath]).runtimeScope.stages[2].status === 'partial' },
    { name: 'runtime_later_callback_provider_is_not_an_eager_failure', pass: !scopeFinding(runtimeCase('local function handler() OrderedGlobal() end\nRegisterEvent("demo", handler)'), GLOBAL_BEFORE_DEFINITION)
      && !scopeFinding(runtimeCase('local function handler() OrderedGlobal() end\nRegisterEvent("demo", handler)'), 'lua.undefined_global') },
    { name: 'runtime_direct_iife_is_eager', pass: !!scopeFinding(runtimeCase('(function() OrderedGlobal() end)()'), GLOBAL_BEFORE_DEFINITION) },
    { name: 'runtime_pcall_body_is_protected_but_argument_dereference_is_eager', pass: !scopeFinding(runtimeCase('pcall(function() OrderedGlobal() end)'), GLOBAL_BEFORE_DEFINITION)
      && !scopeFinding(runtimeCase('pcall(OrderedGlobal)'), GLOBAL_BEFORE_DEFINITION)
      && !!scopeFinding(runtimeCase('pcall(OrderedGlobal.member)'), GLOBAL_BEFORE_DEFINITION)
      && !!scopeFinding(runtimeCase('pcall(function() OrderedGlobal = {} end, OrderedGlobal.member)'), GLOBAL_BEFORE_DEFINITION) },
    { name: 'runtime_protected_and_rebound_pcall_writes_are_not_definite', pass: [
      'pcall(function() OrderedGlobal = function() end end)',
      'pcall = function(f) f() end; pcall(function() OrderedGlobal = function() end end)'
    ].every(provider => runtimeCase('local captured = OrderedGlobal', provider, [providerPath, consumerPath]).runtimeScope.gaps
      .some(gap => gap.rel === consumerPath && gap.reason.includes('possible global provider'))) },
    { name: 'runtime_opaque_callback_and_named_init_report_unknown', pass: !scopeFinding(runtimeCase('Opaque(function() OrderedGlobal() end)'), GLOBAL_BEFORE_DEFINITION)
      && runtimeCase('Opaque(function() OrderedGlobal() end)').runtimeScope.gaps.some(gap => gap.reason.includes('passed callback'))
      && runtimeCase('local function init() OrderedGlobal() end; init()').runtimeScope.gaps.some(gap => gap.reason.includes('callable is not expanded')) },
    { name: 'runtime_guards_do_not_assert_unconditional_order', pass: !scopeFinding(runtimeCase('if OrderedGlobal then OrderedGlobal() end\nlocal x = OrderedGlobal and OrderedGlobal()'), GLOBAL_BEFORE_DEFINITION)
      && !scopeFinding(runtimeCase('if type(OrderedGlobal) == "function" then OrderedGlobal() end\nwhile OrderedGlobal do break end'), GLOBAL_BEFORE_DEFINITION)
      && !scopeFinding(runtimeCase('if false then OrderedGlobal() end'), GLOBAL_BEFORE_DEFINITION)
      && !!scopeFinding(runtimeCase('if 0 then OrderedGlobal() end'), GLOBAL_BEFORE_DEFINITION) },
    { name: 'runtime_nil_rebinding_does_not_leave_provider_definite', pass: runtimeCase('OrderedGlobal = nil; OrderedGlobal()', providerText, [providerPath, consumerPath]).runtimeScope.stages[2].status === 'partial' },
    { name: 'runtime_environment_write_is_unavailable_not_safe', pass: !scopeFinding(runtimeCase('_G["OrderedGlobal"] = nil; OrderedGlobal()'), GLOBAL_BEFORE_DEFINITION)
      && runtimeCase('_G["OrderedGlobal"] = nil; OrderedGlobal()').runtimeScope.gaps.some(gap => gap.reason.includes('environment or package mutation')) },
    { name: 'runtime_replaced_lexical_environments_cannot_provide_globals_to_next_chunk', pass: [
      'local _ENV = {}; OrderedGlobal = function() end',
      '(function(_ENV) OrderedGlobal = function() end end)({})'
    ].every(provider => {
      const result = runtimeCase('local captured = OrderedGlobal', provider, [providerPath, consumerPath]);
      return hasUnknownConsumerEnvironment(result) && result.runtimeScope.stages[2].status === 'partial';
    }) },
    { name: 'runtime_opaque_calls_invalidate_later_provider_certainty_after_arguments', pass: (() => {
      const changed = runtimeCase('local function Init() _G.OrderedGlobal = 1 end; Init(); local captured = OrderedGlobal; OrderedGlobal = 2');
      const laterChunk = runtimeCase('local captured = OrderedGlobal', 'local function Init() end; Init(); OrderedGlobal = 1', [providerPath, consumerPath]);
      const argument = runtimeCase('local function Init(value) end; Init(OrderedGlobal.member)');
      return !scopeFinding(changed, GLOBAL_BEFORE_DEFINITION) && hasUnknownConsumerEnvironment(changed)
        && hasUnknownConsumerEnvironment(laterChunk) && !!scopeFinding(argument, GLOBAL_BEFORE_DEFINITION);
    })() },
    { name: 'runtime_opaque_protected_callbacks_do_not_preserve_load_state', pass: ['pcall(Run)', 'xpcall(Run, function(err) return err end)'].every(call => {
      const result = runtimeCase(`local function Run() _G.OrderedGlobal = 1 end; ${call}; local captured = OrderedGlobal; OrderedGlobal = 2`);
      return !scopeFinding(result, GLOBAL_BEFORE_DEFINITION) && hasUnknownConsumerEnvironment(result);
    }) },
    { name: 'runtime_unresolved_environment_aliases_preserve_explicit_gaps', pass: ['_G', 'package', 'getfenv()'].every(alias => {
      const result = runtimeCase(`local Env = ${alias}; Env.OrderedGlobal = 1; local captured = OrderedGlobal; OrderedGlobal = 2`);
      return !scopeFinding(result, GLOBAL_BEFORE_DEFINITION) && hasUnknownConsumerEnvironment(result)
        && result.runtimeScope.gaps.some(gap => gap.reason.includes('environment value may be aliased'));
    }) },
    { name: 'runtime_elseif_after_unknown_condition_is_conditional', pass: !scopeFinding(runtimeCase('if Maybe then local first = 1 elseif OrderedGlobal.member then local second = 2 end'), GLOBAL_BEFORE_DEFINITION)
      && !!scopeFinding(runtimeCase('if false then local first = 1 elseif OrderedGlobal.member then local second = 2 end'), GLOBAL_BEFORE_DEFINITION) },
    { name: 'runtime_only_nil_comparison_is_an_equality_guard', pass: !scopeFinding(runtimeCase('local absent = OrderedGlobal == nil'), GLOBAL_BEFORE_DEFINITION)
      && !!scopeFinding(runtimeCase('local seven = OrderedGlobal == 7'), GLOBAL_BEFORE_DEFINITION) },
    { name: 'runtime_possible_prior_assignments_preclude_later_only_claim', pass: [
      'OtherValue, OrderedGlobal = ...', 'OrderedGlobal = UnknownValue', 'if Maybe then OrderedGlobal = 1 end'
    ].every(write => {
      const result = runtimeCase(`${write}; local captured = OrderedGlobal; OrderedGlobal = 2`);
      return result.runtimeScope.stages[0].status === 'pass' && !scopeFinding(result, GLOBAL_BEFORE_DEFINITION)
        && result.runtimeScope.gaps.some(gap => gap.rel === consumerPath && gap.reason.includes('possible global provider'));
    }) && !!scopeFinding(runtimeCase('OrderedGlobal = nil; local captured = OrderedGlobal; OrderedGlobal = 2'), GLOBAL_BEFORE_DEFINITION) },
    { name: 'runtime_separate_menu_blocks_do_not_invent_order', pass: (() => {
      const result = runtimeCase('OrderedGlobal()', providerText, [],
        `<addon name="ScopeProbe"><environment type="menus"><file name="${consumerPath}"/></environment><environment type="menus"><file name="${providerPath}"/></environment></addon>`);
      return !scopeFinding(result, GLOBAL_BEFORE_DEFINITION) && result.runtimeScope.gaps.some(gap => gap.reason.includes('Repeated menu environments'));
    })() },
    { name: 'runtime_seed_remains_advisory_free_under_unknown_loader', pass: !scopeFinding(runtimeCase('require("dynamic.module"); GetTopRow()'), 'lua.undefined_global', 'GetTopRow') },
    { name: 'unreachable_calls_preserve_existing_x4_ui_eligibility', pass: analyzeLuaFiles([
      focusedFile('scripts/lexical-ui.lua', 'if false then Helper.createFrameHandle({}, {}) end', 'lexical-ui')
    ]).x4UiResults.length === 1 },
    { name: 'manifest_only_uses_real_provenance_without_fake_lua_parse', pass: [emptyManifest, missingManifestTarget, invalidManifestOnly].every(result =>
      result.filesScanned === 0 && result.runtimeScope.stages[0].status === 'not-applicable' && result.runtimeScope.stages[0].files.length === 0)
      && emptyManifest.runtimeScope.stages[1].status === 'pass' && emptyManifest.runtimeScope.stages[2].status === 'not-applicable'
      && missingManifestTarget.runtimeScope.gaps.some(gap => gap.rel === 'ui.xml' && gap.reason.includes('ui/missing.lua'))
      && [missingManifestTarget, invalidManifestOnly].every(result => result.runtimeScope.stages[2].status === 'unavailable'
        && result.findings.some(finding => finding.code === SCOPE_UNVERIFIED && finding.rel === 'ui.xml' && finding.sourcePath === 'manifest-only:ui.xml')) },
    { name: 'runtime_evidence_limit_is_explicit', pass: runtimeCase(`local x = Helper${'.a'.repeat(80)}`).runtimeScope.truncated
      && runtimeCase(`local x = Helper${'.a'.repeat(80)}`).runtimeScope.gaps.some(gap => /limit|truncated/.test(gap.reason)) }
  ];
  checks.push(...scopeChecks);
  return { pass: checks.every(c => c.pass), checks };
}
