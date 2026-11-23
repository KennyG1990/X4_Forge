/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * P5 - project-level cross-file validation.
 *
 * The P0 project model can already answer "does this signal_cue resolve across
 * files?" This layer adds the next contract: MD <-> Lua event wiring and
 * content.xml dependency diagnostics over the same ExtensionProject envelope.
 */

import {
  addFile,
  buildContentXml,
  classifyPath,
  createProject,
  indexCueReferences,
  validateProjectStructure,
  type ExtensionProject,
  type CueReferenceIndex,
} from './extensionProject';
import { parseModManifest, type ModDependency, type ModManifest } from './modDependencyGraph';
import { mdLibraryAcceptsArguments } from '../../shared/mdDeclarationResolution';
import {
  buildMdLibraryIndex, classifyCueRef, duplicateMdCueMessage, findDuplicateMdCueDeclarations,
  mdReferenceArgumentNamespaceUnavailable, mdReferencePoint, parseMdScriptRoot, readMdLibrarySignature, readMdReferenceArguments, resolveMdLibraryReference,
  type MdLibraryDeclaration, type MdLibraryScript, type MdLibrarySignature, type MdReferenceFact,
} from './cueLineage';
import { describeAuthoredMdReference, EFFECTIVE_MD_ARGUMENT_CHECK, EFFECTIVE_MD_REFERENCE_CHECK,
  type EffectiveMdReferenceContext, type MdReferenceCoverageGap, type MdReferenceSourcePoint } from './mdEffectiveLibraryPurpose';
import { collectMdStringResults } from './expressionAst';
import type { PayloadWriterScope, ValidationSourceLocation } from './validationEvidence';
import { normPath, parseXmlLenient, walkElements } from './xmlLite';
import { parseX4Lua as parse } from './x4LuaParser';
import { DOMParser, type Attr as XmlAttr, type Document as XmlDocument, type Element as XmlElement } from '@xmldom/xmldom';
import { buildX4UiSourceBundle } from './x4UiSourceBundle';

export type ProjectCrossFileFindingCode =
  | 'project.structure'
  | 'cue.unresolved'
  | 'md_lua.missing_register'
  | 'lua_md.missing_listener'
  | 'lua_md.emit_verification_gap'
  | 'md_lua.registration_verification_gap'
  | 'md_lua.payload_collision'
  | 'md_lua.payload_missing_writer'
  | 'md_lua.payload_writer_unverified'
  | 'md_lua.payload_unused_writer'
  | 'dep.missing_content_xml'
  | 'dep.duplicate'
  | 'dep.self'
  | 'md.signal_library'
  | 'md.run_actions_nonlibrary'
  | 'md.include_actions_run_library'
  | 'md.cue_library_ref_unresolved'
  | 'md.cue_library_param_undeclared'
  | 'md.cue_library_param_required'
  | 'md.run_actions_param_undeclared'
  | 'md.run_actions_param_required'
  | 'md.cue_duplicate_name'
  | 'md_lua.conversation_menu_without_deferred_redraw'
  | 'validation.lua_ast_unavailable'
  | 'ui.invalid_registration';

export interface ProjectCrossFileFinding {
  code: ProjectCrossFileFindingCode;
  severity: 'error' | 'warning' | 'info';
  file?: string;
  line?: number;
  column?: number;
  target?: ValidationSourceLocation;
  /** Stable authored rule identity when several calls share one cause position. */
  sourceRef?: string;
  event?: string;
  dependencyId?: string;
  payloadWriterScope?: PayloadWriterScope;
  detail: string;
}

export interface ProjectEventRef {
  event: string;
  file: string;
  line?: number;
  column?: number;
  /**
   * True when the Lua event name is built dynamically (string concatenation, e.g.
   * `RegisterEvent(NS .. suffix, …)` / `"log_" .. category`) — `event` is then the
   * literal PREFIX, and matching must be prefix-based, not exact (ROADMAP AAR item #2).
   */
  prefix?: boolean;
}

export interface ProjectUiEventRef {
  namespace: string;
  control: string;
  event: string;
  file: string;
  /** True when the control name is dynamic (concat / trailing underscore) — see ProjectEventRef.prefix. */
  prefix?: boolean;
}

export interface ProjectCrossFileValidationResult {
  ok: boolean;
  summary: {
    files: number;
    findings: number;
    errors: number;
    structuralErrors: number;
    cueReferences: number;
    unresolvedCueRefs: number;
    mdLuaMissingRegisters: number;
    luaMdMissingListeners: number;
    luaRegistrationUnavailable: number;
    luaEmitUnverified: number;
    payloadContractErrors: number;
    dependencies: number;
  };
  findings: ProjectCrossFileFinding[];
  cueIndex: ReturnType<typeof indexCueReferences>;
  coverageGaps?: MdReferenceCoverageGap[];
  mdLua: {
    raised: ProjectEventRef[];
    registered: ProjectEventRef[];
    emitted: ProjectUiEventRef[];
    listened: ProjectUiEventRef[];
    missingRegisters: ProjectEventRef[];
    missingListeners: ProjectUiEventRef[];
    parseUnavailable: Array<{ file: string; detail: string }>;
    emitCoverage: {
      scope: 'direct-global-AddUITriggeredEvent-calls' | 'direct-and-pcall-global-AddUITriggeredEvent-calls';
      exact: number;
      prefix: number;
      unresolved: number;
      files: LuaEmitCoverage[];
    };
    payload: {
      reads: Array<{ key: string; scope: 'global' | 'verb'; file: string; destination: string; branch?: string }>;
      writes: Array<{ key: string; file: string }>;
    };
  };
  deps: {
    manifest: ModManifest | null;
    dependencies: ModDependency[];
  };
}

// normPath: shared via xmlLite (audit R2).

function stripMdLiteral(value: string | undefined): string {
  const raw = String(value || '').trim();
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
    return raw.slice(1, -1);
  }
  return raw;
}

function parseMdRaisedLuaEvents(content: string, file: string, findings: ProjectCrossFileFinding[]): ProjectEventRef[] {
  const out: ProjectEventRef[] = [];
  let documentRoot: XmlElement | null = null;
  try {
    let malformed = false;
    const parsed = new DOMParser({ onError: () => { malformed = true; } })
      .parseFromString(content.replace(/^\uFEFF/, ''), 'text/xml').documentElement;
    if (!malformed) documentRoot = parsed;
  } catch { /* Retain the existing fragment scan, without synthetic coordinates. */ }
  const record = (expression: string | null | undefined, line?: number, column?: number) => {
    if (!expression?.trim()) return;
    const location = { file, line, column };
    const { values, unresolved } = collectMdStringResults(expression);
    for (const event of values) out.push({ event, ...location });
    if (unresolved) findings.push({
      code: 'md_lua.registration_verification_gap', severity: 'info', ...location,
      detail: 'MD-to-Lua registration wiring is not fully verified. Forge checked the literal results, but this event name has an unresolved result.',
    });
  };
  if (documentRoot) {
    const elements = Array.from(documentRoot.getElementsByTagName('raise_lua_event'));
    if (documentRoot.nodeName === 'raise_lua_event') elements.unshift(documentRoot);
    for (const element of elements) {
      const attribute = element.getAttributeNode('name');
      record(attribute?.value, attribute?.lineNumber, attribute?.columnNumber);
    }
  } else {
    const fragment = parseXmlLenient(content);
    if (fragment) walkElements(fragment, element => {
      if (element.nodeName === 'raise_lua_event') record(element.getAttribute('name'));
    });
  }
  return out;
}

function parseMdUiListeners(content: string, file: string): ProjectUiEventRef[] {
  const out: ProjectUiEventRef[] = [];
  const root = parseXmlLenient(content);
  if (!root) return out;
  walkElements(root, element => {
    if (element.nodeName !== 'event_ui_triggered') return;
    const namespace = stripMdLiteral(element.getAttribute('screen') ?? undefined);
    const control = stripMdLiteral(element.getAttribute('control') ?? undefined);
    if (namespace && control) out.push({ namespace, control, event: `${namespace}.${control}`, file });
  });
  return out;
}

/** Fields consumed from luaparse's AST; other parser metadata remains unknown. */
interface LuaAstNode {
  type?: string;
  name?: string;
  value?: unknown;
  operator?: string;
  isLocal?: boolean;
  range?: number[];
  loc?: { start: { line: number; column: number } };
  left?: LuaAstNode;
  right?: LuaAstNode;
  identifier?: LuaAstNode;
  key?: LuaAstNode;
  variable?: LuaAstNode;
  variables?: LuaAstNode[];
  init?: LuaAstNode[];
  parameters?: LuaAstNode[];
  iterators?: LuaAstNode[];
  clauses?: LuaAstNode[];
  body?: LuaAstNode[];
  expression?: LuaAstNode;
  base?: LuaAstNode;
  index?: LuaAstNode;
  indexer?: string;
  fields?: LuaAstNode[];
  arguments?: LuaAstNode[];
  [key: string]: unknown;
}

function walkLuaAst(
  node: unknown,
  visit: (node: LuaAstNode, scope: LuaAstNode | undefined, branches: readonly LuaAstNode[], parent?: LuaAstNode) => void,
  scope?: LuaAstNode,
  branches: readonly LuaAstNode[] = [],
  parent?: LuaAstNode,
): void {
  if (!node || typeof node !== 'object') return;
  const ast = node as LuaAstNode;
  visit(ast, scope, branches, parent);
  if (ast.type === 'FunctionDeclaration') {
    scope = ast;
    branches = [];
  } else if (ast.type === 'IfClause' || ast.type === 'ElseifClause' || ast.type === 'ElseClause') {
    branches = [...branches, ast];
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'range' || key === 'comments' || key === 'tokens' || key === 'globals') continue;
    if (Array.isArray(value)) value.forEach(item => walkLuaAst(item, visit, scope, branches, ast));
    else if (value && typeof value === 'object') walkLuaAst(value, visit, scope, branches, ast);
  }
}

function luaIdentifier(node: LuaAstNode): string | null {
  return node?.type === 'Identifier' && typeof node.name === 'string' ? node.name : null;
}

function isLuaGlobalEnvironment(node: LuaAstNode | undefined): boolean {
  const name = luaIdentifier(node);
  return node?.isLocal === false && (name === '_G' || name === '_ENV');
}

interface LuaStringValue {
  value: string;
  prefix: boolean;
  tainted: boolean;
}

interface LuaAnalysisSource {
  content: string;
  substituted: Uint8Array;
}

interface LuaRegistrationParseResult {
  events: ProjectEventRef[];
  available: boolean;
  detail?: string;
  gap?: boolean;
}

function buildLuaAnalysisSource(content: string): LuaAnalysisSource {
  const codeUnits = content.split('');
  const substituted = new Uint8Array(content.length);
  for (let index = 0; index < content.length; index += 1) {
    // One decoded leading BOM is parser-only whitespace, not a tainted token.
    // Retain its code-unit width so ranges still address the original source.
    if (index === 0 && content.charCodeAt(index) === 0xfeff) {
      codeUnits[index] = ' ';
    } else if (content.charCodeAt(index) > 0xff) {
      codeUnits[index] = '?';
      substituted[index] = 1;
    }
  }
  return { content: codeUnits.join(''), substituted };
}

function luaStringLiteralTainted(node: LuaAstNode, substituted: Uint8Array): boolean {
  const range = node?.range;
  if (!Array.isArray(range) || range.length < 2 || !Number.isInteger(range[0]) || !Number.isInteger(range[1])) return true;
  const start = range[0] as number;
  const end = range[1] as number;
  if (start < 0 || end < start || end > substituted.length) return true;
  for (let index = start; index < end; index += 1) {
    if (substituted[index]) return true;
  }
  return false;
}

function luaStringPrefix(node: LuaAstNode, strings: Map<string, LuaStringValue>, substituted: Uint8Array): LuaStringValue | null {
  if (!node) return null;
  if (node.type === 'StringLiteral' && typeof node.value === 'string') {
    return { value: node.value, prefix: false, tainted: luaStringLiteralTainted(node, substituted) };
  }
  if (node.type === 'Identifier') {
    const value = strings.get(node.name);
    return value === undefined ? null : value;
  }
  if (node.type === 'BinaryExpression' && node.operator === '..') {
    const left = luaStringPrefix(node.left, strings, substituted);
    if (!left) return null;
    if (left.prefix) return left; // Nothing after an unknown segment extends the known prefix.
    const right = luaStringPrefix(node.right, strings, substituted);
    return right
      ? {
        value: left.value + right.value,
        prefix: left.prefix || right.prefix,
        tainted: left.tainted || right.tainted,
      }
      : { value: left.value, prefix: true, tainted: left.tainted };
  }
  return null;
}

function boundedLuaParseDetail(error: unknown): string {
  const raw = error instanceof Error ? error.message : '';
  const message = raw.replace(/\s+/g, ' ').trim() || 'unknown parse error';
  const prefix = 'Lua AST parse unavailable: ';
  return `${prefix}${message.slice(0, 160 - prefix.length)}`;
}

interface LuaBindingRef {
  node: LuaAstNode;
  parent?: LuaAstNode;
  grandParent?: LuaAstNode;
  fnScope?: LuaAstNode;
}

interface LuaLocalBinding {
  id: number;
  name: string;
  kind: 'local' | 'function' | 'param' | 'for';
  init?: LuaAstNode;
  writes: number;
  declRange?: [number, number];
  scopeNode: LuaAstNode;
  refs: LuaBindingRef[];
  stringValue?: LuaStringValue;
}

interface LuaLexicalScopeIndex {
  bindings: LuaLocalBinding[];
  declToBinding: Map<LuaAstNode, LuaLocalBinding>;
  identToBinding: Map<LuaAstNode, LuaLocalBinding>;
  functions: Map<LuaAstNode, LuaLocalBinding | undefined>;
  forLoops: { node: LuaAstNode; fnScope?: LuaAstNode }[];
  nodeFnScope: Map<LuaAstNode, LuaAstNode | undefined>;
  parents: Map<LuaAstNode, LuaAstNode>;
  jumpFnScopes: Set<LuaAstNode | undefined>;
  reboundGlobals: Set<string>;
  opaqueGlobals: boolean;
}

const LUA_REG_AST_SKIP_KEYS = new Set(['loc', 'range', 'comments', 'tokens', 'globals']);

function collectLuaLexicalScopes(root: LuaAstNode, initialOpaqueGlobals: boolean): LuaLexicalScopeIndex {
  const scopeStack: Map<string, LuaLocalBinding>[] = [new Map()];
  const bindings: LuaLocalBinding[] = [];
  const declToBinding = new Map<LuaAstNode, LuaLocalBinding>();
  const identToBinding = new Map<LuaAstNode, LuaLocalBinding>();
  const functions = new Map<LuaAstNode, LuaLocalBinding | undefined>();
  const forLoops: { node: LuaAstNode; fnScope?: LuaAstNode }[] = [];
  const nodeFnScope = new Map<LuaAstNode, LuaAstNode | undefined>();
  const parents = new Map<LuaAstNode, LuaAstNode>();
  const jumpFnScopes = new Set<LuaAstNode | undefined>();
  const reboundGlobals = new Set<string>();
  let opaqueGlobals = initialOpaqueGlobals;

  const lookup = (name: string): LuaLocalBinding | undefined => {
    for (let i = scopeStack.length - 1; i >= 0; i -= 1) {
      const hit = scopeStack[i].get(name);
      if (hit) return hit;
    }
    return undefined;
  };

  const bind = (
    declNode: LuaAstNode | undefined,
    kind: LuaLocalBinding['kind'],
    scopeNode: LuaAstNode,
    init?: LuaAstNode,
    rangeNode?: LuaAstNode,
  ): LuaLocalBinding | undefined => {
    const name = declNode ? luaIdentifier(declNode) : null;
    if (!declNode || !name) return undefined;
    const range = Array.isArray(rangeNode?.range) && rangeNode.range.length >= 2
      ? [rangeNode.range[0], rangeNode.range[1]] as [number, number]
      : undefined;
    const binding: LuaLocalBinding = { id: bindings.length, name, kind, init, writes: 1, declRange: range, scopeNode, refs: [] };
    bindings.push(binding);
    scopeStack[scopeStack.length - 1].set(name, binding);
    declToBinding.set(declNode, binding);
    identToBinding.set(declNode, binding);
    return binding;
  };

  const recordGlobalEnvWrite = (target: LuaAstNode | undefined) => {
    if (!target) return;
    if (target.type === 'Identifier' && !target.isLocal && target.name) {
      reboundGlobals.add(target.name);
      if (target.name === '_ENV') opaqueGlobals = true;
      return;
    }
    if ((target.type === 'MemberExpression' || target.type === 'IndexExpression') && isLuaGlobalEnvironment(target.base)) {
      const member = luaMemberName(target);
      if (member !== undefined) reboundGlobals.add(member);
      else opaqueGlobals = true;
    }
  };

  const visitChildren = (node: LuaAstNode, scopeBlock: LuaAstNode, fnScope: LuaAstNode | undefined, parent: LuaAstNode | undefined, skip: ReadonlySet<string>) => {
    for (const [key, value] of Object.entries(node)) {
      if (LUA_REG_AST_SKIP_KEYS.has(key) || skip.has(key)) continue;
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === 'object') visit(item as LuaAstNode, scopeBlock, fnScope, node, parent);
        }
      } else if (value && typeof value === 'object') {
        visit(value as LuaAstNode, scopeBlock, fnScope, node, parent);
      }
    }
  };

  const visitStatements = (stmts: LuaAstNode[] | undefined, scopeBlock: LuaAstNode, fnScope: LuaAstNode | undefined, parent: LuaAstNode) => {
    if (!stmts) return;
    for (const stmt of stmts) visit(stmt, scopeBlock, fnScope, parent, undefined);
  };

  const visit = (
    node: LuaAstNode | undefined,
    scopeBlock: LuaAstNode,
    fnScope: LuaAstNode | undefined,
    parent?: LuaAstNode,
    grandParent?: LuaAstNode,
  ): void => {
    if (!node || typeof node !== 'object') return;
    if (parent) parents.set(node, parent);
    nodeFnScope.set(node, fnScope);
    switch (node.type) {
      case 'Chunk':
        visitStatements(node.body, node, fnScope, node);
        return;
      case 'DoStatement':
        scopeStack.push(new Map());
        visitStatements(node.body, node, fnScope, node);
        scopeStack.pop();
        return;
      case 'WhileStatement':
        visit(node.condition as LuaAstNode | undefined, scopeBlock, fnScope, node, parent);
        scopeStack.push(new Map());
        visitStatements(node.body, node, fnScope, node);
        scopeStack.pop();
        return;
      case 'RepeatStatement':
        scopeStack.push(new Map());
        visitStatements(node.body, node, fnScope, node);
        visit(node.condition as LuaAstNode | undefined, node, fnScope, node, parent);
        scopeStack.pop();
        return;
      case 'IfStatement':
        for (const clause of node.clauses ?? []) {
          parents.set(clause, node);
          if (clause.condition) visit(clause.condition as LuaAstNode, scopeBlock, fnScope, clause, node);
          scopeStack.push(new Map());
          visitStatements(clause.body, clause, fnScope, clause);
          scopeStack.pop();
        }
        return;
      case 'ForNumericStatement':
        visit(node.start as LuaAstNode | undefined, scopeBlock, fnScope, node, parent);
        visit(node.end as LuaAstNode | undefined, scopeBlock, fnScope, node, parent);
        visit(node.step as LuaAstNode | undefined, scopeBlock, fnScope, node, parent);
        scopeStack.push(new Map());
        bind(node.variable, 'for', node);
        visitStatements(node.body, node, fnScope, node);
        scopeStack.pop();
        return;
      case 'ForGenericStatement':
        forLoops.push({ node, fnScope });
        for (const iter of node.iterators ?? []) visit(iter, scopeBlock, fnScope, node, parent);
        scopeStack.push(new Map());
        for (const variable of node.variables ?? []) bind(variable, 'for', node);
        visitStatements(node.body, node, fnScope, node);
        scopeStack.pop();
        return;
      case 'LocalStatement':
        for (const initExpr of node.init ?? []) visit(initExpr, scopeBlock, fnScope, node, parent);
        (node.variables ?? []).forEach((variable, index) => {
          bind(variable, 'local', scopeBlock, node.init?.[index], node);
        });
        return;
      case 'AssignmentStatement':
        for (const initExpr of node.init ?? []) visit(initExpr, scopeBlock, fnScope, node, parent);
        for (const variable of node.variables ?? []) {
          if (variable.type === 'Identifier') {
            if (variable.isLocal) {
              const binding = variable.name ? lookup(variable.name) : undefined;
              if (binding) {
                binding.writes += 1;
                identToBinding.set(variable, binding);
                binding.refs.push({ node: variable, parent: node, grandParent: parent, fnScope });
              }
            } else {
              recordGlobalEnvWrite(variable);
            }
          } else {
            recordGlobalEnvWrite(variable);
            visit(variable, scopeBlock, fnScope, node, parent);
          }
        }
        return;
      case 'FunctionDeclaration': {
        let fnBinding: LuaLocalBinding | undefined;
        if (node.isLocal && node.identifier?.type === 'Identifier') {
          fnBinding = bind(node.identifier, 'function', scopeBlock, node, node);
        } else if (node.identifier) {
          recordGlobalEnvWrite(node.identifier);
          if (node.identifier.type !== 'Identifier') visit(node.identifier, scopeBlock, fnScope, node, parent);
        }
        functions.set(node, fnBinding);
        scopeStack.push(new Map());
        for (const param of node.parameters ?? []) bind(param, 'param', node);
        visitStatements(node.body, node, node, node);
        scopeStack.pop();
        return;
      }
      case 'MemberExpression':
        visit(node.base, scopeBlock, fnScope, node, parent);
        return;
      case 'IndexExpression':
        visit(node.base, scopeBlock, fnScope, node, parent);
        visit(node.index, scopeBlock, fnScope, node, parent);
        return;
      case 'TableKeyString':
        visit(node.value as LuaAstNode | undefined, scopeBlock, fnScope, node, parent);
        return;
      case 'TableKey':
        visit(node.key, scopeBlock, fnScope, node, parent);
        visit(node.value as LuaAstNode | undefined, scopeBlock, fnScope, node, parent);
        return;
      case 'TableValue':
        visit(node.value as LuaAstNode | undefined, scopeBlock, fnScope, node, parent);
        return;
      case 'CallExpression':
        if (node.base?.isLocal === false) {
          const callee = luaIdentifier(node.base);
          if (callee === 'setfenv') opaqueGlobals = true;
          const rawArgs = callee === 'pcall' && node.arguments?.[0]?.isLocal === false && luaIdentifier(node.arguments[0]) === 'rawset'
            ? node.arguments.slice(1) : callee === 'rawset' ? node.arguments : undefined;
          if (rawArgs?.[0] && isLuaGlobalEnvironment(rawArgs[0])) {
            const keyArg = rawArgs[1];
            if (keyArg?.type === 'StringLiteral' && typeof keyArg.value === 'string') reboundGlobals.add(keyArg.value);
            else opaqueGlobals = true;
          }
        }
        visit(node.base, scopeBlock, fnScope, node, parent);
        for (const arg of node.arguments ?? []) visit(arg, scopeBlock, fnScope, node, parent);
        return;
      case 'BreakStatement':
      case 'ReturnStatement':
      case 'GotoStatement':
        jumpFnScopes.add(fnScope);
        visitChildren(node, scopeBlock, fnScope, parent, new Set());
        return;
      case 'Identifier':
        if (node.isLocal && node.name) {
          const binding = lookup(node.name);
          if (binding) {
            identToBinding.set(node, binding);
            binding.refs.push({ node, parent, grandParent, fnScope });
          }
        }
        return;
      default:
        visitChildren(node, scopeBlock, fnScope, parent, new Set());
    }
  };

  visit(root, root, undefined);
  return { bindings, declToBinding, identToBinding, functions, forLoops, nodeFnScope, parents, jumpFnScopes, reboundGlobals, opaqueGlobals };
}

function resolveLuaRegistrationStrings(
  node: LuaAstNode | undefined,
  identToBinding: ReadonlyMap<LuaAstNode, LuaLocalBinding>,
  substituted: Uint8Array,
  loopValues?: ReadonlyMap<LuaLocalBinding, LuaStringValue[]>,
): LuaStringValue[] | null {
  if (!node) return null;
  if (node.type === 'StringLiteral' && typeof node.value === 'string') {
    return [{ value: node.value, prefix: false, tainted: luaStringLiteralTainted(node, substituted) }];
  }
  if (node.type === 'Identifier') {
    if (!node.isLocal) return null;
    const binding = identToBinding.get(node);
    if (!binding) return null;
    const expanded = loopValues?.get(binding);
    if (expanded) return expanded;
    return binding.stringValue ? [binding.stringValue] : null;
  }
  if (node.type === 'BinaryExpression' && node.operator === '..') {
    const left = resolveLuaRegistrationStrings(node.left, identToBinding, substituted, loopValues);
    if (!left) return null;
    const right = node.right && left.some(item => !item.prefix)
      ? resolveLuaRegistrationStrings(node.right, identToBinding, substituted, loopValues)
      : null;
    if (!right) {
      return left.map(item => ({ value: item.value, prefix: true, tainted: item.tainted }));
    }
    const out: LuaStringValue[] = [];
    for (const l of left) {
      if (l.prefix) {
        out.push(l);
        continue;
      }
      for (const r of right) {
        if (out.length >= 256) return null;
        out.push({ value: l.value + r.value, prefix: r.prefix, tainted: l.tainted || r.tainted });
      }
    }
    return out;
  }
  return null;
}

function populateLuaBindingStrings(
  scopeIndex: LuaLexicalScopeIndex,
  substituted: Uint8Array,
): void {
  for (const binding of scopeIndex.bindings) {
    if (binding.kind !== 'local' || binding.writes !== 1 || !binding.init) continue;
    const resolved = resolveLuaRegistrationStrings(binding.init, scopeIndex.identToBinding, substituted);
    if (resolved?.length === 1) binding.stringValue = resolved[0];
  }
}

function luaNodeContainsCall(node: LuaAstNode | undefined): boolean {
  let hasCall = false;
  walkLuaAst(node, inner => {
    if (inner.type === 'CallExpression' || inner.type === 'FunctionDeclaration') hasCall = true;
  });
  return hasCall;
}

function isPlainLocalBookkeepingTable(
  binding: LuaLocalBinding,
  reboundGlobals: ReadonlySet<string>,
  opaqueGlobals: boolean,
): boolean {
  if (binding.kind !== 'local' || binding.writes !== 1 || binding.init?.type !== 'TableConstructorExpression') return false;
  return binding.refs.every(ref => {
    const { node, parent, grandParent } = ref;
    if (parent?.type === 'UnaryExpression' && parent.operator === '#') return true;
    if ((parent?.type === 'IndexExpression' || parent?.type === 'MemberExpression') && parent.base === node && parent.indexer !== ':'
      && !(grandParent?.type === 'CallExpression' && grandParent.base === parent)) {
      return true;
    }
    if (parent?.type === 'CallExpression' && parent.arguments?.[0] === node
      && !opaqueGlobals && !reboundGlobals.has('table')) {
      const member = parent.base?.type === 'MemberExpression' && parent.base.indexer === '.' && parent.base.base?.isLocal === false
        && luaIdentifier(parent.base.base) === 'table'
        ? luaIdentifier(parent.base.identifier) : undefined;
      if (member === 'concat') return true;
    }
    if (parent?.type === 'CallExpression' && parent.arguments?.[0] === node && parent.base?.isLocal === false
      && !opaqueGlobals && !reboundGlobals.has('ipairs') && luaIdentifier(parent.base) === 'ipairs'
      && grandParent?.type === 'ForGenericStatement') {
      return true;
    }
    return false;
  });
}

function extractPureIpairsEventList(
  loopNode: LuaAstNode,
  scopeIndex: LuaLexicalScopeIndex,
  substituted: Uint8Array,
  isUnshadowedGlobal: (node: LuaAstNode | undefined, name: string) => boolean,
): { elemBinding: LuaLocalBinding; values: LuaStringValue[]; tainted?: boolean } | undefined {
  const iter = loopNode.iterators?.length === 1 ? loopNode.iterators[0] : undefined;
  if (!iter || iter.type !== 'CallExpression' || !isUnshadowedGlobal(iter.base, 'ipairs') || iter.arguments?.length !== 1) return undefined;
  const listArg = iter.arguments[0];
  if (listArg?.type !== 'Identifier' || !listArg.isLocal) return undefined;
  const listBinding = scopeIndex.identToBinding.get(listArg);
  if (!listBinding || listBinding.kind !== 'local' || listBinding.writes !== 1) return undefined;
  if (listBinding.init?.type !== 'TableConstructorExpression') return undefined;
  const fields = listBinding.init.fields ?? [];
  if (fields.length === 0 || fields.length > 256) return undefined;
  if (!listBinding.declRange || !loopNode.range || listBinding.declRange[1] > loopNode.range[0]) return undefined;
  if (!luaContains(listBinding.scopeNode, loopNode)) return undefined;
  const readOnlyEverywhere = listBinding.refs.length > 0 && listBinding.refs.every(ref =>
    ref.parent?.type === 'CallExpression'
    && ref.parent.arguments?.length === 1
    && ref.parent.arguments[0] === ref.node
    && isUnshadowedGlobal(ref.parent.base, 'ipairs')
    && ref.grandParent?.type === 'ForGenericStatement'
    && ref.grandParent.iterators?.[0] === ref.parent);
  if (!readOnlyEverywhere) return undefined;

  const loopVars = loopNode.variables ?? [];
  const elemVar = loopVars.length >= 2 ? loopVars[1] : undefined;
  const elemBinding = elemVar ? scopeIndex.declToBinding.get(elemVar) : undefined;
  if (!elemBinding || elemBinding.name === '_' || elemBinding.writes !== 1) return undefined;

  const values: LuaStringValue[] = [];
  for (const field of fields) {
    if (field.type !== 'TableValue') return undefined;
    const resolved = resolveLuaRegistrationStrings(field.value as LuaAstNode | undefined, scopeIndex.identToBinding, substituted);
    if (!resolved || resolved.length !== 1) return undefined;
    const [item] = resolved;
    if (item.tainted) return { elemBinding, values: [], tainted: true };
    if (!item.value || item.prefix) return undefined;
    values.push(item);
  }
  return { elemBinding, values };
}

function parseLuaRegisteredEvents(content: string, file: string): LuaRegistrationParseResult {
  const source = buildLuaAnalysisSource(content || '');
  let envRebound = false;
  let ast: unknown;
  try {
    ast = parse(source.content, {
      comments: false, locations: true, ranges: true, scope: true, encodingMode: 'pseudo-latin1',
      onLocalDeclaration(name: string) { if (name === '_ENV') envRebound = true; },
    });
  } catch (error) {
    return { events: [], available: false, detail: boundedLuaParseDetail(error) };
  }

  const scopeIndex = collectLuaLexicalScopes(ast as LuaAstNode, envRebound);
  const { bindings, identToBinding, functions, forLoops, nodeFnScope, jumpFnScopes, reboundGlobals, opaqueGlobals } = scopeIndex;
  const isImmutable = (binding: LuaLocalBinding | undefined): binding is LuaLocalBinding =>
    !!binding && (binding.kind === 'local' || binding.kind === 'function') && binding.writes === 1;
  const isUnshadowedGlobal = (node: LuaAstNode | undefined, expected: string): boolean =>
    luaIdentifier(node) === expected && node?.isLocal === false && !opaqueGlobals && !reboundGlobals.has(expected);

  populateLuaBindingStrings(scopeIndex, source.substituted);

  const registrarBindings = new Set<LuaLocalBinding>();
  const possibleRegistrarBindings = new Set<LuaLocalBinding>();
  const recordPossibleAliases = () => {
    let changed = true;
    while (changed) {
      changed = false;
      for (const binding of bindings) {
        if (possibleRegistrarBindings.has(binding)) continue;
        const isAliasExpr = (expr: LuaAstNode | undefined): boolean => {
          if (expr?.type !== 'Identifier') return false;
          if (!expr.isLocal && expr.name === 'RegisterEvent') return true;
          const target = expr.isLocal ? identToBinding.get(expr) : undefined;
          return !!target && possibleRegistrarBindings.has(target);
        };
        let hit = isAliasExpr(binding.init);
        if (!hit) {
          for (const ref of binding.refs) {
            if (ref.parent?.type === 'AssignmentStatement') {
              const assignIndex = ref.parent.variables?.indexOf(ref.node) ?? -1;
              if (assignIndex >= 0 && isAliasExpr(ref.parent.init?.[assignIndex])) { hit = true; break; }
            }
          }
        }
        if (hit) {
          possibleRegistrarBindings.add(binding);
          changed = true;
        }
      }
    }
  };
  // Retain possible aliases even after reassignment so they produce a gap, not invented certainty.
  recordPossibleAliases();
  for (const binding of bindings) {
    if (binding.kind !== 'function' || !binding.init?.parameters?.length) continue;
    const initNode = binding.init;
    const paramNames = new Set((initNode.parameters || []).map(luaIdentifier).filter(Boolean));
    let forwardsParam = false;
    walkLuaAst(initNode.body, inner => {
      if (inner.type !== 'CallExpression' || nodeFnScope.get(inner) !== initNode) return;
      const base = inner.base;
      const isGlobalReg = base?.type === 'Identifier' && !base.isLocal && base.name === 'RegisterEvent';
      const baseBinding = base?.type === 'Identifier' && base.isLocal ? identToBinding.get(base) : undefined;
      if (!isGlobalReg && (!baseBinding || !possibleRegistrarBindings.has(baseBinding))) return;
      if ((inner.arguments || []).some(arg => {
        const argName = luaIdentifier(arg);
        const argBinding = arg?.type === 'Identifier' && arg.isLocal ? identToBinding.get(arg) : undefined;
        return !!argName && paramNames.has(argName) && argBinding?.scopeNode === initNode;
      })) {
        forwardsParam = true;
      }
    });
    if (forwardsParam) possibleRegistrarBindings.add(binding);
  }
  recordPossibleAliases();

  const engineRegistrar = (node: LuaAstNode | undefined): boolean => {
    if (!node) return false;
    if (isUnshadowedGlobal(node, 'RegisterEvent')) return true;
    if (!node.isLocal) return false;
    const binding = identToBinding.get(node);
    return !!binding && registrarBindings.has(binding);
  };
  for (const binding of bindings) {
    if (isImmutable(binding) && engineRegistrar(binding.init)) {
      registrarBindings.add(binding);
      possibleRegistrarBindings.add(binding);
    }
  }

  // Support single unconditional forwarding calls plus optional plain local-table log appends.
  const wrappers = new Map<LuaLocalBinding, number>();
  const forwardingCalls = new Set<LuaAstNode>();
  for (const [fnDecl, fnBinding] of functions) {
    if (!isImmutable(fnBinding) || !fnDecl.body?.length) continue;
    const params = (fnDecl.parameters || []).map(luaIdentifier);
    if (!params.length || new Set(params).size !== params.length) continue;

    let forwardCall: LuaAstNode | undefined;
    let forwardArgIndex = -1;
    let validBody = true;
    for (const stmt of fnDecl.body) {
      if (stmt.type === 'CallStatement') {
        if (forwardCall) { validBody = false; break; }
        const call = stmt.expression;
        if (!call || !engineRegistrar(call.base)) { validBody = false; break; }
        const argNode = call.arguments?.[0];
        const argBinding = argNode?.type === 'Identifier' && argNode.isLocal ? identToBinding.get(argNode) : undefined;
        const paramIndex = argNode ? params.indexOf(luaIdentifier(argNode)) : -1;
        if (paramIndex < 0 || argBinding?.scopeNode !== fnDecl || argBinding.writes !== 1) { validBody = false; break; }
        forwardCall = call;
        forwardArgIndex = paramIndex;
        continue;
      }
      if (stmt.type === 'AssignmentStatement' && stmt.variables?.length === 1 && stmt.init?.length === 1) {
        const lhs = stmt.variables[0];
        const rhs = stmt.init[0];
        const tableIdent = lhs.type === 'IndexExpression' || lhs.type === 'MemberExpression' ? lhs.base : undefined;
        const tableBinding = tableIdent?.type === 'Identifier' && tableIdent.isLocal ? identToBinding.get(tableIdent) : undefined;
        if (!tableBinding || !isPlainLocalBookkeepingTable(tableBinding, reboundGlobals, opaqueGlobals)
          || (lhs.type === 'IndexExpression' && luaNodeContainsCall(lhs.index))
          || luaNodeContainsCall(rhs)) {
          validBody = false;
          break;
        }
        continue;
      }
      validBody = false;
      break;
    }
    if (validBody && forwardCall && forwardArgIndex >= 0) {
      wrappers.set(fnBinding, forwardArgIndex);
      possibleRegistrarBindings.add(fnBinding);
      forwardingCalls.add(forwardCall);
    }
  }

  let taintedEventArgument = false;
  let unverified = false;
  const activeLoopCalls = new Map<LuaAstNode, Map<LuaLocalBinding, LuaStringValue[]>>();
  for (const { node: loopNode, fnScope: loopFnScope } of forLoops) {
    if (jumpFnScopes.has(loopFnScope)) continue;
    const extracted = extractPureIpairsEventList(loopNode, scopeIndex, source.substituted, isUnshadowedGlobal);
    if (!extracted) continue;
    if (extracted.tainted) {
      taintedEventArgument = true;
      continue;
    }
    for (const stmt of loopNode.body ?? []) {
      if (stmt.type !== 'CallStatement' || !stmt.expression) continue;
      if (nodeFnScope.get(stmt.expression) !== loopFnScope) continue;
      let existing = activeLoopCalls.get(stmt.expression);
      if (!existing) activeLoopCalls.set(stmt.expression, existing = new Map());
      existing.set(extracted.elemBinding, extracted.values);
    }
  }

  const out: ProjectEventRef[] = [];
  const seen = new Set<string>();
  const recordEvent = (value: LuaStringValue) => {
    if (value.tainted) {
      taintedEventArgument = true;
      return;
    }
    if (!value.value) { unverified = true; return; }
    if (value.prefix) unverified = true;
    const key = `${value.value}\0${value.prefix}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ event: value.value, file, ...(value.prefix ? { prefix: true } : {}) });
  };

  walkLuaAst(ast, node => {
    if (node.type !== 'CallExpression' || forwardingCalls.has(node)) return;
    const callee = luaIdentifier(node.base);
    if (!callee) return;
    const binding = node.base?.isLocal ? identToBinding.get(node.base) : undefined;
    const argIndex = engineRegistrar(node.base) ? 0 : binding ? wrappers.get(binding) : undefined;
    if (argIndex === undefined) {
      // A locally defined non-wrapper function named RegisterEvent is not the engine API.
      if (callee === 'RegisterEvent' && node.base?.isLocal) return;
      if ((binding && possibleRegistrarBindings.has(binding)) || (!node.base?.isLocal && callee === 'RegisterEvent')) {
        unverified = true;
      }
      return;
    }
    const loopValues = activeLoopCalls.get(node);
    const resolved = resolveLuaRegistrationStrings((node.arguments || [])[argIndex], identToBinding, source.substituted, loopValues);
    if (!resolved || resolved.length === 0) { unverified = true; return; }
    for (const value of resolved) recordEvent(value);
  });
  return taintedEventArgument
    ? {
      events: out,
      available: false,
      gap: true,
      detail: 'Lua registration event argument contains non-Latin-1 source text; registration analysis unavailable.',
    }
    : unverified ? { events: out, available: false, gap: true,
      detail: 'MD-to-Lua registration wiring is unverified: dynamic arguments, prefix-only matches, reassigned aliases or ambiguous callees cannot prove runtime registrations. Only immutable aliases, unescaped literal ipairs lists, and simple unconditional forwarding wrappers are supported.' }
    : { events: out, available: true };
}

interface PayloadReadSite extends ValidationSourceLocation { destination: string; branch?: string; event?: [string, string] }
interface PayloadWriteSite extends ValidationSourceLocation {
  key: string; table: string; events: string[]; recipientEvents: string[]; recipientUnverified: boolean; candidateOnly: boolean;
  returned?: LuaReturnedPayloadLink[];
}

function payloadReadEvent(element: XmlElement): [string, string] | undefined {
  for (let owner = element.parentElement; owner; owner = owner.parentElement) {
    if (owner.tagName !== 'cue' && owner.tagName !== 'library') continue;
    const conditions = Array.from(owner.childNodes).find(node => node.nodeType === 1 && node.nodeName === 'conditions') as XmlElement | undefined;
    if (!conditions) return undefined;
    const triggers = Array.from(conditions.getElementsByTagName('*')).filter(node => node.tagName.startsWith('event_'));
    const [listener] = triggers;
    if (triggers.length !== 1 || listener.tagName !== 'event_ui_triggered' || listener.parentNode !== conditions) return undefined;
    const screen = listener.getAttribute('screen')?.trim().match(/^(['"])([^'"]+)\1$/)?.[2];
    const control = listener.getAttribute('control')?.trim().match(/^(['"])([^'"]+)\1$/)?.[2];
    return screen && control ? [screen, control] : undefined;
  }
  return undefined;
}

/** Port of the observed x4_ai_influence wiregate invariant, scoped to its exact protocol shapes. */
function validateIndexedPayloadContract(mdFiles: ExtensionProject['files'], luaWrites: PayloadWriteSite[]): {
  findings: ProjectCrossFileFinding[];
  reads: Array<{ key: string; scope: 'global' | 'verb'; file: string; destination: string; branch?: string }>;
  writes: Array<{ key: string; file: string }>;
} {
  const reads = new Map<string, { global: PayloadReadSite[]; verb: PayloadReadSite[] }>();
  const writes = new Map<string, PayloadWriteSite[]>();
  const readPattern = /param3\.\{'\$([A-Za-z][A-Za-z0-9_]*)'\s*\+\s*\$si\}/g;
  for (const write of luaWrites) {
    const sites = writes.get(write.key) || [];
    sites.push(write);
    writes.set(write.key, sites);
  }
  for (const file of mdFiles) {
    if (!(file.content || '').includes('param3')) continue;
    let doc: XmlDocument;
    try { doc = new DOMParser().parseFromString(file.content || '', 'text/xml'); }
    catch { continue; }
    const elements = Array.from(doc.getElementsByTagName('*'));
    for (const element of elements) {
      const attrs = Array.from(element.attributes || []);
      let event: PayloadReadSite['event'];
      for (const attr of attrs) {
        let match: RegExpExecArray | null;
        readPattern.lastIndex = 0;
        while ((match = readPattern.exec(attr.value || '')) !== null) {
          let branch: string | undefined;
          let parent = element.parentElement;
          while (parent) {
            if (parent.nodeType === 1 && (parent.tagName === 'do_if' || parent.tagName === 'do_elseif') && /\$sv\s*==/.test(parent.getAttribute('value') || '')) {
              branch = parent.getAttribute('value') || undefined;
              break;
            }
            parent = parent.parentElement;
          }
          const bucket = reads.get(match[1]) || { global: [], verb: [] };
          event ??= payloadReadEvent(element);
          bucket[branch ? 'verb' : 'global'].push({ file: file.path, destination: element.getAttribute('name') || `<${element.tagName}>`,
            line: attr.lineNumber ?? element.lineNumber, column: attr.columnNumber ?? element.columnNumber,
            ...(branch ? { branch } : {}), event });
          reads.set(match[1], bucket);
        }
      }
    }
  }

  // Do not infer a protocol from a generic use of `payload` or `param3`; at least one exact
  // indexed key shape must exist somewhere in the project.
  if (reads.size === 0 && writes.size === 0) return { findings: [], reads: [], writes: [] };
  const findings: ProjectCrossFileFinding[] = [];
  const unavailable = new Map<string, {
    event: [string, string]; reader: PayloadReadSite; writer?: PayloadWriteSite;
    localIndexOnlyCount: number; returnedCount: number; bindingUnverified: boolean; forwardingUnverified: boolean;
    keys: Set<string>; readerPaths: Set<string>; writerPaths: Set<string>;
  }>();
  for (const key of new Set([...reads.keys(), ...writes.keys()])) {
    const read = reads.get(key) || { global: [], verb: [] };
    const write = writes.get(key) || [];
    if (read.global.length && read.verb.length) {
      findings.push({
        code: 'md_lua.payload_collision', severity: 'error', file: read.verb[0].file,
        detail: `Indexed payload key "${key}<n>" is read globally (${read.global.map(site => site.destination).join(', ')}) and inside a verb branch (${read.verb.map(site => site.destination).join(', ')}). A global slot belongs to every step and cannot be reused by one verb.`,
      });
    }
    const sites = [...read.global, ...read.verb];
    const eventReads = new Map<string, { site: PayloadReadSite; paths: Set<string> }>();
    for (const site of sites) {
      const identity = JSON.stringify(site.event ?? null);
      const known = eventReads.get(identity);
      if (known) known.paths.add(site.file);
      else eventReads.set(identity, { site, paths: new Set([site.file]) });
    }
    for (const [identity, { site, paths }] of eventReads) {
      if (write.some(candidate => !candidate.candidateOnly && (site.event ? candidate.events.includes(identity) : candidate.table === 'payload'))) continue;
      const candidates = write.filter(candidate => !site.event || candidate.recipientUnverified || candidate.recipientEvents.includes(identity));
      const possible = candidates[0];
      if (possible && site.event) {
        const matchedRecipient = candidates.find(candidate => candidate.recipientEvents.includes(identity));
        let group = unavailable.get(identity);
        if (!group) {
          group = { event: site.event, reader: site, writer: matchedRecipient, localIndexOnlyCount: 0, returnedCount: 0,
            bindingUnverified: false, forwardingUnverified: false, keys: new Set(), readerPaths: new Set(), writerPaths: new Set() };
          unavailable.set(identity, group);
        } else if (matchedRecipient && !group.writer) {
          group.writer = matchedRecipient;
        }
        if (candidates.every(candidate => candidate.candidateOnly)) group.localIndexOnlyCount++;
        const returned = candidates.flatMap(candidate => candidate.returned?.filter(link => link.identity === identity) ?? []);
        if (returned.length) {
          group.returnedCount++;
          group.bindingUnverified ||= returned.some(link => link.bindingUnverified);
          group.forwardingUnverified ||= returned.some(link => link.forwardingUnverified);
        }
        group.keys.add(key);
        for (const file of paths) group.readerPaths.add(file);
        for (const candidate of candidates) group.writerPaths.add(candidate.file);
        continue;
      }
      const event = site.event?.join('.');
      const subject = `MD reads indexed payload key "${key}<n>"${event ? ` for "${event}"` : ''}`;
      findings.push(possible ? {
        code: 'md_lua.payload_writer_unverified', severity: 'info', file: site.file, line: site.line, column: site.column,
        target: { file: possible.file, line: possible.line, column: possible.column },
        detail: possible.candidateOnly
          ? `${subject}. Lua assigns that key prefix using a local index, but Forge could not verify the index value or indexed key membership.`
          : `${subject}. Lua assigns that key, but Forge could not link the assignment to the table this reader receives.`,
      } : {
        code: 'md_lua.payload_missing_writer', severity: 'error', file: site.file, event,
        detail: `${subject}, but no matching Lua payload assignment was found.`,
      });
    }
    const legacyWriter = write.find(candidate => !candidate.candidateOnly && candidate.table === 'payload');
    if (legacyWriter && sites.length === 0) {
      findings.push({
        code: 'md_lua.payload_unused_writer', severity: 'error', file: legacyWriter.file,
        detail: `Lua writes indexed payload key "${key}<n>", but no project MD file reads param3.{'$${key}' + $si}.`,
      });
    }
  }
  for (const [identity, group] of unavailable) {
    const { event, reader, writer, localIndexOnlyCount, returnedCount, keys, readerPaths, writerPaths } = group;
    const sortedKeys = [...keys].sort();
    const sample = sortedKeys.slice(0, 8).map(key => key.length > 48 ? `${key.slice(0, 48)}…` : key);
    const remainder = keys.size > sample.length ? ` and ${keys.size - sample.length} more` : '';
    const indexDetail = localIndexOnlyCount
      ? ` Only local-index assignments were found for ${keys.size === 1 ? 'this key' : `${localIndexOnlyCount} of these ${keys.size} keys`}. Forge could not verify the index values.`
      : '';
    const unresolved = [
      group.bindingUnverified ? 'the builder binding' : '',
      group.forwardingUnverified ? 'event forwarding' : '',
    ].filter(Boolean).join(' and ');
    const returnedDetail = returnedCount && unresolved
      ? ` A returned table is passed to an authored callback for ${returnedCount} of these ${keys.size} ${keys.size === 1 ? 'key' : 'keys'}. Cross-file Lua prevents Forge from verifying ${unresolved}.`
      : '';
    findings.push({
      code: 'md_lua.payload_writer_unverified', severity: 'info', event: event.join('.'), sourceRef: `event_ui_triggered:${identity}`,
      file: reader.file, line: reader.line, column: reader.column,
      ...(writer ? { target: { file: writer.file, line: writer.line, column: writer.column } } : {}),
      ...(sortedKeys.length <= 64 && readerPaths.size + writerPaths.size <= 64
        ? { payloadWriterScope: { event, keys: sortedKeys, readerPaths: [...readerPaths].sort(), writerPaths: [...writerPaths].sort() } }
        : {}),
      detail: `Forge could not verify indexed Lua writers for MD screen ${JSON.stringify(event[0])}, control ${JSON.stringify(event[1])}. Indexed keys (${keys.size}): ${sample.join(', ')}${remainder}.${indexDetail}${returnedDetail}`,
    });
  }
  return {
    findings,
    reads: [...reads.entries()].flatMap(([key, sites]) => [
      ...sites.global.map(({ file, destination }) => ({ key, scope: 'global' as const, file, destination })),
      ...sites.verb.map(({ file, destination, branch }) => ({ key, scope: 'verb' as const, file, destination, branch })),
    ]),
    writes: luaWrites.map(({ key, file }) => ({ key, file })),
  };
}

export interface LuaEmitCoverage {
  file: string;
  parsed: boolean;
  exact: number;
  prefix: number;
  unresolved: number;
  reasons: Array<'dynamic-arguments' | 'prefix-only' | 'source-encoding' | 'ambiguous-callee'>;
}

function indexedPayloadTarget(variable: LuaAstNode, source: LuaAnalysisSource): { table: string; key: string; candidateOnly: boolean; localTableUses: number } | undefined {
  const table = luaIdentifier(variable.base);
  const index = variable.index;
  const counter = index?.right;
  if (!table || variable.type !== 'IndexExpression' || index?.type !== 'BinaryExpression' || index.operator !== '..') return undefined;
  const candidateOnly = counter?.type === 'Identifier' && counter.isLocal === true;
  if (!candidateOnly && (counter?.type !== 'MemberExpression' || counter.indexer !== '.' || luaIdentifier(counter.identifier) !== 'n'
    || luaIdentifier(counter.base) !== table || counter.base?.isLocal !== variable.base?.isLocal)) return undefined;
  const literal = index.left;
  if (literal?.type !== 'StringLiteral' || typeof literal.value !== 'string'
    || luaStringLiteralTainted(literal, source.substituted) || !/^[A-Za-z][A-Za-z0-9_]*$/.test(literal.value)) return undefined;
  let localTableUses = 0;
  walkLuaAst(variable, node => {
    if (node.isLocal === true && luaIdentifier(node) === table) localTableUses++;
  });
  return { table, key: literal.value, candidateOnly, localTableUses };
}

interface LuaPayloadPosition { scope?: LuaAstNode; branches: readonly LuaAstNode[]; at: number }
interface LuaPayloadAssignment extends LuaPayloadPosition {
  table: string; key: string; local: boolean; candidateOnly: boolean; localTableUses: number; location?: LuaAstNode['loc']; directValueBlock?: LuaAstNode;
  target: LuaAstNode;
}
interface LuaPayloadEmit extends LuaPayloadPosition {
  identities?: string[]; needsUnaliasedTable?: boolean; directBlock?: LuaAstNode;
}

function literalLuaTruthiness(node: LuaAstNode | undefined): boolean | undefined {
  if (node?.type === 'BooleanLiteral') return node.value === true;
  if (node?.type === 'NilLiteral') return false;
  if (node?.type === 'NumericLiteral' || node?.type === 'StringLiteral'
    || node?.type === 'TableConstructorExpression' || node?.type === 'FunctionDeclaration') return true;
  return undefined;
}

function localControlTruthiness(
  node: LuaAstNode | undefined,
  immutableLocal: (name: string) => LuaAstNode | undefined,
): boolean | undefined {
  for (let depth = 0; depth < 16; depth++) {
    const name = node?.isLocal === true ? luaIdentifier(node) : null;
    if (!name) return literalLuaTruthiness(node);
    const initializer = immutableLocal(name);
    if (initializer?.range?.[1] === undefined || node.range?.[0] === undefined || initializer.range[1] > node.range[0]) return undefined;
    node = initializer;
  }
  return undefined;
}

function finiteLuaControl(
  node: LuaAstNode | undefined,
  substituted: Uint8Array,
  immutableLocal: (name: string) => LuaAstNode | undefined,
  direct: boolean,
): LuaStringValue[] | undefined {
  const left = node?.left;
  if (node?.type !== 'LogicalExpression' || node.operator !== 'or'
    || left?.type !== 'LogicalExpression' || left.operator !== 'and') return undefined;
  const whenTrue = left.right;
  const whenFalse = node.right;
  if (whenTrue?.type !== 'StringLiteral' || typeof whenTrue.value !== 'string'
    || whenFalse?.type !== 'StringLiteral' || typeof whenFalse.value !== 'string') return undefined;
  const condition = left.left;
  const name = condition?.isLocal === true ? luaIdentifier(condition) : null;
  // Inline table values can evaluate arbitrary calls before the payload is emitted.
  if (condition?.type === 'TableConstructorExpression' && condition.fields?.length) return undefined;
  const truthy = localControlTruthiness(condition, immutableLocal);
  if (truthy === undefined && (!name || !direct)) return undefined;
  const first = { value: whenTrue.value, prefix: false, tainted: luaStringLiteralTainted(whenTrue, substituted) };
  const second = { value: whenFalse.value, prefix: false, tainted: luaStringLiteralTainted(whenFalse, substituted) };
  if (truthy !== undefined) return [truthy ? first : second];
  if (first.value === second.value) return [{ ...first, tainted: first.tainted || second.tainted }];
  return [first, second];
}

function unaliasedLuaPayloads(
  ast: unknown,
  emitsByTable: ReadonlyMap<string, LuaPayloadEmit[]>,
  writes: readonly LuaPayloadAssignment[],
  clears: readonly LuaPayloadAssignment[],
): Set<string> {
  const remainingUses = new Map<string, number>();
  for (const [table, emits] of emitsByTable) {
    if (emits.length === 1 && emits[0].needsUnaliasedTable) remainingUses.set(table, 2); // Declaration and emit argument.
  }
  if (!remainingUses.size) return new Set();
  for (const edits of [writes, clears]) {
    for (const edit of edits) {
      const remaining = edit.local ? remainingUses.get(edit.table) : undefined;
      if (remaining !== undefined) remainingUses.set(edit.table, remaining + edit.localTableUses);
    }
  }
  walkLuaAst(ast, node => {
    const name = node.isLocal === true ? luaIdentifier(node) : null;
    const remaining = name ? remainingUses.get(name) : undefined;
    if (remaining !== undefined) remainingUses.set(name, remaining - 1);
  });
  return new Set([...remainingUses].filter(([, remaining]) => remaining === 0).map(([table]) => table));
}


interface LuaProtectedPayloadSend {
  call: LuaAstNode;
  caller?: LuaAstNode;
  table: LuaAstNode;
  identity: string;
}

interface LuaReturnedPayloadLink {
  root: string; member: string; identity: string;
  bindingUnverified?: boolean; forwardingUnverified?: boolean;
}

function luaMemberName(node: LuaAstNode | undefined): string | undefined {
  if (node?.type === 'MemberExpression') return luaIdentifier(node.identifier) ?? undefined;
  if (node?.type === 'IndexExpression' && typeof node.index?.value === 'string') return node.index.value;
  return undefined;
}

function globalLuaMember(node: LuaAstNode | undefined): { root: string; member: string } | undefined {
  if (node?.indexer !== '.' || node.base?.isLocal !== false) return undefined;
  const root = luaIdentifier(node.base);
  const member = luaMemberName(node);
  return root && member ? { root, member } : undefined;
}

function scanLuaScope(root: LuaAstNode) {
  const nodes: LuaAstNode[] = [];
  const parents = new Map<LuaAstNode, LuaAstNode>();
  walkLuaAst(root, (node, _scope, _branches, parent) => {
    nodes.push(node);
    if (parent) parents.set(node, parent);
  });
  return { nodes, parents };
}

function luaContains(outer: LuaAstNode | undefined, node: LuaAstNode): boolean {
  return !!outer?.range && !!node.range && outer.range[0] <= node.range[0] && node.range[1] <= outer.range[1];
}

function luaPossibleTableWrite(node: LuaAstNode, parents: ReadonlyMap<LuaAstNode, LuaAstNode>): boolean {
  for (let child = node, parent = parents.get(child); parent; child = parent, parent = parents.get(child)) {
    const condition = parent.condition as LuaAstNode | undefined;
    if (['IfClause', 'ElseifClause', 'WhileStatement'].includes(parent.type ?? '') && literalLuaTruthiness(condition) === false) return false;
    if (parent.type === 'ForNumericStatement') {
      const from = parent.start as LuaAstNode | undefined;
      const to = parent.end as LuaAstNode | undefined;
      const step = parent.step as LuaAstNode | undefined;
      if (from?.type === 'NumericLiteral' && to?.type === 'NumericLiteral' && (!step || step.type === 'NumericLiteral')
        && typeof from.value === 'number' && typeof to.value === 'number' && (!step || typeof step.value === 'number')) {
        const delta = typeof step?.value === 'number' ? step.value : 1;
        if ((delta > 0 && from.value > to.value) || (delta < 0 && from.value < to.value)) return false;
      }
    }
    if (parent.type === 'IfStatement') {
      for (const clause of parent.clauses as LuaAstNode[]) {
        if (clause === child) break;
        if (literalLuaTruthiness(clause.condition as LuaAstNode) === true) return false;
      }
    }
  }
  return true;
}

function inspectLuaTable(
  scan: ReturnType<typeof scanLuaScope>,
  declaration: LuaAstNode,
  lastUse: LuaAstNode,
  source: LuaAnalysisSource,
  allowAliases: boolean,
) {
  const { nodes, parents } = scan;
  const root = declaration.variables?.[0];
  const name = luaIdentifier(root);
  const block = parents.get(declaration);
  if (!name || declaration.variables?.length !== 1 || declaration.init?.length !== 1 || !block?.body?.includes(declaration)) return;
  const visible = (declaration: LuaAstNode, node: LuaAstNode) =>
    node.range![0] >= declaration.range![1] && luaContains(parents.get(declaration), node);
  const bindings = new Map<string, LuaAstNode>([[name, declaration]]);
  const allowed = new Set([root, lastUse]);
  if (allowAliases) {
    for (const node of nodes) {
      if (node.type !== 'LocalStatement' || node.variables?.length !== 1 || node.init?.length !== 1 || !visible(declaration, node)) continue;
      const alias = node.variables[0];
      const init = node.init[0];
      const aliasName = luaIdentifier(alias);
      if (!aliasName || init.isLocal !== true || luaIdentifier(init) !== name) continue;
      if (bindings.has(aliasName) || !parents.get(node)?.body?.includes(node)) return;
      bindings.set(aliasName, node);
      allowed.add(alias);
      allowed.add(init);
    }
  }
  const indexed = new Map<LuaAstNode, string>();
  const cleared = new Set<string>();
  const fields = new Set<string>();
  for (const node of nodes) {
    if (!luaContains(block, node) || node.range![0] < declaration.range![0]) continue;
    if (node.type === 'GotoStatement') return;
    const binding = node.isLocal === true ? bindings.get(luaIdentifier(node) ?? '') : undefined;
    if (!binding || allowed.has(node)) continue;
    if (!visible(binding, node)) return;
    const access = parents.get(node);
    if (access?.base !== node || (access.type !== 'MemberExpression' && access.type !== 'IndexExpression') || access.indexer === ':') return;
    for (let parent = parents.get(access); parent && parent !== block; parent = parents.get(parent)) {
      if (parent.type === 'FunctionDeclaration') return;
    }
    const statement = parents.get(access);
    if (statement?.type !== 'AssignmentStatement' && statement?.type !== 'FunctionDeclaration') continue;
    const position = statement.variables?.indexOf(access) ?? -1;
    if (position < 0 && statement.identifier !== access) continue;
    const target = indexedPayloadTarget(access, source);
    if (target) {
      const value = statement.init?.[position];
      if (!target.candidateOnly && value && value.type !== 'NilLiteral' && luaPossibleTableWrite(statement, parents)) {
        indexed.set(access, target.key);
      } else {
        cleared.add(target.key);
      }
    } else {
      const field = luaMemberName(access);
      if (field === undefined) return;
      fields.add(field);
    }
  }
  return { indexed, cleared, fields };
}

function luaTableChangesKey(fields: ReadonlySet<string>, key: string): boolean {
  for (const field of fields) if (field.startsWith(key) && /^\d+$/.test(field.slice(key.length))) return true;
  return false;
}

function linkReturnedLuaPayloads(
  ast: LuaAstNode,
  sends: readonly LuaProtectedPayloadSend[],
  initializers: ReadonlyMap<LuaAstNode | undefined, readonly LuaAstNode[]>,
  source: LuaAnalysisSource,
) {
  const links = new Map<LuaAstNode, LuaReturnedPayloadLink[]>();
  if (!sends.length) return links;
  const definitions = new Map<string, LuaAstNode>();
  for (const statement of ast.body ?? []) {
    const builder = statement.type === 'FunctionDeclaration' ? globalLuaMember(statement.identifier) : undefined;
    const first = statement.body?.[0];
    const last = statement.body?.at(-1);
    if (builder && first?.type === 'LocalStatement' && first.init?.[0]?.type === 'TableConstructorExpression'
      && last?.type === 'ReturnStatement' && last.arguments?.length === 1 && last.arguments[0].isLocal === true
      && luaIdentifier(last.arguments[0]) === luaIdentifier(first.variables?.[0])) {
      definitions.set(builder.root + '.' + builder.member, statement);
    }
  }
  if (!definitions.size) return links;
  const scans = new Map<LuaAstNode, ReturnType<typeof scanLuaScope>>();
  const scan = (node: LuaAstNode) => {
    let result = scans.get(node);
    if (!result) scans.set(node, result = scanLuaScope(node));
    return result;
  };
  const builders = new Map<LuaAstNode, ReturnType<typeof inspectLuaTable>>();
  for (const send of sends) {
    const name = luaIdentifier(send.table);
    const potential = initializers.get(send.caller)?.some(node => {
      if (node.range![1] >= send.call.range![0] || luaIdentifier(node.variables?.[0]) !== name) return false;
      const member = globalLuaMember(node.init?.[0]?.base);
      return member && definitions.has(member.root + '.' + member.member);
    });
    if (!potential) continue;
    const context = scan(send.caller ?? ast);
    const locals = context.nodes.filter(node => node.type === 'LocalStatement'
      && node.range![1] < send.call.range![0] && luaContains(context.parents.get(node), send.call)
      && node.variables?.some(variable => luaIdentifier(variable) === name));
    if (locals.length !== 1) continue;
    const declaration = locals[0];
    const call = declaration.init?.[0];
    const member = call?.type === 'CallExpression' ? globalLuaMember(call.base) : undefined;
    if (!member) continue;
    const builder = definitions.get(member.root + '.' + member.member);
    if (!builder || builder.range![1] >= call!.range![0]) continue;
    const receiver = inspectLuaTable(context, declaration, send.table, source, false);
    if (!receiver || receiver.indexed.size || receiver.cleared.size || receiver.fields.has('n')) continue;
    if (!builders.has(builder)) {
      const origin = scan(builder);
      const first = builder.body?.[0];
      const returns = origin.nodes.filter(node => node.type === 'ReturnStatement');
      const out = returns[0]?.arguments;
      const owner = returns.length === 1 && returns[0] === builder.body?.at(-1) && out?.length === 1
        && out[0].isLocal === true && luaIdentifier(out[0]) === luaIdentifier(first?.variables?.[0]);
      builders.set(builder, first?.type === 'LocalStatement' && first.init?.[0]?.type === 'TableConstructorExpression' && owner
        ? inspectLuaTable(origin, first, out![0], source, true) : undefined);
    }
    const built = builders.get(builder);
    if (!built) continue;
    for (const [site, key] of built.indexed) {
      if (built.cleared.has(key) || luaTableChangesKey(built.fields, key) || luaTableChangesKey(receiver.fields, key)) continue;
      const known = links.get(site) ?? [];
      known.push({ ...member, identity: send.identity });
      links.set(site, known);
    }
  }
  return links;
}

interface LuaBuilderMutationFacts {
  members: Map<string, number>;
  replacedRoots: Set<string>;
  opaqueGlobals: boolean;
}

function readLuaNamespace(node: LuaAstNode | undefined, rawgetAvailable: boolean): string | undefined {
  if (node?.isLocal === false && node.type === 'Identifier') return luaIdentifier(node) ?? undefined;
  if (rawgetAvailable && node?.type === 'CallExpression' && node.base?.isLocal === false
    && luaIdentifier(node.base) === 'rawget' && node.arguments?.length === 2 && isLuaGlobalEnvironment(node.arguments[0])
    && typeof node.arguments[1].value === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(node.arguments[1].value)) {
    return node.arguments[1].value;
  }
  return undefined;
}

function preserveLuaNamespace(root: string, value: LuaAstNode | undefined, rawgetAvailable: boolean): boolean {
  return value?.type === 'LogicalExpression' && value.operator === 'or' && value.right?.type === 'TableConstructorExpression'
    && readLuaNamespace(value.left, rawgetAvailable) === root;
}

interface LuaFiniteRegistryCandidate {
  targetRoot: string;
  registryRoot: string;
  registryMember: string;
  memberKeys: string[];
  propName: string;
}

interface LuaEmitterWrapperCandidate {
  kind: 'inline' | 'factory' | 'unverified';
  prevName?: string;
  wrapperAst?: LuaAstNode;
  substituted?: Uint8Array;
  factoryRoot?: string;
  factoryMember?: string;
}

interface LuaQualifiedFunctionDef {
  root: string;
  member: string;
  ast: LuaAstNode;
  aliasRoots: ReadonlyMap<string, string>;
  concatAliases: ReadonlySet<string>;
  substituted: Uint8Array;
}

interface LuaPendingRegistryArgCheck {
  registryKey: string;
  calleeKey: string;
  argIndex: number;
}

interface LuaRegistryRowFact {
  fields: ReadonlyMap<string, string | null>;
  dynamicFields: ReadonlySet<string>;
  hasComputedKey: boolean;
}

interface LuaBuilderMutationFacts {
  members: Map<string, number>;
  replacedRoots: Set<string>;
  opaqueGlobals: boolean;
  ambiguousBuiltins: Set<string>;
  registryDefs: Map<string, LuaRegistryRowFact[]>;
  registryCandidates: LuaFiniteRegistryCandidate[];
  unsafeRegistries: Set<string>;
  pendingRegistryArgChecks: LuaPendingRegistryArgCheck[];
  emitterWrappers: LuaEmitterWrapperCandidate[];
  qualifiedFunctions: Map<string, LuaQualifiedFunctionDef>;
}

const PURE_READ_BUILTINS = new Set(['type', 'tostring', 'tonumber', 'ipairs', 'pairs', 'next', 'rawget']);

function luaStaticString(node: LuaAstNode | undefined, substituted: Uint8Array): string | undefined {
  if (node?.type !== 'StringLiteral' || typeof node.value !== 'string') return undefined;
  if (luaStringLiteralTainted(node, substituted)) return undefined;
  return node.value;
}

function luaConjunctionEventFilter(
  condition: LuaAstNode | undefined,
  screenParam: string,
  controlParam: string,
  substituted: Uint8Array,
): { screen?: string; control?: string } | undefined {
  const result: { screen?: string; control?: string } = {};
  const collect = (expr: LuaAstNode | undefined): void => {
    if (!expr) return;
    if (expr.type === 'LogicalExpression' && expr.operator === 'and') {
      collect(expr.left);
      collect(expr.right);
      return;
    }
    if (expr.type === 'BinaryExpression' && expr.operator === '==') {
      const checkPair = (idNode: LuaAstNode | undefined, litNode: LuaAstNode | undefined) => {
        if (!idNode?.isLocal || !litNode) return;
        const lit = luaStaticString(litNode, substituted);
        if (lit === undefined) return;
        const id = luaIdentifier(idNode);
        if (id === screenParam) result.screen = lit;
        else if (id === controlParam) result.control = lit;
      };
      checkPair(expr.left, expr.right);
      checkPair(expr.right, expr.left);
    }
  };
  collect(condition);
  return result.screen !== undefined || result.control !== undefined ? result : undefined;
}

function isLuaParamReadOnlyInFunction(
  fnKey: string,
  argIndex: number,
  qualifiedFunctions: ReadonlyMap<string, LuaQualifiedFunctionDef>,
  members: ReadonlyMap<string, number>,
  replacedRoots: ReadonlySet<string>,
  visited: Set<string>,
): boolean {
  const visitKey = `${fnKey}#${argIndex}`;
  if (visited.has(visitKey)) return true;
  if (visited.size >= 8) return false;
  const dot = fnKey.indexOf('.');
  if (dot <= 0) return false;
  const member = fnKey.slice(dot + 1);
  if (members.get(member) !== 1 || replacedRoots.has(fnKey.slice(0, dot))) return false;
  const def = qualifiedFunctions.get(fnKey);
  if (!def) return false;
  const paramNode = def.ast.parameters?.[argIndex];
  const paramName = paramNode ? luaIdentifier(paramNode) : null;
  if (!paramName) return false;

  visited.add(visitKey);
  const scan = scanLuaScope(def.ast);
  const trackedLocals = new Set<string>([paramName]);
  let mutatedOrEscaped = false;

  // Track safe read-only loop elements from ipairs(param [or ...]) without allowing writes or escapes.
  const loopElems = new Set<string>();
  const refersTracked = (node: LuaAstNode | undefined): boolean => {
    if (!node) return false;
    const name = node.isLocal === true ? luaIdentifier(node) : null;
    if (name && (trackedLocals.has(name) || loopElems.has(name))) return true;
    if (node.type === 'LogicalExpression' && (node.operator === 'or' || node.operator === 'and')) {
      return refersTracked(node.left) || refersTracked(node.right);
    }
    return false;
  };
  const containsTracked = (node: LuaAstNode | undefined): boolean => {
    let found = false;
    walkLuaAst(node, sub => {
      if (sub.type === 'FunctionDeclaration') return;
      const name = sub.isLocal === true ? luaIdentifier(sub) : null;
      if (name && (trackedLocals.has(name) || loopElems.has(name))) found = true;
    });
    return found;
  };

  const mutatesTrackedTarget = (node: LuaAstNode | undefined): boolean => {
    for (let cur = node; cur; cur = cur.base) {
      const name = cur.isLocal === true ? luaIdentifier(cur) : null;
      if (name && (trackedLocals.has(name) || loopElems.has(name))) return true;
    }
    return false;
  };
  const escapesTrackedTable = (node: LuaAstNode | undefined): boolean => {
    if (!node) return false;
    const name = node.isLocal === true ? luaIdentifier(node) : null;
    if (name && (trackedLocals.has(name) || loopElems.has(name))) return true;
    if (node.type === 'TableConstructorExpression') {
      return (node.fields ?? []).some(f => escapesTrackedTable(f.value as LuaAstNode | undefined));
    }
    if (node.type === 'LogicalExpression') {
      return escapesTrackedTable(node.left) || escapesTrackedTable(node.right);
    }
    return false;
  };

  for (const node of scan.nodes) {
    if (node.type === 'ForGenericStatement') {
      const iter = node.iterators?.[0];
      const iterBase = iter?.type === 'CallExpression' ? luaIdentifier(iter.base) : null;
      if ((iterBase === 'ipairs' || iterBase === 'pairs') && iter?.arguments?.length === 1 && refersTracked(iter.arguments[0])) {
        const elem = node.variables?.[1] ?? node.variables?.[0];
        const elemName = elem ? luaIdentifier(elem) : null;
        if (elemName && elemName !== '_') loopElems.add(elemName);
      }
      continue;
    }
    if (node.type === 'LocalStatement') {
      (node.variables || []).forEach((variable, idx) => {
        const name = luaIdentifier(variable);
        const init = node.init?.[idx];
        if (name && (trackedLocals.has(name) || loopElems.has(name))) mutatedOrEscaped = true;
        else if (init && escapesTrackedTable(init)) mutatedOrEscaped = true;
      });
      if (mutatedOrEscaped) return false;
      continue;
    }
    if (node.type === 'AssignmentStatement') {
      for (const target of node.variables || []) {
        if (mutatesTrackedTarget(target)) return false;
      }
      for (const init of node.init || []) {
        if (escapesTrackedTable(init)) return false;
      }
      continue;
    }
    if (node.type === 'ReturnStatement') {
      if ((node.arguments || []).some(arg => escapesTrackedTable(arg))) return false;
      continue;
    }
    if (node.type === 'CallExpression') {
      const args = node.arguments || [];
      args.forEach((arg, idx) => {
        if (!containsTracked(arg)) return;
        // Allow pure field reads passed as expressions like `tonumber(e.every)`.
        const argName = arg.isLocal === true ? luaIdentifier(arg) : null;
        if (!argName || (!trackedLocals.has(argName) && !loopElems.has(argName))) return;
        const directBuiltin = arg.type === 'Identifier' && node.base?.isLocal === false
          ? luaIdentifier(node.base) : null;
        if (directBuiltin && PURE_READ_BUILTINS.has(directBuiltin)) return;
        const baseName = node.base?.type === 'MemberExpression' && node.base.indexer === '.'
          ? luaIdentifier(node.base.base) : null;
        const memberName = node.base?.type === 'MemberExpression' && node.base.indexer === '.'
          ? luaIdentifier(node.base.identifier) : null;
        const resolvedBase = baseName
          ? (node.base?.base?.isLocal === false ? baseName : def.aliasRoots.get(baseName))
          : undefined;
        if (!resolvedBase || !memberName
          || !isLuaParamReadOnlyInFunction(`${resolvedBase}.${memberName}`, idx, qualifiedFunctions, members, replacedRoots, visited)) {
          mutatedOrEscaped = true;
        }
      });
      if (mutatedOrEscaped) return false;
    }
  }
  return !mutatedOrEscaped;
}

function resolveFiniteRegistries(
  emitAnalyses: ReadonlyArray<{ mutations: LuaBuilderMutationFacts }>,
  baseMembers: Map<string, number>,
  baseReplacedRoots: Set<string>,
): void {
  const baseMemberCounts = new Map(baseMembers);
  const opaqueGlobals = emitAnalyses.some(analysis => analysis.mutations.opaqueGlobals);
  const qualifiedFunctions = new Map<string, LuaQualifiedFunctionDef>();
  const registryDefs = new Map<string, LuaRegistryRowFact[]>();
  const unsafeRegistries = new Set<string>();
  const pendingArgChecks: LuaPendingRegistryArgCheck[] = [];
  const allCandidates: LuaFiniteRegistryCandidate[] = [];
  let unsafeEnvForRegistry = opaqueGlobals || baseReplacedRoots.has('rawget');

  for (const { mutations } of emitAnalyses) {
    if (mutations.ambiguousBuiltins.has('ipairs') || mutations.ambiguousBuiltins.has('type')
      || mutations.ambiguousBuiltins.has('rawget')) {
      unsafeEnvForRegistry = true;
    }
    for (const [k, def] of mutations.qualifiedFunctions) {
      if (!qualifiedFunctions.has(k)) qualifiedFunctions.set(k, def);
    }
    for (const [k, rows] of mutations.registryDefs) {
      if (!registryDefs.has(k)) registryDefs.set(k, rows);
    }
    for (const k of mutations.unsafeRegistries) unsafeRegistries.add(k);
    pendingArgChecks.push(...mutations.pendingRegistryArgChecks);
    allCandidates.push(...mutations.registryCandidates);
  }

  for (const candidate of allCandidates) {
    const regKey = `${candidate.registryRoot}.${candidate.registryMember}`;
    const argChecks = pendingArgChecks.filter(item => item.registryKey === regKey);
    const argsReadOnly = !unsafeEnvForRegistry
      && baseMemberCounts.get(candidate.registryMember) === 1
      && !baseReplacedRoots.has(candidate.registryRoot)
      && !baseReplacedRoots.has(candidate.targetRoot)
      && !unsafeRegistries.has(regKey)
      && argChecks.every(check => isLuaParamReadOnlyInFunction(
        check.calleeKey,
        check.argIndex,
        qualifiedFunctions,
        baseMemberCounts,
        baseReplacedRoots,
        new Set<string>(),
      ));
    if (!argsReadOnly) {
      baseReplacedRoots.add(candidate.targetRoot);
      continue;
    }
    for (const memberKey of candidate.memberKeys) {
      baseMembers.set(memberKey, (baseMembers.get(memberKey) ?? 0) + 1);
    }
  }
}

function isStringOnlyLeafCleaner(
  fnKey: string,
  qualifiedFunctions: ReadonlyMap<string, LuaQualifiedFunctionDef>,
  members: ReadonlyMap<string, number>,
  replacedRoots: ReadonlySet<string>,
): boolean {
  const dot = fnKey.indexOf('.');
  if (dot <= 0) return false;
  const member = fnKey.slice(dot + 1);
  if (members.get(member) !== 1 || replacedRoots.has(fnKey.slice(0, dot))) return false;
  const def = qualifiedFunctions.get(fnKey);
  if (!def || !def.ast.parameters?.length) return false;
  const strParam = luaIdentifier(def.ast.parameters[0]);
  if (!strParam) return false;

  // Locate immutable local aliases for table.concat (file-level or function-local).
  const concatLocals = new Set<string>(def.concatAliases);
  const scan = scanLuaScope(def.ast);
  for (const node of scan.nodes) {
    if (node.type === 'AssignmentStatement') {
      for (const v of node.variables || []) {
        const nm = v.isLocal === true ? luaIdentifier(v) : null;
        if (nm === strParam) return false;
        if (nm) concatLocals.delete(nm);
      }
    }
    if (node.type === 'LocalStatement') {
      (node.variables || []).forEach((v, idx) => {
        const name = luaIdentifier(v);
        const init = node.init?.[idx];
        if (!name) return;
        if (init?.type === 'MemberExpression' && init.indexer === '.'
          && init.base?.isLocal === false && luaIdentifier(init.base) === 'table'
          && luaIdentifier(init.identifier) === 'concat') {
          concatLocals.add(name);
        } else {
          concatLocals.delete(name);
        }
      });
    }
  }
  const returns = scan.nodes.filter(n => n.type === 'ReturnStatement');
  if (returns.length === 0) return false;
  return returns.every(ret => {
    const val = ret.arguments?.[0];
    if (!val) return false;
    if (val.isLocal === true && luaIdentifier(val) === strParam) return true;
    if (val.type === 'StringLiteral') return true;
    if (val.type === 'CallExpression') {
      const callee = val.base?.isLocal === true ? luaIdentifier(val.base) : null;
      if (callee && concatLocals.has(callee)) return true;
      if (val.base?.type === 'MemberExpression' && val.base.indexer === '.'
        && val.base.base?.isLocal === false && luaIdentifier(val.base.base) === 'table'
        && luaIdentifier(val.base.identifier) === 'concat') return true;
    }
    return false;
  });
}

function isTypeCheck(node: LuaAstNode | undefined, targetName: string, expectedType: string): boolean {
  if (node?.type !== 'BinaryExpression' || node.operator !== '==') return false;
  const check = (callNode: LuaAstNode | undefined, strNode: LuaAstNode | undefined) =>
    callNode?.type === 'CallExpression' && callNode.base?.isLocal === false
    && luaIdentifier(callNode.base) === 'type' && callNode.arguments?.length === 1
    && callNode.arguments[0].isLocal === true && luaIdentifier(callNode.arguments[0]) === targetName
    && strNode?.type === 'StringLiteral' && strNode.value === expectedType;
  return check(node.left, node.right) || check(node.right, node.left);
}

function verifyIdentityPreservingTableCleaner(
  fnKey: string,
  qualifiedFunctions: ReadonlyMap<string, LuaQualifiedFunctionDef>,
  members: ReadonlyMap<string, number>,
  replacedRoots: ReadonlySet<string>,
): boolean {
  const dot = fnKey.indexOf('.');
  if (dot <= 0) return false;
  const member = fnKey.slice(dot + 1);
  if (members.get(member) !== 1 || replacedRoots.has(fnKey.slice(0, dot))) return false;
  const def = qualifiedFunctions.get(fnKey);
  if (!def || !def.ast.parameters?.length) return false;
  const tblParam = luaIdentifier(def.ast.parameters[0]);
  if (!tblParam) return false;

  const scan = scanLuaScope(def.ast);
  const loopKeyVars = new Set<string>();
  const loopValVars = new Set<string>();
  const cleanResultLocals = new Set<string>();
  let unsafe = false;

  for (const node of scan.nodes) {
    if (node.type === 'FunctionDeclaration' && node !== def.ast) return false;
    if (node.type === 'ForGenericStatement') {
      const iter = node.iterators?.[0];
      if (iter?.type === 'CallExpression' && iter.base?.isLocal === false && luaIdentifier(iter.base) === 'pairs'
        && iter.arguments?.length === 1 && iter.arguments[0].isLocal === true && luaIdentifier(iter.arguments[0]) === tblParam) {
        const k = node.variables?.[0] ? luaIdentifier(node.variables[0]) : null;
        const v = node.variables?.[1] ? luaIdentifier(node.variables[1]) : null;
        if (k) loopKeyVars.add(k);
        if (v) loopValVars.add(v);
      }
    }
  }

  for (const node of scan.nodes) {
    if (node.type === 'ReturnStatement') {
      const arg = node.arguments?.[0];
      if (!arg) return false;
      if (arg.isLocal === true && luaIdentifier(arg) === tblParam) continue;
      // Non-table string return allowed only directly inside `if type(p) == "string"` calling verified LeafCleaner.
      const parent = scan.parents.get(node);
      if (parent?.type !== 'IfClause' || !isTypeCheck(parent.condition as LuaAstNode, tblParam, 'string')) return false;
      const argName = arg.isLocal === true ? luaIdentifier(arg) : null;
      if (!argName) return false;
      const defLocal = parent.body?.find(st => st.type === 'LocalStatement'
        && st.variables?.some(v => luaIdentifier(v) === argName));
      const init = defLocal?.init?.[0];
      if (init?.type !== 'CallExpression' || init.base?.type !== 'MemberExpression' || init.base.indexer !== '.') return false;
      const baseName = luaIdentifier(init.base.base);
      const leafMember = luaIdentifier(init.base.identifier);
      const leafRoot = baseName ? (init.base.base?.isLocal === false ? baseName : def.aliasRoots.get(baseName)) : undefined;
      if (!leafRoot || !leafMember || !isStringOnlyLeafCleaner(`${leafRoot}.${leafMember}`, qualifiedFunctions, members, replacedRoots)) {
        return false;
      }
      continue;
    }
    if (node.type === 'LocalStatement') {
      const firstInit = node.init?.[0];
      if (firstInit?.type === 'CallExpression' && firstInit.base?.type === 'MemberExpression' && firstInit.base.indexer === '.') {
        const b = luaIdentifier(firstInit.base.base);
        const m = luaIdentifier(firstInit.base.identifier);
        const r = b ? (firstInit.base.base?.isLocal === false ? b : def.aliasRoots.get(b)) : undefined;
        const arg0 = firstInit.arguments?.[0];
        if (r === def.root && m === def.member && arg0?.isLocal === true && loopValVars.has(luaIdentifier(arg0) ?? '')) {
          const outName = node.variables?.[0] ? luaIdentifier(node.variables[0]) : null;
          if (outName) cleanResultLocals.add(outName);
        }
      }
      for (const v of node.variables || []) {
        if (v.isLocal === true && luaIdentifier(v) === tblParam) return false;
      }
      continue;
    }
    if (node.type === 'AssignmentStatement') {
      for (const v of node.variables || []) {
        if (v.isLocal === true && luaIdentifier(v) === tblParam) return false;
        let hitsTblParam = false;
        for (let cur: LuaAstNode | undefined = v.base; cur; cur = cur.base) {
          if (cur.isLocal === true && luaIdentifier(cur) === tblParam) { hitsTblParam = true; break; }
        }
        if (hitsTblParam) {
          if (v.type !== 'IndexExpression' || v.base?.isLocal !== true || luaIdentifier(v.base) !== tblParam) return false;
          const idxName = v.index?.isLocal === true ? luaIdentifier(v.index) : null;
          const pos = node.variables?.indexOf(v) ?? -1;
          const rhs = pos >= 0 ? node.init?.[pos] : undefined;
          const rhsName = rhs?.isLocal === true ? luaIdentifier(rhs) : null;
          // Must write only non-nil cleaned value from recursive cleaner guarded by string-or-table type check.
          let insideLoop = false;
          let insideStringTableGuard = false;
          const valVar = loopValVars.size === 1 ? [...loopValVars][0] : undefined;
          for (let cur = scan.parents.get(node); cur && cur !== def.ast; cur = scan.parents.get(cur)) {
            if (cur.type === 'ForGenericStatement') insideLoop = true;
            if (cur.type === 'IfClause' && valVar) {
              const cond = cur.condition as LuaAstNode | undefined;
              const isStrOrTbl = cond?.type === 'LogicalExpression' && cond.operator === 'or'
                && ((isTypeCheck(cond.left, valVar, 'string') && isTypeCheck(cond.right, valVar, 'table'))
                  || (isTypeCheck(cond.left, valVar, 'table') && isTypeCheck(cond.right, valVar, 'string')));
              if (isStrOrTbl) insideStringTableGuard = true;
            }
          }
          if (!idxName || !loopKeyVars.has(idxName) || !rhsName || !cleanResultLocals.has(rhsName) || !insideLoop || !insideStringTableGuard) {
            unsafe = true;
          }
        }
      }
      if (unsafe) return false;
    }
  }
  return !unsafe;
}

function verifyProjectEmitterForwarding(
  emitAnalyses: ReadonlyArray<{ mutations: LuaBuilderMutationFacts }>,
  members: ReadonlyMap<string, number>,
  replacedRoots: ReadonlySet<string>,
  targetEventIdentity: string,
): boolean {
  const allWrappers: LuaEmitterWrapperCandidate[] = [];
  const qualifiedFunctions = new Map<string, LuaQualifiedFunctionDef>();
  for (const { mutations } of emitAnalyses) {
    if (mutations.opaqueGlobals || mutations.ambiguousBuiltins.has('pcall')
      || mutations.ambiguousBuiltins.has('pairs') || mutations.ambiguousBuiltins.has('type')
      || mutations.ambiguousBuiltins.has('rawget')) {
      return false;
    }
    for (const [k, def] of mutations.qualifiedFunctions) {
      if (!qualifiedFunctions.has(k)) qualifiedFunctions.set(k, def);
    }
    allWrappers.push(...mutations.emitterWrappers);
  }
  if (!replacedRoots.has('AddUITriggeredEvent')) return !replacedRoots.has('pcall');
  if (allWrappers.length === 0 || replacedRoots.has('pcall') || replacedRoots.has('rawget')) return false;

  const targetPair = JSON.parse(targetEventIdentity) as [string, string];
  const [targetScreen, targetControl] = targetPair;

  for (const wrapper of allWrappers) {
    if (wrapper.kind === 'unverified') return false;
    let wrapperAst = wrapper.wrapperAst;
    let prevName = wrapper.prevName;
    let defAliasRoots: ReadonlyMap<string, string> = new Map();
    let wrapperSubstituted = wrapper.substituted ?? new Uint8Array(0);

    if (wrapper.kind === 'factory') {
      if (!wrapper.factoryRoot || !wrapper.factoryMember || replacedRoots.has(wrapper.factoryRoot)
        || members.get(wrapper.factoryMember) !== 1) return false;
      const factoryDef = qualifiedFunctions.get(`${wrapper.factoryRoot}.${wrapper.factoryMember}`);
      if (!factoryDef || factoryDef.ast.parameters?.length !== 1) return false;
      const factoryPrev = luaIdentifier(factoryDef.ast.parameters[0]);
      if (!factoryPrev || factoryDef.ast.body?.length !== 1) return false;
      const ret = factoryDef.ast.body[0];
      if (ret?.type !== 'ReturnStatement' || ret.arguments?.length !== 1 || ret.arguments[0].type !== 'FunctionDeclaration') return false;
      prevName = factoryPrev;
      wrapperAst = ret.arguments[0];
      defAliasRoots = factoryDef.aliasRoots;
      wrapperSubstituted = factoryDef.substituted;
    }
    if (!wrapperAst || !prevName) return false;
    const params = wrapperAst.parameters ?? [];
    if (params.length < 3 || params.length > 4) return false;
    const screenParam = luaIdentifier(params[0]);
    const controlParam = luaIdentifier(params[1]);
    const paramParam = luaIdentifier(params[2]);
    if (!screenParam || !controlParam || !paramParam || new Set([screenParam, controlParam, paramParam, prevName]).size !== 4) return false;
    if (params.length === 4 && params[3].type !== 'VarargLiteral') return false;

    const body = wrapperAst.body ?? [];
    if (body.length === 0) return false;
    const last = body[body.length - 1];
    if (last?.type !== 'ReturnStatement' || last.arguments?.length !== 1) return false;
    const tailCall = last.arguments[0];
    if (tailCall?.type !== 'CallExpression' || tailCall.base?.isLocal !== true || luaIdentifier(tailCall.base) !== prevName) return false;
    const tailArgs = tailCall.arguments ?? [];
    if (tailArgs.length !== params.length
      || luaIdentifier(tailArgs[0]) !== screenParam
      || luaIdentifier(tailArgs[1]) !== controlParam
      || luaIdentifier(tailArgs[2]) !== paramParam
      || (params.length === 4 && tailArgs[3]?.type !== 'VarargLiteral')) return false;

    // Inspect prefix statements (everything before unconditional final `return prev(screen, control, param, ...)`).
    const prefix = body.slice(0, -1);
    const scanPrefix = scanLuaScope({ type: 'Block', body: prefix });
    const innerReturns = scanPrefix.nodes.some(n => n.type === 'ReturnStatement' || n.type === 'FunctionDeclaration');
    if (innerReturns) return false;
    const altersRoutingParams = scanPrefix.nodes.some(n => {
      if (n.type !== 'AssignmentStatement' && n.type !== 'LocalStatement') return false;
      return (n.variables || []).some(v => {
        const nm = luaIdentifier(v);
        return nm === screenParam || nm === controlParam || nm === prevName;
      });
    });
    if (altersRoutingParams) return false;

    // Resolve immutable file-level aliases in addition to local ones for factory vs inline file context.
    const resolveCleanerCall = (callExpr: LuaAstNode | undefined, aliasMap: ReadonlyMap<string, string>): string | undefined => {
      if (callExpr?.type !== 'CallExpression' || callExpr.base?.type !== 'MemberExpression' || callExpr.base.indexer !== '.') return undefined;
      const baseId = luaIdentifier(callExpr.base.base);
      const memberId = luaIdentifier(callExpr.base.identifier);
      const root = baseId ? (callExpr.base.base?.isLocal === false ? baseId : aliasMap.get(baseId)) : undefined;
      return root && memberId ? `${root}.${memberId}` : undefined;
    };
    const fileAliases = defAliasRoots.size > 0 ? defAliasRoots : (() => {
      const m = new Map<string, string>();
      for (const f of emitAnalyses) {
        for (const [, qdef] of f.mutations.qualifiedFunctions) {
          for (const [k, v] of qdef.aliasRoots) m.set(k, v);
        }
      }
      return m;
    })();

    const containsForbiddenWrite = (stList: readonly LuaAstNode[], insideDifferentEventGuard: boolean): boolean => {
      for (const st of stList) {
        // Check assignments/locals on screen/control/prev everywhere.
        if (st.type === 'LocalStatement') {
          if ((st.variables || []).some(v => {
            const nm = luaIdentifier(v);
            return nm === screenParam || nm === controlParam || nm === prevName || nm === paramParam;
          })) return true;
        }
        if (st.type === 'AssignmentStatement') {
          for (const target of st.variables || []) {
            if (target.isLocal === true) {
              const nm = luaIdentifier(target);
              if (nm === screenParam || nm === controlParam || nm === prevName || nm === paramParam) return true;
            }
            if ((target.type === 'IndexExpression' || target.type === 'MemberExpression')
              && target.base?.isLocal === true && luaIdentifier(target.base) === paramParam && !insideDifferentEventGuard) {
              return true;
            }
          }
          continue;
        }
        if (st.type === 'IfStatement') {
          for (const clause of (st.clauses as LuaAstNode[] | undefined) ?? []) {
            const filter = clause.type !== 'ElseClause'
              ? luaConjunctionEventFilter(clause.condition as LuaAstNode, screenParam, controlParam, wrapperSubstituted)
              : undefined;
            const mismatchedEvent = !!filter
              && ((filter.screen !== undefined && filter.screen !== targetScreen)
                || (filter.control !== undefined && filter.control !== targetControl));
            const clauseBody = (clause.body as LuaAstNode[] | undefined) ?? [];

            // Check safe cleaner pattern: `local ok, c, f = pcall(Root.Cleaner, param)` + `if ok then param = c ... end`.
            if (clauseBody.length === 2 && clauseBody[0]?.type === 'LocalStatement' && clauseBody[1]?.type === 'IfStatement') {
              const pcallStmt = clauseBody[0];
              const pcallInit = pcallStmt.init?.[0];
              const okVar = pcallStmt.variables?.[0] ? luaIdentifier(pcallStmt.variables[0]) : null;
              const cleanVar = pcallStmt.variables?.[1] ? luaIdentifier(pcallStmt.variables[1]) : null;
              const updateClauses = clauseBody[1].clauses as LuaAstNode[] | undefined;
              if (pcallInit?.type === 'CallExpression' && pcallInit.base?.isLocal === false
                && luaIdentifier(pcallInit.base) === 'pcall' && pcallInit.arguments?.length === 2
                && pcallInit.arguments[1].isLocal === true && luaIdentifier(pcallInit.arguments[1]) === paramParam
                && okVar && cleanVar && okVar !== cleanVar && updateClauses?.length === 1
                && updateClauses[0].type === 'IfClause' && luaIdentifier(updateClauses[0].condition as LuaAstNode) === okVar) {
                const cleanerMember = pcallInit.arguments[0];
                const cleanerFakeCall: LuaAstNode = { type: 'CallExpression', base: cleanerMember, arguments: [pcallInit.arguments[1]] };
                const cleanerKey = resolveCleanerCall(cleanerFakeCall, fileAliases);
                const updateBody = (updateClauses[0].body as LuaAstNode[] | undefined) ?? [];
                const assignParam = updateBody[0];
                const validParamReassign = assignParam?.type === 'AssignmentStatement' && assignParam.variables?.length === 1
                  && assignParam.variables[0].isLocal === true && luaIdentifier(assignParam.variables[0]) === paramParam
                  && assignParam.init?.length === 1 && assignParam.init[0].isLocal === true && luaIdentifier(assignParam.init[0]) === cleanVar;
                const noShadowNames = new Set([paramParam, cleanVar, screenParam, controlParam, prevName]);
                const noReadNames = new Set([paramParam, cleanVar, prevName]);
                const remainingSafe = !updateBody.slice(1).some(extra => {
                  let touchesForbidden = false;
                  walkLuaAst(extra, n => {
                    if (n.type === 'AssignmentStatement' || n.type === 'FunctionDeclaration') touchesForbidden = true;
                    if (n.type === 'LocalStatement' && (n.variables || []).some(v => {
                      const vName = luaIdentifier(v);
                      return vName !== null && noShadowNames.has(vName);
                    })) {
                      touchesForbidden = true;
                    }
                    const nm = n.isLocal === true ? luaIdentifier(n) : null;
                    if (nm && noReadNames.has(nm)) touchesForbidden = true;
                  });
                  return touchesForbidden;
                });
                if (cleanerKey && validParamReassign && remainingSafe
                  && verifyIdentityPreservingTableCleaner(cleanerKey, qualifiedFunctions, members, replacedRoots)) {
                  continue;
                }
              }
            }
            if (containsForbiddenWrite(clauseBody, insideDifferentEventGuard || mismatchedEvent)) return true;
          }
          continue;
        }
        // Reject unverified direct calls/loops mutating paramParam outside a different-event guard.
        if (!insideDifferentEventGuard) {
          let touchesParam = false;
          walkLuaAst(st, n => {
            if (n.isLocal === true && luaIdentifier(n) === paramParam) touchesParam = true;
          });
          if (touchesParam) return true;
        }
      }
      return false;
    };

    if (containsForbiddenWrite(prefix, false)) return false;
  }
  return true;
}

interface LuaEmitWrapperSpec {
  namespace: LuaStringValue;
  paramIndex: number;
  usesProtectedCall: boolean;
}

function collectReadOnlyStringLookupTables(
  scopeIndex: LuaLexicalScopeIndex,
  substituted: Uint8Array,
): Map<LuaLocalBinding, { values: LuaStringValue[]; tainted: boolean }> {
  const out = new Map<LuaLocalBinding, { values: LuaStringValue[]; tainted: boolean }>();
  for (const binding of scopeIndex.bindings) {
    if (binding.kind !== 'local' || binding.writes !== 1 || binding.init?.type !== 'TableConstructorExpression') continue;
    const fields = binding.init.fields ?? [];
    if (fields.length === 0 || fields.length > 128) continue;
    const readOnlyIndexed = binding.refs.every(ref => {
      const { node, parent, grandParent } = ref;
      if ((parent?.type !== 'IndexExpression' && parent?.type !== 'MemberExpression') || parent.base !== node || parent.indexer === ':') {
        return false;
      }
      if (grandParent?.type === 'AssignmentStatement' && grandParent.variables?.includes(parent)) return false;
      if (grandParent?.type === 'FunctionDeclaration' && grandParent.identifier === parent) return false;
      if (grandParent?.type === 'CallExpression' && grandParent.base === parent) return false;
      return true;
    });
    if (!readOnlyIndexed) continue;

    const values: LuaStringValue[] = [];
    const seen = new Set<string>();
    let valid = true;
    let tainted = false;
    for (const field of fields) {
      const resolved = resolveLuaRegistrationStrings(field.value as LuaAstNode | undefined, scopeIndex.identToBinding, substituted);
      if (!resolved || resolved.length !== 1) { valid = false; break; }
      const [item] = resolved;
      if (item.tainted) { tainted = true; continue; }
      if (!item.value || item.prefix) { valid = false; break; }
      if (!seen.has(item.value)) { seen.add(item.value); values.push(item); }
    }
    if (valid && (values.length > 0 || tainted)) out.set(binding, { values, tainted });
  }
  return out;
}

function resolveLookupTableControls(
  expr: LuaAstNode | undefined,
  callNode: LuaAstNode,
  scopeIndex: LuaLexicalScopeIndex,
  lookupTables: ReadonlyMap<LuaLocalBinding, { values: LuaStringValue[]; tainted: boolean }>,
): LuaStringValue[] | undefined {
  let indexExpr: LuaAstNode | undefined = expr?.type === 'IndexExpression' ? expr : undefined;
  if (!indexExpr && expr?.type === 'Identifier' && expr.isLocal) {
    const varBinding = scopeIndex.identToBinding.get(expr);
    if (!varBinding || varBinding.kind !== 'local' || varBinding.writes !== 1 || varBinding.init?.type !== 'IndexExpression') return undefined;
    if (!varBinding.declRange || !callNode.range || varBinding.declRange[1] > callNode.range[0]) return undefined;
    if (!luaContains(varBinding.scopeNode, callNode)) return undefined;
    indexExpr = varBinding.init;
  }
  if (!indexExpr || indexExpr.base?.type !== 'Identifier' || !indexExpr.base.isLocal) return undefined;
  const tblBinding = scopeIndex.identToBinding.get(indexExpr.base);
  if (!tblBinding || !tblBinding.declRange || !callNode.range || tblBinding.declRange[1] > callNode.range[0]) return undefined;
  if (!luaContains(tblBinding.scopeNode, callNode)) return undefined;
  const entry = lookupTables.get(tblBinding);
  if (!entry) return undefined;
  return entry.tainted ? [{ value: '', prefix: false, tainted: true }] : entry.values;
}

function resolveGuardedMemberControls(
  expr: LuaAstNode | undefined,
  callNode: LuaAstNode,
  scopeIndex: LuaLexicalScopeIndex,
  substituted: Uint8Array,
  ambiguousProtectedCall: (base: LuaAstNode | undefined) => boolean,
): LuaStringValue[] | undefined {
  if (!expr || expr.type !== 'MemberExpression' || expr.indexer !== '.' || !expr.base?.isLocal) return undefined;
  const baseBinding = scopeIndex.identToBinding.get(expr.base);
  const memberName = luaIdentifier(expr.identifier);
  if (!baseBinding || baseBinding.kind !== 'local' || baseBinding.writes !== 1 || !memberName) return undefined;

  const isSameMember = (candidate: LuaAstNode | undefined): boolean =>
    candidate?.type === 'MemberExpression' && candidate.indexer === '.' && !!candidate.base?.isLocal
    && scopeIndex.identToBinding.get(candidate.base) === baseBinding
    && luaIdentifier(candidate.identifier) === memberName;

  const collectAndConjuncts = (cond: LuaAstNode | undefined, outList: LuaAstNode[]) => {
    if (!cond) return;
    if (cond.type === 'LogicalExpression' && cond.operator === 'and') {
      collectAndConjuncts(cond.left, outList);
      collectAndConjuncts(cond.right, outList);
      return;
    }
    outList.push(cond);
  };

  let cur: LuaAstNode | undefined = callNode;
  let usedProtectedThunk = false;
  while (cur) {
    const parent = scopeIndex.parents.get(cur);
    if (!parent) break;
    if (parent.type === 'WhileStatement' || parent.type === 'RepeatStatement' || parent.type === 'ForNumericStatement' || parent.type === 'ForGenericStatement') {
      break;
    }
    if (parent.type === 'FunctionDeclaration') {
      const pcallNode = scopeIndex.parents.get(parent);
      if (usedProtectedThunk || !pcallNode || pcallNode.type !== 'CallExpression'
        || luaIdentifier(pcallNode.base) !== 'pcall' || ambiguousProtectedCall(pcallNode.base)
        || pcallNode.arguments?.length !== 1 || pcallNode.arguments[0] !== parent
        || parent.identifier || parent.parameters?.length) {
        break;
      }
      usedProtectedThunk = true;
      cur = pcallNode;
      continue;
    }
    if (parent.type === 'IfClause' || parent.type === 'ElseifClause') {
      const clauseCondition = parent.condition as LuaAstNode | undefined;
      if (clauseCondition && callNode.range && luaContains(parent, callNode)) {
        const mutatedInClause = baseBinding.refs.some(ref => {
          if (!luaContains(parent, ref.node) || (ref.node.range?.[0] ?? 0) >= callNode.range![0]) return false;
          if (clauseCondition.range && luaContains(clauseCondition, ref.node)) return false;
          if (ref.grandParent?.type !== 'AssignmentStatement' && ref.grandParent?.type !== 'FunctionDeclaration') return false;
          if (ref.parent?.type === 'IndexExpression' && ref.parent.base === ref.node) return true;
          return ref.parent?.type === 'MemberExpression' && ref.parent.base === ref.node && luaIdentifier(ref.parent.identifier) === memberName;
        });
        if (!mutatedInClause) {
          const conjuncts: LuaAstNode[] = [];
          collectAndConjuncts(clauseCondition, conjuncts);
          for (const item of conjuncts) {
            if (item.type !== 'BinaryExpression' || item.operator !== '==') continue;
            const lit = isSameMember(item.left) ? item.right : isSameMember(item.right) ? item.left : undefined;
            if (lit?.type === 'StringLiteral' && typeof lit.value === 'string') {
              return [{ value: lit.value, prefix: false, tainted: luaStringLiteralTainted(lit, substituted) }];
            }
          }
        }
      }
    }
    cur = parent;
  }
  return undefined;
}

function collectLocalEmitWrappers(
  scopeIndex: LuaLexicalScopeIndex,
  substituted: Uint8Array,
  ambiguousGlobal: (name: string) => boolean,
  ambiguousProtectedCall: (base: LuaAstNode | undefined) => boolean,
): { emitWrappers: Map<LuaLocalBinding, LuaEmitWrapperSpec>; wrappedInnerEmitCalls: Set<LuaAstNode> } {
  const emitWrappers = new Map<LuaLocalBinding, LuaEmitWrapperSpec>();
  const wrappedInnerEmitCalls = new Set<LuaAstNode>();
  if (ambiguousGlobal('AddUITriggeredEvent')) return { emitWrappers, wrappedInnerEmitCalls };

  for (const [fnDecl, fnBinding] of scopeIndex.functions) {
    if (!fnBinding || fnBinding.kind !== 'function' || fnBinding.writes !== 1 || !fnBinding.declRange) continue;
    if (fnBinding.refs.length === 0) continue;
    const onlyDirectCalls = fnBinding.refs.every(ref =>
      ref.parent?.type === 'CallExpression' && ref.parent.base === ref.node
      && !!ref.parent.range && ref.parent.range[0] >= fnBinding.declRange![0]);
    if (!onlyDirectCalls) continue;

    const params = (fnDecl.parameters || []).map(luaIdentifier);
    if (!params.length || new Set(params).size !== params.length) continue;

    const innerEmits: { call: LuaAstNode; forwarded: boolean; insidePcallThunk: boolean }[] = [];
    let unsafeReference = false;
    walkLuaAst(fnDecl.body, inner => {
      if (inner.type === 'AssignmentStatement' && (inner.variables || []).some(v => {
        const b = v.isLocal ? scopeIndex.identToBinding.get(v) : undefined;
        return b?.scopeNode === fnDecl && b.kind === 'param';
      })) {
        unsafeReference = true;
      }
      if (inner.type !== 'CallExpression') return;
      if (luaIdentifier(inner.base) === 'pcall' && ambiguousProtectedCall(inner.base)) {
        unsafeReference = true;
        return;
      }
      const forwarded = luaIdentifier(inner.base) === 'pcall';
      const emitter = forwarded ? inner.arguments?.[0] : inner.base;
      if (luaIdentifier(emitter) !== 'AddUITriggeredEvent') return;
      if (emitter?.isLocal !== false || (forwarded && ambiguousProtectedCall(inner.base))) {
        unsafeReference = true;
        return;
      }
      const enclosingFn = scopeIndex.parents.get(inner)?.type === 'CallStatement' ? scopeIndex.nodeFnScope.get(inner) : undefined;
      const thunkCall = enclosingFn && enclosingFn !== fnDecl ? scopeIndex.parents.get(enclosingFn) : undefined;
      const insidePcallThunk = !!thunkCall && thunkCall.type === 'CallExpression'
        && luaIdentifier(thunkCall.base) === 'pcall' && !ambiguousProtectedCall(thunkCall.base);
      innerEmits.push({ call: inner, forwarded, insidePcallThunk });
    });
    if (unsafeReference || innerEmits.length !== 1) continue;

    const [inner] = innerEmits;
    const innerArgs = inner.forwarded ? inner.call.arguments?.slice(1) : inner.call.arguments;
    const nsResolved = resolveLuaRegistrationStrings(innerArgs?.[0], scopeIndex.identToBinding, substituted);
    if (!nsResolved || nsResolved.length !== 1 || nsResolved[0].prefix || nsResolved[0].tainted || !nsResolved[0].value) continue;

    const ctrlNode = innerArgs?.[1];
    if (ctrlNode?.type !== 'Identifier' || !ctrlNode.isLocal) continue;
    const ctrlBinding = scopeIndex.identToBinding.get(ctrlNode);
    if (!ctrlBinding || ctrlBinding.kind !== 'param' || ctrlBinding.scopeNode !== fnDecl || ctrlBinding.writes !== 1) continue;
    const paramIndex = params.indexOf(ctrlBinding.name);
    if (paramIndex < 0) continue;

    emitWrappers.set(fnBinding, {
      namespace: nsResolved[0],
      paramIndex,
      usesProtectedCall: inner.forwarded || inner.insidePcallThunk,
    });
    wrappedInnerEmitCalls.add(inner.call);
  }
  return { emitWrappers, wrappedInnerEmitCalls };
}

function parseLuaUiEmits(content: string, file: string): {
  events: ProjectUiEventRef[]; coverage: LuaEmitCoverage; payloadWrites: PayloadWriteSite[]; hasProtectedCalls: boolean; mutations: LuaBuilderMutationFacts;
} {
  const out: ProjectUiEventRef[] = [];
  const coverage: LuaEmitCoverage = { file, parsed: false, exact: 0, prefix: 0, unresolved: 0, reasons: [] };
  const gap = (reason: LuaEmitCoverage['reasons'][number]) => {
    if (!coverage.reasons.includes(reason)) coverage.reasons.push(reason);
  };
  const source = buildLuaAnalysisSource(content || '');
  let environmentRebound = false;
  let hasProtectedCalls = false;
  const mutations: LuaBuilderMutationFacts = {
    members: new Map(),
    replacedRoots: new Set(),
    opaqueGlobals: false,
    ambiguousBuiltins: new Set(),
    registryDefs: new Map(),
    registryCandidates: [],
    unsafeRegistries: new Set(),
    pendingRegistryArgChecks: [],
    emitterWrappers: [],
    qualifiedFunctions: new Map(),
  };
  let ast: unknown;
  try {
    ast = parse(source.content, {
      comments: false, locations: true, ranges: true, scope: true, encodingMode: 'pseudo-latin1',
      onLocalDeclaration(name: string) { if (name === '_ENV') environmentRebound = true; },
    });
  } catch {
    return { events: out, coverage, payloadWrites: [], hasProtectedCalls, mutations }; // Registration analysis reports the parse failure for this file.
  }
  coverage.parsed = true;
  // Only immutable, unambiguous local constants may supply event arguments.
  // Shadowing or another assignment makes the name unknown, not a guessed value.
  const assignments = new Map<string, { count: number; init: LuaAstNode; local: boolean; block?: LuaAstNode }>();
  const rootWrites: { root: string; statement: LuaAstNode; value?: LuaAstNode; parent?: LuaAstNode }[] = [];
  const uncertainObjects: LuaAstNode[] = [];
  const pendingDynamicTargets: { node: LuaAstNode; base: LuaAstNode; statement: LuaAstNode; rhs?: LuaAstNode }[] = [];
  const shadowed = new Set<string>();
  const reboundGlobals = new Set<string>();
  const functionDeclarations: { node: LuaAstNode; parent?: LuaAstNode }[] = [];
  const globalEmitterWrites: { statement: LuaAstNode; parent?: LuaAstNode; value?: LuaAstNode; opaque: boolean }[] = [];
  let dynamicGlobalWrite = false;
  let changesFunctionEnvironment = false;
  const trackGlobalWrite = (target: LuaAstNode | undefined) => {
    if (luaIdentifier(target) === '_ENV') environmentRebound = true;
    if (!isLuaGlobalEnvironment(target?.base)) return;
    const member = target.type === 'MemberExpression' ? luaIdentifier(target.identifier) : target.index?.value;
    if (typeof member === 'string') reboundGlobals.add(member);
    else dynamicGlobalWrite = true;
  };
  const recordMember = (name: string) => mutations.members.set(name, (mutations.members.get(name) ?? 0) + 1);
  const recordTarget = (node: LuaAstNode | undefined, statement?: LuaAstNode, rhs?: LuaAstNode) => {
    if (node?.type !== 'MemberExpression' && node?.type !== 'IndexExpression') return;
    const field = luaMemberName(node);
    if (field !== undefined) recordMember(field);
    else if (node.base) {
      if (node.type === 'IndexExpression' && statement?.type === 'AssignmentStatement') {
        pendingDynamicTargets.push({ node, base: node.base, statement, rhs });
      } else {
        uncertainObjects.push(node.base);
      }
    }
    if (isLuaGlobalEnvironment(node.base) && field !== undefined) mutations.replacedRoots.add(field);
  };
  walkLuaAst(ast, (node, _scope, _branches, parent) => {
    if (node.type === 'FunctionDeclaration') {
      functionDeclarations.push({ node, parent });
      if (node.identifier && luaIdentifier(node.identifier) === 'AddUITriggeredEvent' && node.identifier.isLocal === false) {
        globalEmitterWrites.push({ statement: node, parent, opaque: true });
      }
      trackGlobalWrite(node.identifier);
      recordTarget(node.identifier, node);
      const functionName = luaIdentifier(node.identifier);
      if (functionName) {
        shadowed.add(functionName);
        if (node.identifier?.isLocal === false) mutations.replacedRoots.add(functionName);
      }
      for (const parameter of node.parameters || []) {
        const name = luaIdentifier(parameter);
        if (name) shadowed.add(name);
      }
    }
    if (node.type === 'ForGenericStatement' || node.type === 'ForNumericStatement') {
      for (const variable of node.variables || [node.variable]) {
        const name = luaIdentifier(variable);
        if (name) shadowed.add(name);
      }
    }
    if (node.type === 'CallExpression' && node.base?.isLocal === false) {
      const callee = luaIdentifier(node.base);
      if (callee === 'setfenv') changesFunctionEnvironment = true;
      const args = callee === 'pcall' && node.arguments?.[0]?.isLocal === false && luaIdentifier(node.arguments[0]) === 'rawset'
        ? node.arguments.slice(1) : callee === 'rawset' ? node.arguments : undefined;
      if (args?.[0]) {
        if (typeof args[1]?.value === 'string') {
          recordMember(args[1].value);
          if (isLuaGlobalEnvironment(args[0])) {
            mutations.replacedRoots.add(args[1].value);
            if (args[1].value === 'AddUITriggeredEvent') globalEmitterWrites.push({ statement: node, parent, opaque: true });
          }
        } else uncertainObjects.push(args[0]);
      }
      if (callee === 'setmetatable' && node.arguments?.[0]) uncertainObjects.push(node.arguments[0]);
      if (callee === 'rawset' && isLuaGlobalEnvironment(node.arguments?.[0])) {
        const member = node.arguments?.[1]?.value;
        if (typeof member === 'string') reboundGlobals.add(member);
        else dynamicGlobalWrite = true;
      }
    }
    if (node.type !== 'LocalStatement' && node.type !== 'AssignmentStatement') return;
    (node.variables || []).forEach((variable, index) => {
      trackGlobalWrite(variable);
      const init = node.init?.[index];
      recordTarget(variable, node, init);
      const name = luaIdentifier(variable);
      if (!name) return;
      if (node.type === 'AssignmentStatement' && variable.isLocal === false) {
        rootWrites.push({ root: name, statement: node, value: init, parent });
        if (name === 'AddUITriggeredEvent' && (node.variables?.length ?? 0) === 1) {
          globalEmitterWrites.push({ statement: node, parent, value: init, opaque: false });
        }
      } else if (node.type === 'AssignmentStatement' && isLuaGlobalEnvironment(variable.base)) {
        const gMember = luaMemberName(variable);
        if (gMember === 'AddUITriggeredEvent') globalEmitterWrites.push({ statement: node, parent, value: init, opaque: true });
      }
      assignments.set(name, { count: (assignments.get(name)?.count || 0) + 1, init, local: node.type === 'LocalStatement', block: parent });
    });
  });
  const unambiguousAlias = (value: LuaAstNode | undefined) => {
    const name = value?.isLocal === true ? luaIdentifier(value) : null;
    const binding = name ? assignments.get(name) : undefined;
    return binding?.count === 1 && binding.local && !shadowed.has(name!) && value && luaContains(binding.block, value)
      && binding.init?.range && binding.init.range[1] < value.range![0] ? binding.init : undefined;
  };
  const ambiguousGlobal = (name: string) => environmentRebound || reboundGlobals.has(name) || assignments.has(name) || shadowed.has(name);
  const rawgetAvailable = !dynamicGlobalWrite && !changesFunctionEnvironment && !ambiguousGlobal('rawget');
  for (const builtin of ['ipairs', 'pairs', 'type', 'rawget', 'pcall']) {
    if (ambiguousGlobal(builtin)) mutations.ambiguousBuiltins.add(builtin);
  }
  const resolveNamespaceRoot = (node: LuaAstNode | undefined): string | undefined => {
    if (!node) return undefined;
    const direct = readLuaNamespace(node, rawgetAvailable);
    if (direct) return direct;
    const alias = unambiguousAlias(node);
    const init = alias?.type === 'LogicalExpression' && alias.operator === 'or' ? alias.left : alias;
    return readLuaNamespace(init, rawgetAvailable);
  };
  const resolveQualifiedMember = (node: LuaAstNode | undefined): { root: string; member: string } | undefined => {
    if (!node || (node.type !== 'MemberExpression' && node.type !== 'IndexExpression') || node.indexer === ':') return undefined;
    const root = resolveNamespaceRoot(node.base);
    const member = luaMemberName(node);
    return root && member ? { root, member } : undefined;
  };
  // Index single-def alias roots, file-level table.concat aliases, and qualified member functions.
  const fileAliasRoots = new Map<string, string>();
  const fileConcatAliases = new Set<string>();
  for (const [aliasName, entry] of assignments) {
    if (entry.count === 1 && entry.local && !shadowed.has(aliasName)) {
      const init = entry.init?.type === 'LogicalExpression' && entry.init.operator === 'or' ? entry.init.left : entry.init;
      const root = readLuaNamespace(init, rawgetAvailable);
      if (root) fileAliasRoots.set(aliasName, root);
      if (entry.init?.type === 'MemberExpression' && entry.init.indexer === '.'
        && entry.init.base?.isLocal === false && luaIdentifier(entry.init.base) === 'table'
        && luaIdentifier(entry.init.identifier) === 'concat') {
        fileConcatAliases.add(aliasName);
      }
    }
  }
  for (const { node } of functionDeclarations) {
    const q = resolveQualifiedMember(node.identifier);
    if (q) {
      const key = `${q.root}.${q.member}`;
      if (!mutations.qualifiedFunctions.has(key)) {
        mutations.qualifiedFunctions.set(key, {
          root: q.root,
          member: q.member,
          ast: node,
          aliasRoots: fileAliasRoots,
          concatAliases: fileConcatAliases,
          substituted: source.substituted,
        });
      }
    }
  }
  // Collect static literal array registry definitions and all cross-file member references in this file.
  const scopeScan = scanLuaScope(ast as LuaAstNode);
  for (const st of scopeScan.nodes) {
    if (st.type !== 'AssignmentStatement' || st.variables?.length !== 1 || st.init?.length !== 1) continue;
    const target = st.variables[0];
    const q = resolveQualifiedMember(target);
    const initTbl = st.init[0];
    if (!q || initTbl?.type !== 'TableConstructorExpression') continue;
    const rows: LuaRegistryRowFact[] = [];
    let validTable = true;
    for (const entry of initTbl.fields ?? []) {
      const entryValue = entry.value as LuaAstNode | undefined;
      if (entry.type !== 'TableValue' || entryValue?.type !== 'TableConstructorExpression') {
        validTable = false;
        break;
      }
      const fields = new Map<string, string | null>();
      const dynamicFields = new Set<string>();
      let hasComputedKey = false;
      for (const f of entryValue.fields ?? []) {
        const fieldValue = f.value as LuaAstNode | undefined;
        if (f.type === 'TableKeyString') {
          const k = f.key ? luaIdentifier(f.key) : null;
          if (!k) { hasComputedKey = true; continue; }
          if (fieldValue?.type === 'StringLiteral') {
            const str = luaStaticString(fieldValue, source.substituted);
            if (str !== undefined) fields.set(k, str);
            else dynamicFields.add(k);
          } else if (fieldValue?.type === 'NilLiteral') {
            fields.set(k, null);
          } else {
            dynamicFields.add(k);
          }
        } else if (f.type === 'TableKey') {
          const keyStr = f.key?.type === 'StringLiteral' ? luaStaticString(f.key, source.substituted) : undefined;
          if (!keyStr) { hasComputedKey = true; continue; }
          if (fieldValue?.type === 'StringLiteral') {
            const valStr = luaStaticString(fieldValue, source.substituted);
            if (valStr !== undefined) fields.set(keyStr, valStr);
            else dynamicFields.add(keyStr);
          } else if (fieldValue?.type === 'NilLiteral') {
            fields.set(keyStr, null);
          } else {
            dynamicFields.add(keyStr);
          }
        }
      }
      rows.push({ fields, dynamicFields, hasComputedKey });
    }
    if (validTable && rows.length > 0) {
      const regKey = `${q.root}.${q.member}`;
      if (mutations.registryDefs.has(regKey)) mutations.unsafeRegistries.add(regKey);
      else mutations.registryDefs.set(regKey, rows);
    }
  }
  // Evaluate pending dynamic index writes (e.g. `A[fname] = function(...)` over an immutable static registry).
  for (const pending of pendingDynamicTargets) {
    let resolved: LuaFiniteRegistryCandidate | undefined;
    const targetRoot = resolveNamespaceRoot(pending.base);
    if (targetRoot && !ambiguousGlobal('ipairs') && !ambiguousGlobal('type')
      && pending.node.index?.isLocal === true) {
      const idxVarName = luaIdentifier(pending.node.index);
      let loopNode: LuaAstNode | undefined;
      for (let cur = scopeScan.parents.get(pending.statement); cur; cur = scopeScan.parents.get(cur)) {
        if (cur.type === 'ForGenericStatement') { loopNode = cur; break; }
      }
      const iterators = loopNode?.iterators;
      if (loopNode && idxVarName && iterators?.length === 1) {
        const iter = iterators[0];
        if (iter?.type === 'CallExpression' && iter.base?.isLocal === false && luaIdentifier(iter.base) === 'ipairs'
          && iter.arguments?.length === 1) {
          const regQ = resolveQualifiedMember(iter.arguments[0]);
          const regKey = regQ ? `${regQ.root}.${regQ.member}` : undefined;
          const regRows = regKey ? mutations.registryDefs.get(regKey) : undefined;
          const loopVars = loopNode.variables ?? [];
          const elemVar = loopVars[1] ?? loopVars[0];
          const elemName = elemVar ? luaIdentifier(elemVar) : null;
          if (regQ && regRows && !mutations.unsafeRegistries.has(regKey!) && elemName && elemName !== '_') {
            // Confirm `idxVarName` is declared once inside loop as `elemVar.<propName>` and never reassigned.
            const loopScan = scanLuaScope(loopNode);
            let propName: string | undefined;
            let idxLocalCount = 0;
            let idxBadAssign = false;
            for (const sub of loopScan.nodes) {
              if (sub.type === 'LocalStatement') {
                (sub.variables || []).forEach((v, i) => {
                  const vName = luaIdentifier(v);
                  if (vName === elemName) idxBadAssign = true;
                  if (vName !== idxVarName) return;
                  idxLocalCount++;
                  const initExpr = sub.init?.[i];
                  if (initExpr?.type === 'MemberExpression' && initExpr.indexer === '.'
                    && initExpr.base?.isLocal === true && luaIdentifier(initExpr.base) === elemName) {
                    const prop = initExpr.identifier ? luaIdentifier(initExpr.identifier) : null;
                    if (prop) propName = prop;
                  }
                });
              } else if (sub.type === 'AssignmentStatement') {
                for (const v of sub.variables || []) {
                  const vName = v.isLocal === true ? luaIdentifier(v) : null;
                  if (vName === idxVarName || vName === elemName) idxBadAssign = true;
                }
              }
            }
            if (idxLocalCount === 1 && !idxBadAssign && propName) {
              const keys: string[] = [];
              let allLiteralKeys = true;
              for (const row of regRows) {
                if (row.hasComputedKey || row.dynamicFields.has(propName)) { allLiteralKeys = false; break; }
                const keyVal = row.fields.get(propName);
                if (keyVal === undefined || keyVal === null) continue;
                keys.push(keyVal);
              }
              if (allLiteralKeys && keys.length > 0) {
                resolved = {
                  targetRoot,
                  registryRoot: regQ.root,
                  registryMember: regQ.member,
                  memberKeys: [...new Set(keys)],
                  propName,
                };
              }
            }
          }
        }
      }
    }
    if (resolved) mutations.registryCandidates.push(resolved);
    else uncertainObjects.push(pending.base);
  }
  // Check references to every qualified global Root.Member across this file so external mutations or escapes cannot hide.
  const recordRegistryUse = (node: LuaAstNode, q: { root: string; member: string }) => {
    const regKey = `${q.root}.${q.member}`;
    const parent = scopeScan.parents.get(node);
    if (!parent) { mutations.unsafeRegistries.add(regKey); return; }
    if (parent.type === 'FunctionDeclaration' && parent.identifier === node) return;
    if (parent.type === 'CallExpression' && parent.base === node) return;
    if (parent.type === 'AssignmentStatement' && parent.variables?.includes(node)) return;
    if (parent.type === 'CallExpression' && parent.arguments?.includes(node)) {
      const argIndex = parent.arguments.indexOf(node);
      const directBuiltin = parent.base?.isLocal === false ? luaIdentifier(parent.base) : null;
      if (directBuiltin === 'ipairs' || directBuiltin === 'pairs') return;
      const calleeQ = resolveQualifiedMember(parent.base);
      if (calleeQ) {
        mutations.pendingRegistryArgChecks.push({
          registryKey: regKey,
          calleeKey: `${calleeQ.root}.${calleeQ.member}`,
          argIndex,
        });
        return;
      }
      mutations.unsafeRegistries.add(regKey);
      return;
    }
    if (parent.type === 'LogicalExpression' && parent.operator === 'or') {
      const gp = scopeScan.parents.get(parent);
      if (gp?.type === 'CallExpression' && gp.base?.isLocal === false
        && (luaIdentifier(gp.base) === 'ipairs' || luaIdentifier(gp.base) === 'pairs')) {
        return;
      }
    }
    if (parent.type === 'LogicalExpression' && parent.operator === 'and') {
      const gp = scopeScan.parents.get(parent);
      if (gp?.type === 'IfClause' || gp?.type === 'ElseifClause') return;
    }
    mutations.unsafeRegistries.add(regKey);
  };
  for (const node of scopeScan.nodes) {
    const q = resolveQualifiedMember(node);
    if (q) recordRegistryUse(node, q);
  }
  // Record global AddUITriggeredEvent assignment shapes for wrapper verification.
  for (const gw of globalEmitterWrites) {
    if (gw.opaque || !gw.value) {
      mutations.emitterWrappers.push({ kind: 'unverified' });
      continue;
    }
    if (gw.value.type === 'FunctionDeclaration') {
      const siblings = (gw.parent?.body as LuaAstNode[] | undefined) ?? [];
      const stmtPos = siblings.indexOf(gw.statement);
      const prevStmt = stmtPos > 0 ? siblings[stmtPos - 1] : undefined;
      const prevVar = prevStmt?.type === 'LocalStatement' && prevStmt.variables?.length === 1 && prevStmt.init?.length === 1
        ? prevStmt.variables[0] : undefined;
      const prevName = prevVar ? luaIdentifier(prevVar) : null;
      const prevInit = prevStmt?.init?.[0];
      if (prevName && prevInit?.isLocal === false && luaIdentifier(prevInit) === 'AddUITriggeredEvent'
        && assignments.get(prevName)?.count === 1 && !shadowed.has(prevName)) {
        mutations.emitterWrappers.push({
          kind: 'inline',
          prevName,
          wrapperAst: gw.value,
          substituted: source.substituted,
        });
        continue;
      }
    } else if (gw.value.type === 'CallExpression' && gw.value.arguments?.length === 1
      && gw.value.arguments[0].isLocal === false && luaIdentifier(gw.value.arguments[0]) === 'AddUITriggeredEvent') {
      const fq = resolveQualifiedMember(gw.value.base);
      if (fq) {
        mutations.emitterWrappers.push({ kind: 'factory', factoryRoot: fq.root, factoryMember: fq.member });
        continue;
      }
    }
    mutations.emitterWrappers.push({ kind: 'unverified' });
  }
  for (const { root, statement, value, parent } of rootWrites) {
    const before = parent?.body?.[(parent.body.indexOf(statement) ?? -1) - 1];
    const aliasInit = value?.isLocal === true && before?.type === 'LocalStatement' && before.variables?.length === 1
      && before.init?.length === 1 && luaIdentifier(before.variables[0]) === luaIdentifier(value) ? before.init[0] : undefined;
    const condition = parent?.condition as LuaAstNode | undefined;
    const guardedInit = parent?.type === 'IfClause' && parent.body?.length === 1 && condition?.type === 'UnaryExpression'
      && condition.operator === 'not' && (condition.argument as LuaAstNode | undefined)?.isLocal === false
      && luaIdentifier(condition.argument as LuaAstNode) === root && value?.type === 'TableConstructorExpression';
    if (!guardedInit && !preserveLuaNamespace(root, value, rawgetAvailable) && !preserveLuaNamespace(root, aliasInit, rawgetAvailable)) {
      mutations.replacedRoots.add(root);
    }
  }
  for (const object of uncertainObjects) {
    if (isLuaGlobalEnvironment(object)) mutations.opaqueGlobals = true;
    const alias = unambiguousAlias(object);
    const init = alias?.type === 'LogicalExpression' && alias.operator === 'or' ? alias.left : alias ?? object;
    const root = readLuaNamespace(init, rawgetAvailable);
    if (root) mutations.replacedRoots.add(root);
  }
  const ambiguousProtectedCall = (base: LuaAstNode | undefined) =>
    base?.isLocal !== false || dynamicGlobalWrite || changesFunctionEnvironment || ambiguousGlobal('pcall');
  const scopeIndex = collectLuaLexicalScopes(ast as LuaAstNode, environmentRebound);
  populateLuaBindingStrings(scopeIndex, source.substituted);
  const lookupTables = collectReadOnlyStringLookupTables(scopeIndex, source.substituted);
  const { emitWrappers, wrappedInnerEmitCalls } = collectLocalEmitWrappers(
    scopeIndex, source.substituted, ambiguousGlobal, ambiguousProtectedCall,
  );
  const strings = new Map<string, LuaStringValue>();
  const resolve = (expression: LuaAstNode): LuaStringValue | null => {
    // luaparse's lexical annotation prevents a later local declaration from
    // lending its value to an earlier global reference or unrelated function.
    let usesGlobalConstant = false;
    walkLuaAst(expression, node => {
      if (node.type === 'Identifier' && strings.has(node.name) && !node.isLocal) usesGlobalConstant = true;
    });
    return usesGlobalConstant ? null : luaStringPrefix(expression, strings, source.substituted);
  };
  const immutableLocal = (name: string): LuaAstNode | undefined => {
    const assignment = assignments.get(name);
    return assignment?.count === 1 && assignment.local && !shadowed.has(name) ? assignment.init : undefined;
  };
  for (const [name, assignment] of assignments) {
    if (assignment.count !== 1 || !assignment.local || shadowed.has(name)) continue;
    const value = resolve(assignment.init);
    if (value) strings.set(name, value);
  }
  const indexedWrites: LuaPayloadAssignment[] = [];
  const indexedClears: LuaPayloadAssignment[] = [];
  const payloadEmits = new Map<string, LuaPayloadEmit[]>();
  const protectedBodies = new Map<LuaAstNode, { call: LuaAstNode; caller?: LuaAstNode }>();
  const protectedSends: LuaProtectedPayloadSend[] = [];
  const returnedTableInitializers = new Map<LuaAstNode | undefined, LuaAstNode[]>();
  const recordEmitResolution = (
    namespace: LuaStringValue | null,
    controls: LuaStringValue[] | undefined,
    node: LuaAstNode,
    control: LuaStringValue | null,
    forwarded: boolean,
    direct: boolean,
    block: LuaAstNode,
    args?: LuaAstNode[],
    payloadEmit?: LuaPayloadEmit,
    argument?: LuaAstNode,
  ) => {
    if (namespace?.tainted || controls?.some(value => value.tainted)) {
      coverage.unresolved++; gap('source-encoding'); return;
    }
    if (!namespace?.value || namespace.prefix || !controls || controls.length === 0 || controls.some(value => !value.value)) {
      coverage.unresolved++; gap('dynamic-arguments'); return;
    }
    if (controls.some(value => value.prefix)) { coverage.prefix++; gap('prefix-only'); }
    else {
      coverage.exact++;
      const enclosing = protectedBodies.get(node);
      if (enclosing && control && args?.length === 3 && argument?.isLocal === true) {
        protectedSends.push({ ...enclosing, table: argument, identity: JSON.stringify([namespace.value, control.value]) });
      }
      if (payloadEmit) {
        payloadEmit.identities = controls.map(value => JSON.stringify([namespace.value, value.value]));
        payloadEmit.needsUnaliasedTable = forwarded || !control;
        if (forwarded || direct) payloadEmit.directBlock = block;
      }
    }
    // A literal trailing underscore is still an exact name; only an actual
    // unresolved concatenation justifies prefix matching.
    for (const value of controls) {
      out.push({ namespace: namespace.value, control: value.value, event: `${namespace.value}.${value.value}`, file, ...(value.prefix ? { prefix: true } : {}) });
    }
  };
  const resolveEmitControl = (
    controlNode: LuaAstNode | undefined,
    callNode: LuaAstNode,
    direct: boolean,
    branches: readonly LuaAstNode[],
  ): { single: LuaStringValue | null; list: LuaStringValue[] | undefined } => {
    const resolved = controlNode ? resolve(controlNode) : null;
    if (resolved) return { single: resolved, list: [resolved] };
    const finite = finiteLuaControl(controlNode, source.substituted, immutableLocal, direct && branches.length === 0);
    if (finite) return { single: null, list: finite };
    const fromTable = resolveLookupTableControls(controlNode, callNode, scopeIndex, lookupTables);
    if (fromTable) return { single: null, list: fromTable };
    const guarded = resolveGuardedMemberControls(controlNode, callNode, scopeIndex, source.substituted, ambiguousProtectedCall);
    return { single: null, list: guarded };
  };
  let canJump = false;
  walkLuaAst(ast, (node, scope, branches) => {
    if (node.type === 'GotoStatement') canJump = true;
    if (node.type === 'LocalStatement' && node.variables?.length === 1 && node.init?.[0]?.type === 'CallExpression'
      && globalLuaMember(node.init[0].base)) {
      let initializers = returnedTableInitializers.get(scope);
      if (!initializers) returnedTableInitializers.set(scope, initializers = []);
      initializers.push(node);
    }
    if (node.type === 'AssignmentStatement') {
      (node.variables || []).forEach((variable, index) => {
        const target = indexedPayloadTarget(variable, source);
        if (!target) return;
        const value = node.init?.[index];
        const sites = value && value.type !== 'NilLiteral' ? indexedWrites : indexedClears;
        // Lua evaluates the entire RHS before any of the assignments take effect.
        const block = branches.at(-1) ?? scope ?? (ast as LuaAstNode);
        const directValueBlock = sites === indexedWrites && literalLuaTruthiness(value) !== undefined && block.body?.includes(node)
          ? block : undefined;
        sites.push({ ...target, target: variable, local: variable.base?.isLocal === true, scope, branches, at: node.range![1], location: variable.loc, directValueBlock });
      });
    }
    if (node.type !== 'CallExpression') return;
    if (wrappedInnerEmitCalls.has(node)) {
      if (luaIdentifier(node.base) === 'pcall') hasProtectedCalls = true;
      return;
    }
    const baseBinding = node.base?.type === 'Identifier' && node.base.isLocal ? scopeIndex.identToBinding.get(node.base) : undefined;
    const wrapper = baseBinding ? emitWrappers.get(baseBinding) : undefined;
    if (wrapper) {
      if (wrapper.usesProtectedCall) hasProtectedCalls = true;
      const block = branches.at(-1) ?? scope ?? (ast as LuaAstNode);
      const direct = !!block.body?.some(statement => statement.type === 'CallStatement' && statement.expression === node);
      const { single, list } = resolveEmitControl((node.arguments || [])[wrapper.paramIndex], node, direct, branches);
      recordEmitResolution(wrapper.namespace, list, node, single, false, direct, block);
      return;
    }
    const forwarded = luaIdentifier(node.base) === 'pcall';
    const callback = forwarded && node.arguments?.length === 1 ? node.arguments[0] : undefined;
    if (callback?.type === 'FunctionDeclaration' && !callback.identifier && !callback.parameters?.length
      && callback.body?.length === 1 && callback.body[0].type === 'CallStatement' && !ambiguousProtectedCall(node.base)) {
      protectedBodies.set(callback.body[0].expression!, { call: node, caller: scope });
    }
    const emitter = forwarded ? node.arguments?.[0] : node.base;
    if (luaIdentifier(emitter) !== 'AddUITriggeredEvent') return;
    const args = forwarded ? node.arguments?.slice(1) : node.arguments;
    const argument = args?.[2];
    const table = luaIdentifier(argument);
    const binding = table ? assignments.get(table) : undefined;
    let payloadEmit: LuaPayloadEmit | undefined;
    if (table && argument?.isLocal && binding?.count === 1 && binding.local
      && binding.init?.type === 'TableConstructorExpression' && !shadowed.has(table) && (!forwarded || args?.length === 3)) {
      payloadEmit = { scope, branches, at: node.range![0] };
      const sites = payloadEmits.get(table) || [];
      sites.push(payloadEmit);
      payloadEmits.set(table, sites);
    }
    if (emitter?.isLocal) return;
    if (forwarded) hasProtectedCalls = true;
    const ambiguousForwarder = forwarded && ambiguousProtectedCall(node.base);
    if (ambiguousGlobal('AddUITriggeredEvent') || ambiguousForwarder) {
      coverage.unresolved++; gap('ambiguous-callee'); return;
    }
    const namespace = resolve(args?.[0]);
    const block = branches.at(-1) ?? scope ?? (ast as LuaAstNode);
    const direct = !forwarded && !!block.body?.some(statement => statement.type === 'CallStatement' && statement.expression === node);
    const { single, list } = resolveEmitControl(args?.[1], node, direct, branches);
    recordEmitResolution(namespace, list, node, single, forwarded, direct, block, args, payloadEmit, argument);
  });
  const unaliasedPayloads = unaliasedLuaPayloads(ast, payloadEmits, indexedWrites, indexedClears);
  const returnedPayloads = indexedWrites.length ? linkReturnedLuaPayloads(ast as LuaAstNode, protectedSends, returnedTableInitializers, source) : undefined;
  const payloadWrites = indexedWrites.map((write): PayloadWriteSite => {
    const { key, table } = write;
    const emits = write.local ? payloadEmits.get(table) || [] : [];
    const events = new Set<string>();
    const recipientEvents = new Set<string>();
    let recipientUnverified = false;
    for (const emit of emits) {
      if (emit.scope !== write.scope) {
        recipientUnverified = true;
        continue;
      }
      const compatible = write.branches.every((branch, index) => branch === emit.branches[index]);
      const cleared = indexedClears.some(clear => clear.local && clear.scope === write.scope && clear.table === table
        && clear.key === key && clear.at >= write.at && clear.at < emit.at);
      const hasTableProof = !emit.needsUnaliasedTable || (!canJump && !!emit.directBlock
        && write.directValueBlock === emit.directBlock && unaliasedPayloads.has(table));
      if (emit.identities && write.at <= emit.at && compatible && hasTableProof) {
        for (const identity of emit.identities) {
          recipientEvents.add(identity);
          if (!cleared) events.add(identity);
        }
      } else recipientUnverified = true;
    }
    const start = write.location?.start;
    const returned = returnedPayloads?.get(write.target);
    return { key, file, table, events: [...events], recipientEvents: [...recipientEvents], ...(returned ? { returned } : {}),
      recipientUnverified: recipientUnverified || recipientEvents.size === 0, candidateOnly: write.candidateOnly,
      ...(start ? { line: start.line, column: start.column + 1 } : {}) };
  });
  return { events: out, coverage, payloadWrites, hasProtectedCalls, mutations };
}

function findContentManifest(project: ExtensionProject): ModManifest | null {
  const content = (project.files || []).find(f => normPath(f.path).toLowerCase() === 'content.xml');
  return content ? parseModManifest(project.id || 'project', content.content || '') : null;
}

function libraryArgumentFacts<S>(call: MdReferenceFact<S>, signature: MdLibrarySignature<S>, library: S | undefined,
  parameterIndex?: ReadonlyMap<string, { name: string; hasDefault: boolean; point?: S }>,
  requiredIndex?: ReadonlyMap<string, { name: string; hasDefault: boolean; point?: S }>) {
  const findings: Array<{ code: 'md.cue_library_param_undeclared' | 'md.cue_library_param_required'
    | 'md.run_actions_param_undeclared' | 'md.run_actions_param_required';
    severity: 'error' | 'warning'; point?: S; target?: S; detail: string }> = [];
  if (signature.status !== 'known') return findings;
  const declared = parameterIndex ?? new Map(signature.parameters.map(parameter => [parameter.name, parameter]));
  const action = call.role === 'run_actions';
  const caller = action ? '<run_actions>' : `Cue "${call.name}"`;
  const ref = call.ref.trim();
  const supplied = new Set<string>();
  for (const argument of call.arguments) {
    supplied.add(argument.name);
    if (!declared.has(argument.name)) {
      findings.push({ code: action ? 'md.run_actions_param_undeclared' : 'md.cue_library_param_undeclared',
        severity: action ? 'warning' : 'error', point: argument.point, target: library,
        detail: `${caller} passes parameter "${argument.name}", which library "${ref}" does not declare.` });
    }
  }
  const required = requiredIndex ?? new Map([...declared].filter(([, declaration]) => !declaration.hasDefault));
  for (const [parameter, declaration] of required) {
    if (!supplied.has(parameter)) {
      // X4 logs the binding problem and still executes a run_actions library.
      findings.push({ code: action ? 'md.run_actions_param_required' : 'md.cue_library_param_required',
        severity: action ? 'warning' : 'error',
        point: call.missingArgumentPoints?.get(parameter) ?? (call.missingArgumentsUnavailable ? undefined : call.refPoint ?? call.point), target: declaration.point,
        detail: `${caller} calls library "${ref}" without required parameter "${parameter}".` });
    }
  }
  return findings;
}

function hasForeignMdNamespace(element: XmlElement): boolean {
  for (let node: XmlElement | null = element; node; node = node.parentElement) {
    if (node.namespaceURI || node.getAttribute('xmlns')) return true;
  }
  return false;
}

function libraryArgumentFindings(
  call: XmlElement, reference: XmlAttr, library: XmlElement, file: string, targetFile: string,
): ProjectCrossFileFinding[] {
  const action = call.nodeName === 'run_actions';
  if (action && (hasForeignMdNamespace(call) || hasForeignMdNamespace(library) || mdReferenceArgumentNamespaceUnavailable(call))) return [];
  type DomPoint = { node: XmlElement; attribute?: XmlAttr };
  const point = (node: XmlElement | XmlAttr): DomPoint => node.nodeType === 2
    ? { node: (node as XmlAttr).ownerElement!, attribute: node as XmlAttr } : { node: node as XmlElement };
  const facts = libraryArgumentFacts<DomPoint>({ id: '', role: action ? 'run_actions' : 'cue',
    ref: reference.value, name: call.getAttribute('name') ?? undefined, point: point(call), refPoint: point(reference),
    arguments: readMdReferenceArguments(call, node => point(node as XmlElement | XmlAttr)) },
  readMdLibrarySignature(library, node => point(node as XmlElement), { namespaceAware: action }), point(library));
  return facts.map(finding => {
    const declaration = finding.target?.node ?? library;
    const target = { file: targetFile, line: declaration.lineNumber, column: declaration.columnNumber };
    const coordinate = [target.file, target.line, target.column].filter(part => part !== undefined).join(':');
    const source = finding.point;
    return { code: finding.code, severity: finding.severity, file,
      line: source?.attribute?.lineNumber ?? source?.node.lineNumber,
      column: source?.attribute?.columnNumber ?? source?.node.columnNumber, target, detail: `${finding.detail} See ${coordinate}.` };
  });
}

function validateCueLibraryReferences(mdFiles: ExtensionProject['files']) {
  const parsedScripts: MdLibraryScript<XmlElement, { file: string; references: XmlElement[] }>[] = [];
  const findings: ProjectCrossFileFinding[] = [];
  let checked = 0;
  for (const file of mdFiles) {
    if (typeof file.content !== 'string') continue;
    const root = parseMdScriptRoot(file.content);
    if (!root) continue;
    const name = root.getAttribute('name');
    const elements = root.getElementsByTagName('*');
    for (const duplicate of findDuplicateMdCueDeclarations(elements)) {
      const target = { file: file.path, ...duplicate.first };
      findings.push({ code: 'md.cue_duplicate_name', severity: 'error', file: file.path,
        line: duplicate.line, column: duplicate.column, target,
        detail: duplicateMdCueMessage(duplicate.name, name ?? '', target) });
    }
    if (!name) continue;
    const references: XmlElement[] = [];
    const declarations: MdLibraryDeclaration<XmlElement>[] = [];
    for (const node of Array.from(elements)) {
      if (node.nodeName === 'cue' || node.nodeName === 'include_actions' || node.nodeName === 'run_actions') references.push(node);
      if (node.nodeName !== 'cue' && node.nodeName !== 'library') continue;
      const declaration = node.getAttribute('name');
      if (declaration) declarations.push({ name: declaration, kind: node.nodeName,
        purpose: node.getAttribute('purpose'), source: node });
    }
    parsedScripts.push({ name, declarations, source: { file: file.path, references } });
  }

  const scripts = buildMdLibraryIndex(parsedScripts);
  for (const script of scripts.values()) {
    if (!script) continue;
    for (const node of script.source.references) {
      const name = node.getAttribute('name');
      const attribute = node.getAttributeNode('ref');
      if (!attribute || (node.nodeName === 'cue' && !name)) continue;
      const ref = attribute.value.trim();
      const resolved = resolveMdLibraryReference(scripts, script.name, ref);
      if (!resolved) continue;
      const target = resolved.script;
      const library = resolved.library?.source;
      if (node.nodeName === 'cue') {
        checked++;
        if (!resolved.declared) {
          findings.push({ code: 'md.cue_library_ref_unresolved', severity: 'error', file: script.source.file,
            line: attribute.lineNumber ?? node.lineNumber, column: attribute.columnNumber ?? node.columnNumber,
            detail: `Cue "${name}" references library "${ref}", which has no declaration in MD script "${target.name}".` });
        } else if (library) {
          const purpose = library.getAttribute('purpose');
          if (purpose === null || purpose === 'cue_ref') {
            for (const finding of libraryArgumentFindings(node, attribute, library, script.source.file, target.source.file)) findings.push(finding);
          }
        }
        continue;
      }
      if (library?.getAttribute('purpose') !== 'run_actions') continue;
      if (node.nodeName === 'run_actions') {
        for (const finding of libraryArgumentFindings(node, attribute, library, script.source.file, target.source.file)) findings.push(finding);
        continue;
      }
      const location = { file: target.source.file, line: library.lineNumber, column: library.columnNumber };
      const coordinate = [location.file, location.line, location.column].filter(part => part !== undefined).join(':');
      findings.push({
        code: 'md.include_actions_run_library', severity: 'error', file: script.source.file,
        line: node.lineNumber, column: node.columnNumber, target: location,
        detail: `<include_actions ref="${ref}"> targets a library declared with purpose="run_actions" at ${coordinate}. Use <run_actions> to call this library.`,
      });
    }
  }
  return { checked, findings };
}

function walkOwnMdElements(container: XmlElement, visit: (element: XmlElement) => void): void {
  for (const child of Array.from(container.childNodes || [])) {
    if (child.nodeType !== 1) continue;
    const element = child as XmlElement;
    if (element.nodeName === 'cues' || element.nodeName === 'cue' || element.nodeName === 'library') continue;
    visit(element);
    walkOwnMdElements(element, visit);
  }
}

function collectConversationStartedLuaEvents(mdFiles: ExtensionProject['files']): Map<string, ValidationSourceLocation> {
  const out = new Map<string, ValidationSourceLocation>();
  if (!mdFiles.some(f => typeof f.content === 'string' && f.content.includes('event_conversation_started'))) {
    return out;
  }

  const parsedDocs: Array<{ file: string; scriptName: string; root: XmlElement }> = [];
  const parsedScripts: MdLibraryScript<XmlElement, { file: string }>[] = [];
  for (const file of mdFiles) {
    if (typeof file.content !== 'string' || !file.content.trim()) continue;
    const mdRoot = parseMdScriptRoot(file.content);
    let docRoot: XmlElement | null = mdRoot;
    if (!docRoot) {
      try {
        let malformed = false;
        const parsed = new DOMParser({ onError: () => { malformed = true; } })
          .parseFromString(file.content.replace(/^\uFEFF/, ''), 'text/xml').documentElement;
        if (!malformed) docRoot = parsed;
      } catch { /* Ignore unparseable XML fragments here; XSD/XML layers own syntax errors. */ }
    }
    if (!docRoot) continue;
    const scriptName = mdRoot?.getAttribute('name')?.trim() || '';
    parsedDocs.push({ file: file.path, scriptName, root: docRoot });
    if (mdRoot && scriptName) {
      const declarations: MdLibraryDeclaration<XmlElement>[] = [];
      for (const node of Array.from(mdRoot.getElementsByTagName('*'))) {
        if (node.nodeName !== 'cue' && node.nodeName !== 'library') continue;
        const declName = node.getAttribute('name');
        if (declName) {
          declarations.push({ name: declName, kind: node.nodeName, purpose: node.getAttribute('purpose'), source: node });
        }
      }
      parsedScripts.push({ name: scriptName, declarations, source: { file: file.path } });
    }
  }

  const scripts = buildMdLibraryIndex(parsedScripts);
  const collectActionsEvents = (
    actionsRoot: XmlElement,
    file: string,
    callerScript: string,
    visited: Set<string>,
  ) => {
    walkOwnMdElements(actionsRoot, element => {
      if (element.nodeName === 'raise_lua_event') {
        const attr = element.getAttributeNode('name');
        if (!attr?.value?.trim()) return;
        const { values } = collectMdStringResults(attr.value);
        for (const ev of values) {
          if (ev && !out.has(ev)) {
            out.set(ev, {
              file,
              line: attr.lineNumber ?? element.lineNumber,
              column: attr.columnNumber ?? element.columnNumber,
            });
          }
        }
        return;
      }
      if (element.nodeName === 'run_actions' || element.nodeName === 'include_actions') {
        const ref = element.getAttribute('ref')?.trim();
        if (!ref) return;
        const resolved = resolveMdLibraryReference(scripts, callerScript, ref);
        const libEl = resolved?.library?.source;
        if (!resolved || !libEl || !resolved.library) return;
        const visitKey = `lib:${resolved.script.name.toLowerCase()}:${resolved.library.name}`;
        if (visited.has(visitKey)) return;
        visited.add(visitKey);
        for (const child of Array.from(libEl.childNodes || [])) {
          if (child.nodeType === 1 && (child as XmlElement).nodeName === 'actions') {
            collectActionsEvents(child as XmlElement, resolved.script.source.file, resolved.script.name, visited);
          }
        }
        return;
      }
      if (element.nodeName === 'signal_cue_instantly') {
        const cueRef = element.getAttribute('cue')?.trim();
        if (!cueRef) return;
        const resolved = resolveMdLibraryReference(scripts, callerScript, cueRef, { cueReference: true });
        const cueEl = resolved?.declaration?.kind === 'cue' ? resolved.declaration.source : undefined;
        if (!resolved || !cueEl || !resolved.declaration) return;
        const visitKey = `cue:${resolved.script.name.toLowerCase()}:${resolved.declaration.name}`;
        if (visited.has(visitKey)) return;
        visited.add(visitKey);
        for (const child of Array.from(cueEl.childNodes || [])) {
          if (child.nodeType === 1 && (child as XmlElement).nodeName === 'actions') {
            collectActionsEvents(child as XmlElement, resolved.script.source.file, resolved.script.name, visited);
          }
        }
      }
    });
  };

  for (const doc of parsedDocs) {
    const cues = Array.from(doc.root.getElementsByTagName('cue'));
    if (doc.root.nodeName === 'cue') cues.unshift(doc.root);
    for (const cue of cues) {
      let hasConvStarted = false;
      for (const child of Array.from(cue.childNodes || [])) {
        if (child.nodeType !== 1 || (child as XmlElement).nodeName !== 'conditions') continue;
        walkOwnMdElements(child as XmlElement, condEl => {
          if (condEl.nodeName === 'event_conversation_started'
            && (condEl.getAttribute('check') || '').trim().toLowerCase() !== 'false') {
            hasConvStarted = true;
          }
        });
      }
      if (!hasConvStarted) continue;
      const visited = new Set<string>();
      for (const child of Array.from(cue.childNodes || [])) {
        if (child.nodeType === 1 && (child as XmlElement).nodeName === 'actions') {
          collectActionsEvents(child as XmlElement, doc.file, doc.scriptName, visited);
        }
      }
    }
  }
  return out;
}

interface ConvUiMenuCandidate {
  file: string;
  menuName?: string;
  declLoc?: { line: number; column: number };
  globalNames: Set<string>;
  localBindings: Set<LuaLocalBinding>;
  methods: Map<string, LuaAstNode>;
  selfParams: Map<LuaAstNode, string>;
  topLevelTruthyFields: Map<string, boolean>;
  mutatedInFunctions: Set<string>;
  constantTruthyFields: Set<string>;
  scopeIndex: LuaLexicalScopeIndex;
  substituted: Uint8Array;
}

interface ConvParsedLuaFile {
  file: string;
  ast: LuaAstNode;
  source: LuaAnalysisSource;
  scopeIndex: LuaLexicalScopeIndex;
  localFunctions: Map<LuaLocalBinding, LuaAstNode>;
  globalFunctions: Map<string, LuaAstNode>;
  registrations: Array<{ event: string; handlerExpr: LuaAstNode }>;
}

const LUA_CLOCK_FUNCTIONS = new Set(['GetCurRealTime', 'GetCurTime']);
const LUA_TIMER_CALLEE_RE = /(?:set|add|start|schedule)?(?:timer|timeout)|defer|delay|schedule/i;

function isGuaranteedTruthyMenuWrite(expr: LuaAstNode | undefined): boolean {
  if (!expr) return false;
  switch (expr.type) {
    case 'BooleanLiteral':
      return expr.value === true;
    case 'NumericLiteral':
    case 'StringLiteral':
    case 'TableConstructorExpression':
    case 'FunctionDeclaration':
      return true;
    case 'BinaryExpression':
      return expr.operator === '+' || expr.operator === '-' || expr.operator === '*'
        || expr.operator === '/' || expr.operator === '..' || expr.operator === '%';
    case 'UnaryExpression':
      return expr.operator === '-' || expr.operator === '#';
    case 'LogicalExpression':
      if (expr.operator === 'or') {
        return isGuaranteedTruthyMenuWrite(expr.left) || isGuaranteedTruthyMenuWrite(expr.right);
      }
      if (expr.operator === 'and') {
        return isGuaranteedTruthyMenuWrite(expr.left) && isGuaranteedTruthyMenuWrite(expr.right);
      }
      return false;
    case 'CallExpression': {
      const callee = expr.base?.isLocal === false ? luaIdentifier(expr.base) : null;
      if (callee && LUA_CLOCK_FUNCTIONS.has(callee)) return true;
      if (expr.base?.type === 'MemberExpression' && expr.base.indexer === '.'
        && expr.base.base?.isLocal === false && luaIdentifier(expr.base.base) === 'os') {
        const osMember = luaIdentifier(expr.base.identifier);
        return osMember === 'clock' || osMember === 'time';
      }
      return false;
    }
    default:
      return false;
  }
}

function isFalsyLiteralMenuWrite(expr: LuaAstNode | undefined): boolean {
  return !expr || expr.type === 'NilLiteral' || (expr.type === 'BooleanLiteral' && expr.value === false);
}

function clauseEndsWithReturn(stmts: readonly LuaAstNode[] | undefined): boolean {
  if (!stmts?.length) return false;
  return stmts[stmts.length - 1]?.type === 'ReturnStatement';
}

function applySequentialMenuWrites(
  stmts: readonly LuaAstNode[] | undefined,
  resolveBaseIsMenu: (base: LuaAstNode | undefined) => boolean,
  armedOnOpen: Set<string>,
  stopAtNode?: LuaAstNode,
): boolean {
  for (const stmt of stmts ?? []) {
    if (stopAtNode && stmt.range && stopAtNode.range && stmt.range[0] > stopAtNode.range[0]) {
      return true;
    }
    const containsStop = !!stopAtNode && luaContains(stmt, stopAtNode);
    if (stmt.type === 'DoStatement') {
      if (applySequentialMenuWrites(stmt.body, resolveBaseIsMenu, armedOnOpen, stopAtNode)) return true;
      continue;
    }
    if (stmt.type === 'IfStatement') {
      const clauses = (stmt.clauses as LuaAstNode[] | undefined) ?? [];
      if (containsStop) {
        for (const clause of clauses) {
          if (stopAtNode && luaContains(clause, stopAtNode)) {
            return applySequentialMenuWrites(clause.body, resolveBaseIsMenu, armedOnOpen, stopAtNode);
          }
        }
        return true;
      }
      // Skip early guard-returns (`if not menu._openRequested then ... return end`); fallthrough means guard was false.
      if (clauses.length === 1 && clauses[0].type === 'IfClause' && clauseEndsWithReturn(clauses[0].body)) {
        continue;
      }
      continue;
    }
    if (stmt.type === 'AssignmentStatement') {
      (stmt.variables ?? []).forEach((variable, idx) => {
        if ((variable.type !== 'MemberExpression' && variable.type !== 'IndexExpression') || variable.indexer === ':') return;
        if (!resolveBaseIsMenu(variable.base)) return;
        const field = luaMemberName(variable);
        if (!field) return;
        const rhs = stmt.init?.[idx];
        if (isFalsyLiteralMenuWrite(rhs)) armedOnOpen.delete(field);
        else if (isGuaranteedTruthyMenuWrite(rhs)) armedOnOpen.add(field);
      });
    }
    if (containsStop) return true;
  }
  return false;
}

function isMenuObjectRef(
  node: LuaAstNode | undefined,
  menu: ConvUiMenuCandidate,
  fnNode?: LuaAstNode,
): boolean {
  if (!node || node.type !== 'Identifier' || !node.name) return false;
  if (!node.isLocal) return menu.globalNames.has(node.name);
  if (fnNode && menu.selfParams.get(fnNode) === node.name) {
    const b = menu.scopeIndex.identToBinding.get(node);
    if (b?.scopeNode === fnNode && b.kind === 'param') return true;
  }
  const binding = menu.scopeIndex.identToBinding.get(node);
  return !!binding && menu.localBindings.has(binding);
}

function readMenuFieldAccess(
  node: LuaAstNode | undefined,
  menu: ConvUiMenuCandidate,
  fnNode?: LuaAstNode,
): string | undefined {
  if (!node || (node.type !== 'MemberExpression' && node.type !== 'IndexExpression') || node.indexer === ':') {
    return undefined;
  }
  if (!isMenuObjectRef(node.base, menu, fnNode)) return undefined;
  return luaMemberName(node);
}

function callsMenuDisplay(
  root: LuaAstNode | undefined,
  menu: ConvUiMenuCandidate,
  fnNode?: LuaAstNode,
  depth = 0,
): boolean {
  if (!root || depth > 2) return false;
  let found = false;
  walkLuaAst(root, node => {
    if (found || node.type !== 'CallExpression') return;
    const isPcall = node.base?.isLocal === false && luaIdentifier(node.base) === 'pcall';
    const target = isPcall ? node.arguments?.[0] : node.base;
    if (!target) return;
    if ((target.type === 'MemberExpression' || target.type === 'IndexExpression')
      && isMenuObjectRef(target.base, menu, fnNode)) {
      const member = luaMemberName(target);
      if (member === 'display') {
        found = true;
        return;
      }
      if (member && member !== 'onShowMenu' && member !== 'showMenuCallback' && member !== 'onUpdate') {
        const helperAst = menu.methods.get(member);
        if (helperAst && callsMenuDisplay(helperAst.body ? { type: 'Block', body: helperAst.body } : undefined, menu, helperAst, depth + 1)) {
          found = true;
        }
      }
    }
  });
  return found;
}

function hasScheduledTimerRedraw(
  fnAst: LuaAstNode | undefined,
  menu: ConvUiMenuCandidate,
): boolean {
  if (!fnAst) return false;
  let scheduled = false;
  walkLuaAst(fnAst, node => {
    if (scheduled || node.type !== 'CallExpression') return;
    const calleeName = node.base?.type === 'Identifier'
      ? luaIdentifier(node.base)
      : node.base?.type === 'MemberExpression'
        ? luaIdentifier(node.base.identifier)
        : null;
    if (!calleeName || !LUA_TIMER_CALLEE_RE.test(calleeName)) return;
    for (const arg of node.arguments ?? []) {
      if (arg.type === 'FunctionDeclaration' && callsMenuDisplay({ type: 'Block', body: arg.body }, menu, arg)) {
        scheduled = true;
        return;
      }
      const field = readMenuFieldAccess(arg, menu, fnAst);
      if (field === 'display' || (field && callsMenuDisplay({ type: 'Block', body: menu.methods.get(field)?.body }, menu, menu.methods.get(field)))) {
        scheduled = true;
        return;
      }
    }
  });
  return scheduled;
}

interface MenuCondEval {
  ok: boolean;
  fields: Set<string>;
  alwaysTrue?: boolean;
}

function collectDynamicMenuFieldsInExpr(
  expr: LuaAstNode | undefined,
  menu: ConvUiMenuCandidate,
  fnNode: LuaAstNode | undefined,
  outFields: Set<string>,
): boolean {
  if (!expr) return true;
  let safe = true;
  walkLuaAst(expr, node => {
    if (!safe) return;
    if (node.type === 'CallExpression' && (node.base?.type === 'MemberExpression' || node.base?.type === 'IndexExpression')
      && isMenuObjectRef(node.base.base, menu, fnNode)) {
      safe = false;
      return;
    }
    const field = readMenuFieldAccess(node, menu, fnNode);
    if (!field) return;
    if (menu.methods.has(field) || menu.constantTruthyFields.has(field)) return;
    outFields.add(field);
  });
  return safe;
}

function evaluateMenuRedrawCondition(
  cond: LuaAstNode | undefined,
  menu: ConvUiMenuCandidate,
  armedOnOpen: ReadonlySet<string>,
  fnNode: LuaAstNode | undefined,
  inverted = false,
  depth = 0,
): MenuCondEval {
  const fail = (): MenuCondEval => ({ ok: false, fields: new Set() });
  if (!cond || depth > 4) return fail();

  if (cond.type === 'UnaryExpression' && cond.operator === 'not') {
    return evaluateMenuRedrawCondition(cond.argument as LuaAstNode | undefined, menu, armedOnOpen, fnNode, !inverted, depth + 1);
  }

  if (cond.type === 'LogicalExpression') {
    const effectiveAnd = (!inverted && cond.operator === 'and') || (inverted && cond.operator === 'or');
    const left = evaluateMenuRedrawCondition(cond.left, menu, armedOnOpen, fnNode, inverted, depth + 1);
    const right = evaluateMenuRedrawCondition(cond.right, menu, armedOnOpen, fnNode, inverted, depth + 1);
    if (effectiveAnd) {
      if (!left.ok || !right.ok) return fail();
      return {
        ok: true,
        fields: new Set([...left.fields, ...right.fields]),
        alwaysTrue: Boolean(left.alwaysTrue && right.alwaysTrue),
      };
    }
    const leftValid = left.ok && (left.fields.size > 0 || left.alwaysTrue);
    const rightValid = right.ok && (right.fields.size > 0 || right.alwaysTrue);
    if (!leftValid && !rightValid) return fail();
    const chosen = leftValid ? left : right;
    return { ok: true, fields: new Set(chosen.fields), alwaysTrue: chosen.alwaysTrue };
  }

  if (cond.type === 'BooleanLiteral') {
    const val = inverted ? cond.value !== true : cond.value === true;
    return val ? { ok: true, fields: new Set(), alwaysTrue: true } : fail();
  }
  if (cond.type === 'NumericLiteral' || cond.type === 'StringLiteral') {
    return inverted ? fail() : { ok: true, fields: new Set(), alwaysTrue: true };
  }
  if (cond.type === 'NilLiteral') {
    return inverted ? { ok: true, fields: new Set(), alwaysTrue: true } : fail();
  }

  if (cond.type === 'BinaryExpression') {
    const op = cond.operator;
    const leftField = readMenuFieldAccess(cond.left, menu, fnNode);
    const rightField = readMenuFieldAccess(cond.right, menu, fnNode);
    if (op === '==' || op === '~=') {
      const effectiveEq = inverted ? op === '~=' : op === '==';
      const field = leftField ?? rightField;
      const other = leftField ? cond.right : rightField ? cond.left : undefined;
      if (field && other) {
        const isNilOrFalse = other.type === 'NilLiteral' || (other.type === 'BooleanLiteral' && other.value === false);
        const isTrueLit = other.type === 'BooleanLiteral' && other.value === true;
        if (effectiveEq) {
          if (isNilOrFalse) return fail();
          if (menu.methods.has(field) || menu.constantTruthyFields.has(field)) {
            return { ok: true, fields: new Set(), alwaysTrue: true };
          }
          return armedOnOpen.has(field) ? { ok: true, fields: new Set([field]) } : fail();
        }
        // effective `~=`: `menu._liftAt ~= nil` or `menu._liftAt ~= false` is a positive armed check.
        if (isNilOrFalse) {
          if (menu.methods.has(field) || menu.constantTruthyFields.has(field)) {
            return { ok: true, fields: new Set(), alwaysTrue: true };
          }
          return armedOnOpen.has(field) ? { ok: true, fields: new Set([field]) } : fail();
        }
        if (isTrueLit) return fail();
      }
      return fail();
    }
    if (op === '>' || op === '>=' || op === '<' || op === '<=') {
      const fields = new Set<string>();
      if (!collectDynamicMenuFieldsInExpr(cond.left, menu, fnNode, fields)
        || !collectDynamicMenuFieldsInExpr(cond.right, menu, fnNode, fields)) {
        return fail();
      }
      if (fields.size === 0 || ![...fields].every(f => armedOnOpen.has(f))) return fail();
      return { ok: true, fields };
    }
    return fail();
  }

  if (cond.type === 'CallExpression') {
    if (inverted) return fail();
    const base = cond.base;
    if ((base?.type === 'MemberExpression' || base?.type === 'IndexExpression') && isMenuObjectRef(base.base, menu, fnNode)) {
      const methodName = luaMemberName(base);
      const methodAst = methodName ? menu.methods.get(methodName) : undefined;
      if (!methodAst?.body?.length) return fail();
      // Reject call arguments that depend on un-armed dynamic menu fields.
      const argFields = new Set<string>();
      for (const arg of cond.arguments ?? []) {
        if (!collectDynamicMenuFieldsInExpr(arg, menu, fnNode, argFields)) return fail();
      }
      if (![...argFields].every(f => armedOnOpen.has(f))) return fail();
      if (methodAst.body.length !== 1 || methodAst.body[0]?.type !== 'ReturnStatement') return fail();
      const retExpr = methodAst.body[0].arguments?.[0];
      const inner = evaluateMenuRedrawCondition(retExpr, menu, armedOnOpen, methodAst, false, depth + 1);
      if (!inner.ok) return fail();
      return { ok: true, fields: new Set([...argFields, ...inner.fields]), alwaysTrue: inner.alwaysTrue };
    }
    return fail();
  }

  const directField = readMenuFieldAccess(cond, menu, fnNode);
  if (directField) {
    if (inverted) return fail();
    if (menu.methods.has(directField) || menu.constantTruthyFields.has(directField)) {
      return { ok: true, fields: new Set(), alwaysTrue: true };
    }
    return armedOnOpen.has(directField) ? { ok: true, fields: new Set([directField]) } : fail();
  }

  if (!inverted && cond.type === 'Identifier' && cond.isLocal === false && cond.name === 'Helper') {
    return { ok: true, fields: new Set(), alwaysTrue: true };
  }
  return fail();
}

function onUpdateHasArmedRedraw(
  onUpdateAst: LuaAstNode,
  menu: ConvUiMenuCandidate,
  armedOnOpen: ReadonlySet<string>,
): boolean {
  const scan = scanLuaScope(onUpdateAst);
  const displayCalls: LuaAstNode[] = [];
  for (const node of scan.nodes) {
    if (node.type !== 'CallExpression') continue;
    const isPcall = node.base?.isLocal === false && luaIdentifier(node.base) === 'pcall';
    const target = isPcall ? node.arguments?.[0] : node.base;
    if (!target || (target.type !== 'MemberExpression' && target.type !== 'IndexExpression')) continue;
    if (!isMenuObjectRef(target.base, menu, onUpdateAst)) continue;
    const member = luaMemberName(target);
    if (member === 'display') {
      displayCalls.push(node);
    } else if (member && member !== 'onUpdate' && member !== 'onShowMenu' && member !== 'showMenuCallback') {
      const helperAst = menu.methods.get(member);
      if (helperAst && callsMenuDisplay({ type: 'Block', body: helperAst.body }, menu, helperAst, 1)) {
        displayCalls.push(node);
      }
    }
  }
  if (displayCalls.length === 0) return false;

  for (const call of displayCalls) {
    // Do not cross nested FunctionDeclarations unless wrapped in a zero-arg pcall(function() ... end).
    const enclosingClauses: LuaAstNode[] = [];
    let blocked = false;
    for (let cur: LuaAstNode | undefined = call, parent = scan.parents.get(call);
      parent && cur !== onUpdateAst;
      cur = parent, parent = scan.parents.get(parent)) {
      if (parent === onUpdateAst) break;
      if (parent.type === 'FunctionDeclaration') {
        const pcallParent = scan.parents.get(parent);
        const isSafeThunk = pcallParent?.type === 'CallExpression'
          && pcallParent.base?.isLocal === false && luaIdentifier(pcallParent.base) === 'pcall'
          && pcallParent.arguments?.length === 1 && pcallParent.arguments[0] === parent;
        if (!isSafeThunk) { blocked = true; break; }
        continue;
      }
      if (parent.type === 'ElseClause') { blocked = true; break; }
      if (parent.type === 'IfClause' || parent.type === 'ElseifClause') {
        const ifStmt = scan.parents.get(parent);
        if (parent.type === 'ElseifClause' && ifStmt?.clauses) {
          // Ensure no earlier clause is unconditionally true.
          for (const sibling of ifStmt.clauses) {
            if (sibling === parent) break;
            if (literalLuaTruthiness(sibling.condition as LuaAstNode) === true) blocked = true;
          }
        }
        enclosingClauses.push(parent);
      }
    }
    if (blocked) continue;

    // Include inverted conditions from top-level early guard-returns preceding this call in onUpdate.
    const guardConditions: Array<{ cond: LuaAstNode; inverted: boolean }> = [];
    const callStart = call.range?.[0] ?? Number.MAX_SAFE_INTEGER;
    for (const stmt of onUpdateAst.body ?? []) {
      if ((stmt.range?.[0] ?? 0) >= callStart) break;
      if (luaContains(stmt, call)) break;
      if (stmt.type === 'ReturnStatement') { blocked = true; break; }
      if (stmt.type === 'IfStatement') {
        const clauses = (stmt.clauses as LuaAstNode[] | undefined) ?? [];
        if (clauses.length === 1 && clauses[0].type === 'IfClause' && clauseEndsWithReturn(clauses[0].body) && clauses[0].condition) {
          guardConditions.push({ cond: clauses[0].condition as LuaAstNode, inverted: true });
        }
      }
    }
    if (blocked) continue;

    for (const clause of enclosingClauses) {
      if (clause.condition) guardConditions.push({ cond: clause.condition as LuaAstNode, inverted: false });
    }

    if (guardConditions.length === 0) {
      // Unconditional display() in onUpdate redraws on every tick.
      return true;
    }

    let allOk = true;
    const totalDynamicFields = new Set<string>();
    for (const item of guardConditions) {
      const res = evaluateMenuRedrawCondition(item.cond, menu, armedOnOpen, onUpdateAst, item.inverted);
      if (!res.ok) { allOk = false; break; }
      for (const f of res.fields) totalDynamicFields.add(f);
    }
    if (allOk && (totalDynamicFields.size > 0 || guardConditions.every(g =>
      evaluateMenuRedrawCondition(g.cond, menu, armedOnOpen, onUpdateAst, g.inverted).alwaysTrue))) {
      return true;
    }
  }
  return false;
}

function validateConversationMenuRedraw(
  mdFiles: ExtensionProject['files'],
  luaFiles: ExtensionProject['files'],
): ProjectCrossFileFinding[] {
  const convEvents = collectConversationStartedLuaEvents(mdFiles);
  if (convEvents.size === 0 || luaFiles.length === 0) return [];

  const parsedFiles: ConvParsedLuaFile[] = [];
  const menusByName = new Map<string, ConvUiMenuCandidate[]>();
  const menusByGlobal = new Map<string, ConvUiMenuCandidate>();

  for (const luaFile of luaFiles) {
    const source = buildLuaAnalysisSource(luaFile.content || '');
    let envRebound = false;
    let astNode: LuaAstNode;
    try {
      astNode = parse(source.content, {
        comments: false, locations: true, ranges: true, scope: true, encodingMode: 'pseudo-latin1',
        onLocalDeclaration(name: string) { if (name === '_ENV') envRebound = true; },
      }) as LuaAstNode;
    } catch {
      continue;
    }
    const scopeIndex = collectLuaLexicalScopes(astNode, envRebound);
    populateLuaBindingStrings(scopeIndex, source.substituted);
    const { bindings, declToBinding, identToBinding, functions, nodeFnScope, reboundGlobals, opaqueGlobals } = scopeIndex;

    const localFnDefs = new Map<LuaLocalBinding, { fn: LuaAstNode; count: number; tainted: boolean }>();
    const globalFnDefs = new Map<string, { fn: LuaAstNode; count: number; tainted: boolean }>();
    const recordLocalFn = (binding: LuaLocalBinding | undefined, expr: LuaAstNode | undefined) => {
      if (!binding || !expr) return;
      if (expr.type === 'FunctionDeclaration') {
        const cur = localFnDefs.get(binding);
        localFnDefs.set(binding, { fn: expr, count: (cur?.count ?? 0) + 1, tainted: cur?.tainted ?? false });
      } else if (expr.type !== 'NilLiteral') {
        const cur = localFnDefs.get(binding);
        if (cur) cur.tainted = true;
        else localFnDefs.set(binding, { fn: expr, count: 0, tainted: true });
      }
    };
    const recordGlobalFn = (name: string | null, expr: LuaAstNode | undefined) => {
      if (!name || !expr) return;
      if (expr.type === 'FunctionDeclaration') {
        const cur = globalFnDefs.get(name);
        globalFnDefs.set(name, { fn: expr, count: (cur?.count ?? 0) + 1, tainted: cur?.tainted ?? false });
      } else if (expr.type !== 'NilLiteral') {
        const cur = globalFnDefs.get(name);
        if (cur) cur.tainted = true;
        else globalFnDefs.set(name, { fn: expr, count: 0, tainted: true });
      }
    };

    // Discover UI menu table candidates and function definitions in this file.
    const candidates: ConvUiMenuCandidate[] = [];
    const candidateByGlobal = new Map<string, ConvUiMenuCandidate>();
    const candidateByBinding = new Map<LuaLocalBinding, ConvUiMenuCandidate>();

    const makeCandidate = (loc?: { line: number; column: number }): ConvUiMenuCandidate => {
      const c: ConvUiMenuCandidate = {
        file: luaFile.path,
        declLoc: loc,
        globalNames: new Set(),
        localBindings: new Set(),
        methods: new Map(),
        selfParams: new Map(),
        topLevelTruthyFields: new Map(),
        mutatedInFunctions: new Set(),
        constantTruthyFields: new Set(),
        scopeIndex,
        substituted: source.substituted,
      };
      candidates.push(c);
      return c;
    };

    const inspectTableCtor = (cand: ConvUiMenuCandidate, ctor: LuaAstNode) => {
      if (ctor.loc?.start && !cand.declLoc) {
        cand.declLoc = { line: ctor.loc.start.line, column: ctor.loc.start.column + 1 };
      }
      for (const field of ctor.fields ?? []) {
        if (field.type !== 'TableKeyString' && field.type !== 'TableKey') continue;
        const fieldName = field.type === 'TableKeyString'
          ? luaIdentifier(field.key as LuaAstNode)
          : (field.key?.type === 'StringLiteral' && typeof field.key.value === 'string' ? field.key.value : null);
        const val = field.value as LuaAstNode | undefined;
        if (!fieldName || !val) continue;
        if (fieldName === 'name' && val.type === 'StringLiteral' && typeof val.value === 'string'
          && val.value && !luaStringLiteralTainted(val, source.substituted)) {
          cand.menuName ??= val.value;
        }
        if (val.type === 'FunctionDeclaration') {
          cand.methods.set(fieldName, val);
        } else if (!isFalsyLiteralMenuWrite(val) && isGuaranteedTruthyMenuWrite(val)) {
          cand.topLevelTruthyFields.set(fieldName, true);
        } else if (isFalsyLiteralMenuWrite(val)) {
          cand.topLevelTruthyFields.set(fieldName, false);
        }
      }
    };

    const extractCtorFromInit = (init: LuaAstNode | undefined): LuaAstNode | undefined => {
      if (!init) return undefined;
      if (init.type === 'TableConstructorExpression') return init;
      if (init.type === 'LogicalExpression' && init.operator === 'or' && init.right?.type === 'TableConstructorExpression') {
        return init.right;
      }
      return undefined;
    };

    walkLuaAst(astNode, node => {
      if (node.type === 'FunctionDeclaration' && node.identifier?.type === 'Identifier') {
        if (node.isLocal) recordLocalFn(declToBinding.get(node.identifier), node);
        else recordGlobalFn(luaIdentifier(node.identifier), node);
      } else if (node.type === 'LocalStatement') {
        (node.variables ?? []).forEach((v, idx) => {
          const b = declToBinding.get(v);
          const init = node.init?.[idx];
          if (init) recordLocalFn(b, init);
          if (!b || b.writes !== 1 || !init) return;
          const ctor = extractCtorFromInit(init);
          if (ctor && nodeFnScope.get(node) === undefined) {
            const cand = makeCandidate(node.loc?.start ? { line: node.loc.start.line, column: node.loc.start.column + 1 } : undefined);
            cand.localBindings.add(b);
            candidateByBinding.set(b, cand);
            inspectTableCtor(cand, ctor);
          } else if (init.type === 'Identifier' && !init.isLocal && init.name) {
            const existing = candidateByGlobal.get(init.name);
            if (existing) {
              existing.localBindings.add(b);
              candidateByBinding.set(b, existing);
            }
          } else if (init.type === 'Identifier' && init.isLocal) {
            const targetB = identToBinding.get(init);
            const existing = targetB ? candidateByBinding.get(targetB) : undefined;
            if (existing) {
              existing.localBindings.add(b);
              candidateByBinding.set(b, existing);
            }
          }
        });
      } else if (node.type === 'AssignmentStatement') {
        (node.variables ?? []).forEach((v, idx) => {
          const init = node.init?.[idx];
          if (v.type === 'Identifier') {
            if (v.isLocal) recordLocalFn(identToBinding.get(v), init);
            else recordGlobalFn(luaIdentifier(v), init);
            if (!v.isLocal && v.name && init && nodeFnScope.get(node) === undefined) {
              const ctor = extractCtorFromInit(init);
              if (ctor) {
                let cand = candidateByGlobal.get(v.name);
                if (!cand) {
                  cand = makeCandidate(node.loc?.start ? { line: node.loc.start.line, column: node.loc.start.column + 1 } : undefined);
                  cand.globalNames.add(v.name);
                  candidateByGlobal.set(v.name, cand);
                }
                inspectTableCtor(cand, ctor);
              } else if (init.type === 'Identifier' && init.isLocal) {
                const targetB = identToBinding.get(init);
                const existing = targetB ? candidateByBinding.get(targetB) : undefined;
                if (existing) {
                  existing.globalNames.add(v.name);
                  candidateByGlobal.set(v.name, existing);
                }
              }
            }
          }
        });
      }
    });

    // Second pass over member declarations and assignments to populate menu methods, `.name`, and constant vs dynamic fields.
    const resolveCand = (base: LuaAstNode | undefined): ConvUiMenuCandidate | undefined => {
      if (!base || base.type !== 'Identifier' || !base.name) return undefined;
      if (!base.isLocal) return candidateByGlobal.get(base.name);
      const b = identToBinding.get(base);
      return b ? candidateByBinding.get(b) : undefined;
    };

    walkLuaAst(astNode, node => {
      if (node.type === 'FunctionDeclaration'
        && (node.identifier?.type === 'MemberExpression' || node.identifier?.type === 'IndexExpression')) {
        const cand = resolveCand(node.identifier.base);
        const member = luaMemberName(node.identifier);
        if (cand && member) {
          cand.methods.set(member, node);
          if (node.identifier.indexer === ':') cand.selfParams.set(node, 'self');
          if (nodeFnScope.get(node) !== undefined) cand.mutatedInFunctions.add(member);
        }
        return;
      }
      if (node.type === 'AssignmentStatement') {
        const inFn = nodeFnScope.get(node) !== undefined;
        (node.variables ?? []).forEach((v, idx) => {
          if (v.type !== 'MemberExpression' && v.type !== 'IndexExpression') return;
          const cand = resolveCand(v.base);
          if (!cand) return;
          const member = luaMemberName(v);
          if (!member) return;
          const rhs = node.init?.[idx];
          if (!inFn && member === 'name' && rhs?.type === 'StringLiteral' && typeof rhs.value === 'string'
            && rhs.value && !luaStringLiteralTainted(rhs, source.substituted)) {
            cand.menuName ??= rhs.value;
          }
          if (rhs?.type === 'FunctionDeclaration') {
            cand.methods.set(member, rhs);
            if (inFn) cand.mutatedInFunctions.add(member);
            return;
          }
          if (inFn) {
            cand.mutatedInFunctions.add(member);
          } else if (isFalsyLiteralMenuWrite(rhs)) {
            cand.topLevelTruthyFields.set(member, false);
          } else if (isGuaranteedTruthyMenuWrite(rhs)) {
            cand.topLevelTruthyFields.set(member, true);
          }
        });
      }
    });

    for (const cand of candidates) {
      if (!cand.menuName || (!cand.methods.has('onShowMenu') && !cand.methods.has('showMenuCallback'))) continue;
      for (const [field, truthy] of cand.topLevelTruthyFields) {
        if (truthy && field !== 'active' && !cand.mutatedInFunctions.has(field)) {
          cand.constantTruthyFields.add(field);
        }
      }
      const list = menusByName.get(cand.menuName) ?? [];
      list.push(cand);
      menusByName.set(cand.menuName, list);
      for (const g of cand.globalNames) {
        if (!menusByGlobal.has(g)) menusByGlobal.set(g, cand);
      }
    }

    // Extract RegisterEvent calls for events in convEvents (supporting direct, pcall, immutable aliases, and forwarding wrappers).
    const isUnshadowedGlobal = (node: LuaAstNode | undefined, expected: string): boolean =>
      luaIdentifier(node) === expected && node?.isLocal === false && !opaqueGlobals && !reboundGlobals.has(expected);
    const registrarBindings = new Set<LuaLocalBinding>();
    for (const b of bindings) {
      if ((b.kind === 'local' || b.kind === 'function') && b.writes === 1 && isUnshadowedGlobal(b.init, 'RegisterEvent')) {
        registrarBindings.add(b);
      }
    }
    const isEngineRegistrar = (node: LuaAstNode | undefined): boolean => {
      if (!node) return false;
      if (isUnshadowedGlobal(node, 'RegisterEvent')) return true;
      if (!node.isLocal) return false;
      const b = identToBinding.get(node);
      return !!b && registrarBindings.has(b);
    };

    const regWrappers = new Map<LuaLocalBinding, { eventIdx: number; handlerIdx: number }>();
    const wrapperInnerCalls = new Set<LuaAstNode>();
    for (const [fnDecl, fnBinding] of functions) {
      if (!fnBinding || fnBinding.writes !== 1 || !fnDecl.body?.length) continue;
      const params = (fnDecl.parameters || []).map(luaIdentifier);
      if (params.length < 2 || new Set(params).size !== params.length) continue;
      let innerCall: LuaAstNode | undefined;
      let eventIdx = -1;
      let handlerIdx = -1;
      let valid = true;
      for (const stmt of fnDecl.body) {
        if (stmt.type === 'CallStatement') {
          if (innerCall || !stmt.expression || !isEngineRegistrar(stmt.expression.base)) { valid = false; break; }
          const a0 = stmt.expression.arguments?.[0];
          const a1 = stmt.expression.arguments?.[1];
          const eIdx = a0?.type === 'Identifier' && a0.isLocal ? params.indexOf(luaIdentifier(a0)) : -1;
          const hIdx = a1?.type === 'Identifier' && a1.isLocal ? params.indexOf(luaIdentifier(a1)) : -1;
          if (eIdx < 0 || hIdx < 0) { valid = false; break; }
          innerCall = stmt.expression;
          eventIdx = eIdx;
          handlerIdx = hIdx;
          continue;
        }
        if (stmt.type === 'AssignmentStatement') continue;
        valid = false;
        break;
      }
      if (valid && innerCall && eventIdx >= 0 && handlerIdx >= 0) {
        regWrappers.set(fnBinding, { eventIdx, handlerIdx });
        wrapperInnerCalls.add(innerCall);
      }
    }

    const registrations: Array<{ event: string; handlerExpr: LuaAstNode }> = [];
    walkLuaAst(astNode, node => {
      if (node.type !== 'CallExpression' || wrapperInnerCalls.has(node)) return;
      let eventArg: LuaAstNode | undefined;
      let handlerArg: LuaAstNode | undefined;
      if (isEngineRegistrar(node.base)) {
        eventArg = node.arguments?.[0];
        handlerArg = node.arguments?.[1];
      } else if (isUnshadowedGlobal(node.base, 'pcall') && isEngineRegistrar(node.arguments?.[0])) {
        eventArg = node.arguments?.[1];
        handlerArg = node.arguments?.[2];
      } else if (node.base?.type === 'Identifier' && node.base.isLocal) {
        const b = identToBinding.get(node.base);
        const spec = b ? regWrappers.get(b) : undefined;
        if (spec) {
          eventArg = node.arguments?.[spec.eventIdx];
          handlerArg = node.arguments?.[spec.handlerIdx];
        }
      }
      if (!eventArg || !handlerArg) return;
      const resolved = resolveLuaRegistrationStrings(eventArg, identToBinding, source.substituted);
      if (!resolved) return;
      for (const item of resolved) {
        if (!item.prefix && !item.tainted && convEvents.has(item.value)) {
          registrations.push({ event: item.value, handlerExpr: handlerArg });
        }
      }
    });

    const localFunctions = new Map<LuaLocalBinding, LuaAstNode>();
    for (const [b, info] of localFnDefs) {
      if (info.count === 1 && !info.tainted) localFunctions.set(b, info.fn);
    }
    const globalFunctions = new Map<string, LuaAstNode>();
    for (const [name, info] of globalFnDefs) {
      if (info.count === 1 && !info.tainted) globalFunctions.set(name, info.fn);
    }

    parsedFiles.push({ file: luaFile.path, ast: astNode, source, scopeIndex, localFunctions, globalFunctions, registrations });
  }

  if (menusByName.size === 0) return [];

  const resolveHandlerFunction = (
    luaDoc: ConvParsedLuaFile,
    expr: LuaAstNode,
  ): { fn: LuaAstNode; ownerMenu?: ConvUiMenuCandidate } | undefined => {
    if (expr.type === 'FunctionDeclaration') return { fn: expr };
    if (expr.type === 'Identifier') {
      if (expr.isLocal) {
        const b = luaDoc.scopeIndex.identToBinding.get(expr);
        const fn = b ? luaDoc.localFunctions.get(b) : undefined;
        return fn ? { fn } : undefined;
      }
      const fn = expr.name ? luaDoc.globalFunctions.get(expr.name) : undefined;
      return fn ? { fn } : undefined;
    }
    if (expr.type === 'MemberExpression' || expr.type === 'IndexExpression') {
      const member = luaMemberName(expr);
      if (!member) return undefined;
      if (expr.base?.type === 'Identifier' && !expr.base.isLocal && expr.base.name) {
        const menu = menusByGlobal.get(expr.base.name);
        const fn = menu?.methods.get(member);
        if (menu && fn) return { fn, ownerMenu: menu };
      }
      if (expr.base?.type === 'Identifier' && expr.base.isLocal) {
        const b = luaDoc.scopeIndex.identToBinding.get(expr.base);
        for (const list of menusByName.values()) {
          for (const menu of list) {
            if (b && menu.localBindings.has(b)) {
              const fn = menu.methods.get(member);
              if (fn) return { fn, ownerMenu: menu };
            }
          }
        }
      }
    }
    return undefined;
  };

  const inspectOpenSitesInFunction = (
    luaDoc: ConvParsedLuaFile,
    fnAst: LuaAstNode,
    hop = 0,
  ): Array<{ menu: ConvUiMenuCandidate; callNode: LuaAstNode; viaOpenMethod: boolean; isMenuAlias: (n: LuaAstNode | undefined) => boolean }> => {
    const results: Array<{ menu: ConvUiMenuCandidate; callNode: LuaAstNode; viaOpenMethod: boolean; isMenuAlias: (n: LuaAstNode | undefined) => boolean }> = [];
    const rawgetAvailable = !luaDoc.scopeIndex.opaqueGlobals && !luaDoc.scopeIndex.reboundGlobals.has('rawget');
    const localMenuMap = new Map<LuaLocalBinding, ConvUiMenuCandidate>();

    // Collect local menu aliases inside fnAst (`rawget(_G, "MenuGlobal")`, `MenuGlobal`, or `if m.name == "MenuName" then alias = m`).
    walkLuaAst(fnAst.body ? { type: 'Block', body: fnAst.body } : fnAst, node => {
      if (node.type === 'LocalStatement') {
        (node.variables ?? []).forEach((v, idx) => {
          const b = luaDoc.scopeIndex.declToBinding.get(v);
          const init = node.init?.[idx];
          if (!b || !init) return;
          const ns = readLuaNamespace(init, rawgetAvailable);
          if (ns && menusByGlobal.has(ns)) {
            localMenuMap.set(b, menusByGlobal.get(ns)!);
          } else if (init.type === 'Identifier' && init.isLocal) {
            const srcB = luaDoc.scopeIndex.identToBinding.get(init);
            if (srcB && localMenuMap.has(srcB)) localMenuMap.set(b, localMenuMap.get(srcB)!);
          }
        });
      }
      if (node.type === 'IfClause' || node.type === 'ElseifClause') {
        const cond = node.condition as LuaAstNode | undefined;
        if (cond?.type === 'BinaryExpression' && cond.operator === '==') {
          const checkSide = (memberSide: LuaAstNode | undefined, litSide: LuaAstNode | undefined) => {
            if (memberSide?.type === 'MemberExpression' && luaIdentifier(memberSide.identifier) === 'name'
              && litSide?.type === 'StringLiteral' && typeof litSide.value === 'string') {
              const targetMenus = menusByName.get(litSide.value);
              const targetMenu = targetMenus?.[0];
              if (!targetMenu) return;
              for (const st of node.body ?? []) {
                if (st.type === 'AssignmentStatement' && st.variables?.[0]?.type === 'Identifier' && st.variables[0].isLocal) {
                  const b = luaDoc.scopeIndex.identToBinding.get(st.variables[0]);
                  if (b && !localMenuMap.has(b)) localMenuMap.set(b, targetMenu);
                }
              }
            }
          };
          checkSide(cond.left, cond.right);
          checkSide(cond.right, cond.left);
        }
      }
    });

    const resolveMenuRefInFn = (base: LuaAstNode | undefined): ConvUiMenuCandidate | undefined => {
      if (!base) return undefined;
      const ns = readLuaNamespace(base, rawgetAvailable);
      if (ns && menusByGlobal.has(ns)) return menusByGlobal.get(ns);
      if (base.type === 'Identifier' && base.isLocal) {
        const b = luaDoc.scopeIndex.identToBinding.get(base);
        if (!b) return undefined;
        if (localMenuMap.has(b)) return localMenuMap.get(b);
        for (const list of menusByName.values()) {
          for (const menu of list) {
            if (menu.file === luaDoc.file && menu.localBindings.has(b)) return menu;
          }
        }
      }
      return undefined;
    };

    walkLuaAst(fnAst.body ? { type: 'Block', body: fnAst.body } : fnAst, node => {
      if (node.type !== 'CallExpression') return;
      const isPcall = node.base?.isLocal === false && luaIdentifier(node.base) === 'pcall';
      const callee = isPcall ? node.arguments?.[0] : node.base;
      const args = isPcall ? (node.arguments ?? []).slice(1) : (node.arguments ?? []);
      if (!callee) return;

      if (callee.isLocal === false && luaIdentifier(callee) === 'OpenMenu') {
        const nameArg = args[0];
        let matchedMenus: ConvUiMenuCandidate[] | undefined;
        if (nameArg?.type === 'MemberExpression' && luaIdentifier(nameArg.identifier) === 'name') {
          const refMenu = resolveMenuRefInFn(nameArg.base);
          if (refMenu) matchedMenus = [refMenu];
        } else {
          const strs = resolveLuaRegistrationStrings(nameArg, luaDoc.scopeIndex.identToBinding, luaDoc.source.substituted);
          const lit = strs?.length === 1 && !strs[0].prefix && !strs[0].tainted ? strs[0].value : undefined;
          if (lit) matchedMenus = menusByName.get(lit);
        }
        for (const menu of matchedMenus ?? []) {
          results.push({
            menu,
            callNode: node,
            viaOpenMethod: false,
            isMenuAlias: cand => resolveMenuRefInFn(cand) === menu,
          });
        }
        return;
      }

      if (callee.type === 'MemberExpression' || callee.type === 'IndexExpression') {
        const refMenu = resolveMenuRefInFn(callee.base);
        const member = luaMemberName(callee);
        if (refMenu && member === 'open') {
          const openMethod = refMenu.methods.get('open');
          let callsOpenMenu = false;
          walkLuaAst(openMethod, inner => {
            if (inner.type !== 'CallExpression') return;
            const innerCallee = inner.base?.isLocal === false && luaIdentifier(inner.base) === 'pcall'
              ? inner.arguments?.[0] : inner.base;
            if (innerCallee?.isLocal === false && luaIdentifier(innerCallee) === 'OpenMenu') callsOpenMenu = true;
          });
          if (callsOpenMenu) {
            results.push({
              menu: refMenu,
              callNode: node,
              viaOpenMethod: true,
              isMenuAlias: cand => resolveMenuRefInFn(cand) === refMenu,
            });
          }
          return;
        }
      }

      if (hop < 2 && callee.type === 'Identifier') {
        const nextFn = resolveHandlerFunction(luaDoc, callee);
        if (nextFn && nextFn.fn !== fnAst) {
          results.push(...inspectOpenSitesInFunction(luaDoc, nextFn.fn, hop + 1));
        }
      }
    });

    return results;
  };

  const findings: ProjectCrossFileFinding[] = [];
  const emittedKeys = new Set<string>();

  for (const luaDoc of parsedFiles) {
    for (const reg of luaDoc.registrations) {
      const targetLoc = convEvents.get(reg.event);
      const resolvedHandler = resolveHandlerFunction(luaDoc, reg.handlerExpr);
      if (!resolvedHandler) continue;
      const openSites = inspectOpenSitesInFunction(luaDoc, resolvedHandler.fn);
      for (const site of openSites) {
        const { menu } = site;
        const menuName = menu.menuName!;
        const dedupeKey = `${menu.file}\0${menuName}\0${reg.event}`;
        if (emittedKeys.has(dedupeKey)) continue;

        // Compute dynamic fields guaranteed armed along this conversation-open path.
        const armedOnOpen = new Set<string>(menu.constantTruthyFields);
        applySequentialMenuWrites(resolvedHandler.fn.body, site.isMenuAlias, armedOnOpen, site.callNode);
        if (site.viaOpenMethod) {
          const openAst = menu.methods.get('open');
          if (openAst) applySequentialMenuWrites(openAst.body, b => isMenuObjectRef(b, menu, openAst), armedOnOpen);
        }
        const showCbAst = menu.methods.get('showMenuCallback');
        const onShowAst = menu.methods.get('onShowMenu');
        if (showCbAst) applySequentialMenuWrites(showCbAst.body, b => isMenuObjectRef(b, menu, showCbAst), armedOnOpen);
        if (onShowAst) applySequentialMenuWrites(onShowAst.body, b => isMenuObjectRef(b, menu, onShowAst), armedOnOpen);

        const hasTimerRedraw = hasScheduledTimerRedraw(resolvedHandler.fn, menu)
          || (site.viaOpenMethod && hasScheduledTimerRedraw(menu.methods.get('open'), menu))
          || hasScheduledTimerRedraw(showCbAst, menu)
          || hasScheduledTimerRedraw(onShowAst, menu);

        const onUpdateAst = menu.methods.get('onUpdate');
        const hasUpdateRedraw = !!onUpdateAst && onUpdateHasArmedRedraw(onUpdateAst, menu, armedOnOpen);
        if (hasTimerRedraw || hasUpdateRedraw) continue;

        emittedKeys.add(dedupeKey);
        const anchorAst = onShowAst ?? showCbAst;
        const line = anchorAst?.loc?.start.line ?? menu.declLoc?.line;
        const column = anchorAst?.loc?.start ? anchorAst.loc.start.column + 1 : menu.declLoc?.column;
        findings.push({
          code: 'md_lua.conversation_menu_without_deferred_redraw',
          severity: 'warning',
          file: menu.file,
          ...(line !== undefined ? { line } : {}),
          ...(column !== undefined ? { column } : {}),
          ...(targetLoc ? { target: targetLoc } : {}),
          event: reg.event,
          sourceRef: `${reg.event}->${menuName}`,
          detail: `UI menu "${menuName}" is opened via OpenMenu from <event_conversation_started> Lua event "${reg.event}" without a deferred redraw after open; in X4 an overlay drawn in the same frame is drawn under the conversation menu - add a deferred redraw (e.g. in ${menuName}.onUpdate ~0.3 s after open).`,
        });
      }
    }
  }

  return findings;
}

/** Final declarations are authority; only compact authored calls can produce new diagnostics. */
function validateEffectiveReferenceContracts(context: EffectiveMdReferenceContext) {
  const findings: ProjectCrossFileFinding[] = [];
  const coverageGaps: MdReferenceCoverageGap[] = [];
  let checked = 0;
  const signatureIndexes = new Map<MdLibrarySignature<MdReferenceSourcePoint>, {
    declared: Map<string, { name: string; hasDefault: boolean; point?: MdReferenceSourcePoint }>;
    required: Map<string, { name: string; hasDefault: boolean; point?: MdReferenceSourcePoint }>;
  }>();
  const gapKeys = new Set<string>();
  const gap = (check: string, file: string, reason: string) => {
    const bounded = reason.slice(0, 480);
    const key = JSON.stringify([check, file, bounded]);
    if (!gapKeys.has(key)) { gapKeys.add(key); coverageGaps.push({ check, filePath: file, reason: bounded }); }
  };
  const usable = (point: MdReferenceSourcePoint | undefined): point is MdReferenceSourcePoint & { line: number; column: number } =>
    !!point && !point.reason && Number.isInteger(point.line) && Number.isInteger(point.column) && (point.line ?? 0) > 0 && (point.column ?? 0) > 0;
  const related = (file: string, point: MdReferenceSourcePoint | undefined): ValidationSourceLocation =>
    usable(point) ? { file, line: point.line, column: point.column } : { file };
  const report = (code: ProjectCrossFileFindingCode, severity: 'error' | 'warning', file: string,
    call: MdReferenceFact<MdReferenceSourcePoint>, point: MdReferenceSourcePoint | undefined, detail: string,
    target?: ValidationSourceLocation, suffix = '') => {
    if (!usable(point)) {
      gap(EFFECTIVE_MD_REFERENCE_CHECK, file, `${describeAuthoredMdReference(call)} has no reliable original diagnostic cause position.`);
      return;
    }
    findings.push({ code, severity, file: point.file, line: point.line, column: point.column, target,
      sourceRef: `md.reference:${JSON.stringify([file, call.id, call.role, code, suffix])}`, detail });
  };
  for (const document of context.documents) {
    const firstByName = new Map<string, typeof document.declarations[number]>();
    for (const declaration of document.declarations) {
      const first = firstByName.get(declaration.name);
      if (!first) { firstByName.set(declaration.name, declaration); continue; }
      if (declaration.inherited && first.inherited) continue;
      const authored = declaration.inherited ? first : declaration;
      const point = authored.namePoint ?? authored.point;
      if (!usable(point)) {
        gap(EFFECTIVE_MD_REFERENCE_CHECK, document.file, 'An authored duplicate declaration has no reliable original name position.');
        continue;
      }
      const target = related(document.file, first.namePoint ?? first.point);
      findings.push({ code: 'md.cue_duplicate_name', severity: 'error', file: point.file, line: point.line, column: point.column, target,
        sourceRef: `md.declaration:${JSON.stringify([document.file, authored.id, declaration.name])}`,
        detail: duplicateMdCueMessage(declaration.name, document.name, target) });
    }
    for (const call of document.references) {
      if (findings.length >= 50_000) {
        gap(EFFECTIVE_MD_REFERENCE_CHECK, document.file, 'Effective MD reference diagnostics exceeded the 50000-finding context budget.');
        return { checked, findings, coverageGaps };
      }
      if (call.argumentsUnavailable) {
        gap(EFFECTIVE_MD_ARGUMENT_CHECK, document.file, `${describeAuthoredMdReference(call)} has unavailable supplied arguments. ${call.argumentsUnavailable}`);
      }
      if (call.role === 'reset_cue' || call.role === 'cancel_cue') continue; // Name resolution is their existing contract.
      const primary = mdReferencePoint(call);
      const signal = call.role === 'signal_cue' || call.role === 'signal_cue_instantly';
      const classification = classifyCueRef(call.ref.trim());
      if (signal && classification.kind === 'keyword') continue;
      const resolved = resolveMdLibraryReference(context.index, document.name, call.ref, { cueReference: signal });
      if (!resolved || (resolved.declaration && resolved.declaration.name !== resolved.targetName) || (resolved.declared && !resolved.declaration)) {
        gap(EFFECTIVE_MD_REFERENCE_CHECK, document.file, `${describeAuthoredMdReference(call)} has an external, unsupported, case-mismatched or ambiguous final target.`);
        continue;
      }
      if (call.role === 'cue') {
        checked++;
        if (!resolved.declared) {
          report('md.cue_library_ref_unresolved', 'error', document.file, call, call.refPoint ?? primary,
            `Cue "${call.name}" references library "${call.ref.trim()}", which has no declaration in MD script "${resolved.script.name}".`);
          continue;
        }
      }
      const declaration = resolved.declaration;
      const library = resolved.library;
      if (signal) {
        if (library) report('md.signal_library', 'error', document.file, call, primary,
          `signal_cue targets the <library> "${call.ref}". Libraries are invoked via <run_actions ref="…"> (with purpose="run_actions"), not signalled — X4 errors with "Signalled cue … has no corresponding library".`,
          related(resolved.script.source.file, library.source.point));
        continue;
      }
      if (call.role === 'run_actions' && declaration?.kind === 'cue') {
        report('md.run_actions_nonlibrary', 'warning', document.file, call, primary,
          `run_actions ref "${call.ref}" resolves to a <cue>, not a <library>. <run_actions> targets a library declared with purpose="run_actions".`,
          related(resolved.script.source.file, declaration.source.point));
        continue;
      }
      if (!library) {
        if (!resolved.declared && context.canonicalIndex?.has(resolved.script.name.toLowerCase())) continue;
        gap(EFFECTIVE_MD_REFERENCE_CHECK, document.file, `${describeAuthoredMdReference(call)} has no exact final library contract.`);
        continue;
      }
      if (call.role === 'include_actions') {
        // The existing effective include-purpose pass owns run-library errors and
        // inherited provider changes, using this same final declaration index.
        if (library.purpose !== null && library.purpose !== 'include_actions' && library.purpose !== 'run_actions') {
          gap(EFFECTIVE_MD_REFERENCE_CHECK, document.file, `${describeAuthoredMdReference(call)} has an unsupported library-purpose contract.`);
        }
        continue;
      }
      if ((call.role === 'run_actions' || call.role === 'cue') && !mdLibraryAcceptsArguments(call.role, library.purpose)) {
        gap(EFFECTIVE_MD_REFERENCE_CHECK, document.file, `${describeAuthoredMdReference(call)} has an unsupported library-purpose contract.`);
        continue;
      }
      const signature = library.source.signature;
      if (call.argumentsUnavailable) continue;
      if (!signature || signature.status !== 'known') {
        gap(EFFECTIVE_MD_ARGUMENT_CHECK, document.file, `${describeAuthoredMdReference(call)} has an unavailable parameter signature. ${signature?.status === 'unavailable' ? signature.reason : ''}`);
        continue;
      }
      const provider = resolved.script.source.file;
      let compiled = signatureIndexes.get(signature);
      if (!compiled) {
        compiled = { declared: new Map(signature.parameters.map(parameter => [parameter.name, parameter])),
          required: new Map(signature.parameters.filter(parameter => !parameter.hasDefault).map(parameter => [parameter.name, parameter])) };
        signatureIndexes.set(signature, compiled);
      }
      for (const [index, finding] of libraryArgumentFacts(call, signature, library.source.point, compiled.declared, compiled.required).entries()) {
        if (findings.length >= 50_000) {
          gap(EFFECTIVE_MD_REFERENCE_CHECK, document.file, 'Effective MD reference diagnostics exceeded the 50000-finding context budget.');
          return { checked, findings, coverageGaps };
        }
        if (!usable(finding.point)) {
          gap(EFFECTIVE_MD_ARGUMENT_CHECK, document.file, `${describeAuthoredMdReference(call)} has an argument diagnostic without a reliable original position. ${finding.detail}`);
          continue;
        }
        const target = related(provider, finding.target);
        const coordinate = [target.file, target.line, target.column].filter(part => part !== undefined).join(':');
        report(finding.code, finding.severity, document.file, call, finding.point, `${finding.detail} See ${coordinate}.`, target, String(index));
      }
    }
  }
  return { checked, findings, coverageGaps };
}

export function validateProjectCrossFile(project: ExtensionProject, options: {
  cueIndex?: CueReferenceIndex; effectiveContext?: EffectiveMdReferenceContext;
  canonicalOnlyContext?: EffectiveMdReferenceContext;
} = {}): ProjectCrossFileValidationResult {
  const files = Array.isArray(project?.files) ? project.files : [];
  const structure = validateProjectStructure(project);
  const cueIndex = options.cueIndex ?? indexCueReferences(project, { effectiveContext: options.effectiveContext });
  const findings: ProjectCrossFileFinding[] = [];

  for (const issue of structure) {
    findings.push({
      code: 'project.structure',
      severity: issue.severity,
      file: issue.path,
      detail: issue.detail,
    });
  }
  for (const ref of cueIndex.unresolved) {
    findings.push({
      code: 'cue.unresolved',
      severity: 'error',
      file: ref.file,
      line: ref.line, column: ref.column, sourceRef: ref.sourceRef,
      detail: `Unresolved cue reference "${ref.ref}".`,
    });
  }

  const mdFiles = files.filter(f => f.kind === 'md' || classifyPath(f.path) === 'md');
  // UI includes XML manifests and other assets; only Lua paths are Lua source.
  // Match the language boundary used by project validation and packaging.
  const luaFiles = files.filter(f => classifyPath(f.path) === 'lua');
  for (const manifest of files.filter(f => normPath(f.path).toLowerCase() === 'ui.xml')) {
    const bundle = buildX4UiSourceBundle({
      uiXml: manifest.content || '',
      luaFiles: luaFiles.map(f => ({ path: f.path, text: f.content || '' })),
    });
    for (const registration of bundle.registrations) {
      if (registration.resolution === 'resolved') continue;
      findings.push({ code: 'ui.invalid_registration', severity: 'error', file: manifest.path,
        detail: `UI registration ${JSON.stringify(registration.rawPath)}: ${registration.resolution}.` });
    }
  }
  const raised = mdFiles.flatMap(f => parseMdRaisedLuaEvents(f.content || '', f.path, findings));
  const listened = mdFiles.flatMap(f => parseMdUiListeners(f.content || '', f.path));
  const registrationAnalyses = luaFiles.map(file => ({ file, result: parseLuaRegisteredEvents(file.content || '', file.path) }));
  const parseUnavailable = registrationAnalyses
    .filter(analysis => !analysis.result.available)
    .map(analysis => ({
      file: analysis.file.path,
      detail: analysis.result.detail || 'Lua registration analysis unavailable.',
      gap: analysis.result.gap,
    }));
  const registered = registrationAnalyses.flatMap(analysis => analysis.result.events);
  const emitAnalyses = luaFiles.map(f => parseLuaUiEmits(f.content || '', f.path));
  const emitted = emitAnalyses.flatMap(analysis => analysis.events);
  const emitCoverage = {
    scope: emitAnalyses.some(analysis => analysis.hasProtectedCalls)
      ? 'direct-and-pcall-global-AddUITriggeredEvent-calls' as const
      : 'direct-global-AddUITriggeredEvent-calls' as const,
    exact: emitAnalyses.reduce((n, analysis) => n + analysis.coverage.exact, 0),
    prefix: emitAnalyses.reduce((n, analysis) => n + analysis.coverage.prefix, 0),
    unresolved: emitAnalyses.reduce((n, analysis) => n + analysis.coverage.unresolved, 0),
    files: emitAnalyses.map(analysis => analysis.coverage),
  };
  for (const coverage of emitCoverage.files) {
    const unverified = coverage.prefix + coverage.unresolved;
    if (!unverified) continue;
    findings.push({
      code: 'lua_md.emit_verification_gap', severity: 'info', file: coverage.file,
      detail: `Lua-to-MD event wiring is not fully verified for ${unverified} AddUITriggeredEvent call(s): ${coverage.prefix} prefix-only, ${coverage.unresolved} unresolved (${coverage.reasons.join(', ')}). A possible prefix match is not proof of every runtime event.`,
    });
  }
  const writes = emitAnalyses.flatMap(analysis => analysis.payloadWrites);
  if (writes.some(write => write.returned)) {
    const visibleBindings = emitAnalyses.every(analysis => analysis.coverage.parsed && !analysis.mutations.opaqueGlobals);
    const members = new Map<string, number>();
    const replacedRoots = new Set<string>();
    for (const { mutations } of emitAnalyses) {
      for (const [member, count] of mutations.members) members.set(member, (members.get(member) ?? 0) + count);
      for (const root of mutations.replacedRoots) replacedRoots.add(root);
    }
    resolveFiniteRegistries(emitAnalyses, members, replacedRoots);
    const forwardingByEvent = new Map<string, boolean>();
    for (const write of writes) {
      for (const link of write.returned ?? []) {
        let forwardingVerified = forwardingByEvent.get(link.identity);
        if (forwardingVerified === undefined) {
          forwardingVerified = visibleBindings
            && verifyProjectEmitterForwarding(emitAnalyses, members, replacedRoots, link.identity);
          forwardingByEvent.set(link.identity, forwardingVerified);
        }
        link.bindingUnverified = !visibleBindings || replacedRoots.has('rawget') || members.get(link.member) !== 1 || replacedRoots.has(link.root);
        link.forwardingUnverified = !forwardingVerified;
        if (link.bindingUnverified || link.forwardingUnverified) continue;
        if (!write.events.includes(link.identity)) write.events.push(link.identity);
        if (!write.recipientEvents.includes(link.identity)) write.recipientEvents.push(link.identity);
      }
    }
  }
  const payload = validateIndexedPayloadContract(mdFiles, writes);
  findings.push(...payload.findings);
  for (const unavailable of parseUnavailable) {
    findings.push({
      code: unavailable.gap ? 'md_lua.registration_verification_gap' : 'validation.lua_ast_unavailable',
      severity: unavailable.gap ? 'info' : 'error',
      file: unavailable.file,
      detail: unavailable.detail,
    });
  }

  const registeredEvents = new Set(registered.map(r => r.event));
  const listenedControls = new Map<string, Set<string>>();
  for (const listener of listened) {
    let controls = listenedControls.get(listener.namespace);
    if (!controls) listenedControls.set(listener.namespace, controls = new Set());
    controls.add(listener.control);
  }
  // Dynamic (concat-built) names match by PREFIX: `RegisterEvent(NS .. x)` with literal
  // prefix "ai_influence." satisfies any raised event starting with it, and a dynamic
  // emit "ai_influence.log_" is satisfied by ANY MD listener with that prefix
  // (ROADMAP AAR #2: aic_uix.lua `log_<category>` false-positived the exact match).
  const registeredPrefixes = registered.filter(r => r.prefix).map(r => r.event);
  const missingRegisters = parseUnavailable.length > 0
    ? []
    : raised.filter(r => !registeredEvents.has(r.event)
      && !registeredPrefixes.some(p => r.event.startsWith(p)));
  const missingListeners = emitted.filter(event => {
    const controls = listenedControls.get(event.namespace);
    if (!controls) return true;
    if (!event.prefix) return !controls.has(event.control);
    for (const control of controls) {
      if (control.startsWith(event.control)) return false;
    }
    return true;
  });

  for (const event of missingRegisters) {
    findings.push({
      code: 'md_lua.missing_register',
      severity: 'error',
      file: event.file,
      line: event.line,
      column: event.column,
      event: event.event,
      detail: `MD raises Lua event "${event.event}" but no project Lua file registers it.`,
    });
  }
  for (const event of missingListeners) {
    const dottedIdentity = event.namespace.includes('.') || event.control.includes('.');
    const control = event.control + (event.prefix ? '…' : '');
    const label = dottedIdentity
      ? `screen ${JSON.stringify(event.namespace)} and control ${JSON.stringify(control)}`
      : `"${event.event}${event.prefix ? '…' : ''}"`;
    findings.push({
      code: 'lua_md.missing_listener',
      // A dynamic (prefix) emit with no matching listener is suspicious but can be
      // legitimately handled by fully-dynamic listeners the static scan can't see —
      // warning, not error (honest per the determinism-scope doctrine).
      severity: event.prefix ? 'warning' : 'error',
      file: event.file,
      event: event.event,
      detail: event.prefix
        ? `Lua emits dynamically-named UI events with prefix ${label} but no project MD file listens for any event with that prefix.`
        : `Lua emits UI event ${label} but no project MD file listens for it.`,
    });
  }
  findings.push(...validateConversationMenuRedraw(mdFiles, luaFiles));

  const manifest = findContentManifest(project);
  if (!manifest) {
    findings.push({
      code: 'dep.missing_content_xml',
      severity: 'error',
      file: 'content.xml',
      detail: 'No parseable content.xml manifest is present.',
    });
  } else {
    const seen = new Set<string>();
    for (const dep of manifest.deps) {
      const key = dep.id.toLowerCase();
      if (key === manifest.id.toLowerCase()) {
        findings.push({
          code: 'dep.self',
          severity: 'error',
          file: 'content.xml',
          dependencyId: dep.id,
          detail: `content.xml declares a dependency on itself (${dep.id}).`,
        });
      }
      if (seen.has(key)) {
        findings.push({
          code: 'dep.duplicate',
          severity: 'warning',
          file: 'content.xml',
          dependencyId: dep.id,
          detail: `content.xml declares dependency "${dep.id}" more than once.`,
        });
      }
      seen.add(key);
    }
  }

  // X4 engine semantic the XSD can't express: you SIGNAL cues, you RUN_ACTIONS libraries.
  // signal_cue / signal_cue_instantly aimed at a <library> errors in-game ("Signalled cue …
  // has no corresponding library"); run_actions aimed at a non-library cue is also wrong.
  if (!options.effectiveContext?.complete) {
    const kindByQName = new Map<string, 'library' | 'cue'>();
    for (const f of mdFiles) {
      if (typeof f.content !== 'string') continue; // Missing source is coverage, not an empty inspected document.
      const script = (f.content!.match(/<mdscript\b[^>]*\bname\s*=\s*"([^"]+)"/i)?.[1] || '').toLowerCase();
      const re = /<(cue|library)\b[^>]*\bname\s*=\s*"([^"]+)"/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(f.content!)) !== null) {
        kindByQName.set(`${script}.${m[2].toLowerCase()}`, m[1].toLowerCase() === 'library' ? 'library' : 'cue');
      }
    }
    // ONE classifier for all resolvers (audit A2).
    const qnameOf = (ref: string, ownScript: string): string | null => {
      const c = classifyCueRef(ref);
      if (c.kind === 'cross') return `${c.script.toLowerCase()}.${c.cue.toLowerCase()}`;
      if (c.kind === 'local') return `${ownScript.toLowerCase()}.${c.cue.toLowerCase()}`;
      return null; // keyword/external → can't resolve statically; don't flag
    };
    for (const f of mdFiles) {
      if (typeof f.content !== 'string') continue;
      const ownScript = f.content!.match(/<mdscript\b[^>]*\bname\s*=\s*"([^"]+)"/i)?.[1] || '';
      let m: RegExpExecArray | null;
      const sigRe = /<signal_cue(?:_instantly)?\b[^>]*\bcue\s*=\s*"([^"]+)"/gi;
      while ((m = sigRe.exec(f.content!)) !== null) {
        if (kindByQName.get(qnameOf(m[1], ownScript) || '') === 'library') {
          findings.push({ code: 'md.signal_library', severity: 'error', file: f.path,
            detail: `signal_cue targets the <library> "${m[1]}". Libraries are invoked via <run_actions ref="…"> (with purpose="run_actions"), not signalled — X4 errors with "Signalled cue … has no corresponding library".` });
        }
      }
      const raRe = /<run_actions\b[^>]*\bref\s*=\s*"([^"]+)"/gi;
      while ((m = raRe.exec(f.content!)) !== null) {
        if (kindByQName.get(qnameOf(m[1], ownScript) || '') === 'cue') {
          findings.push({ code: 'md.run_actions_nonlibrary', severity: 'warning', file: f.path,
            detail: `run_actions ref "${m[1]}" resolves to a <cue>, not a <library>. <run_actions> targets a library declared with purpose="run_actions".` });
        }
      }
    }
  }

  const effectiveReferences = options.effectiveContext?.complete ? validateEffectiveReferenceContracts(options.effectiveContext) : undefined;
  const libraryReferences = effectiveReferences ?? validateCueLibraryReferences(mdFiles);
  const supplemental = options.canonicalOnlyContext && validateEffectiveReferenceContracts(options.canonicalOnlyContext);
  const libraryFindings = [...libraryReferences.findings, ...(supplemental?.findings ?? [])];
  const coverageGaps = [...(effectiveReferences?.coverageGaps ?? []), ...(supplemental?.coverageGaps ?? [])];
  findings.push(...libraryFindings);
  const errors = findings.filter(f => f.severity === 'error').length;
  return {
    ok: errors === 0,
    summary: {
      files: files.length,
      findings: findings.length,
      errors,
      structuralErrors: structure.filter(i => i.severity === 'error').length,
      cueReferences: cueIndex.references.length + libraryReferences.checked + (supplemental?.checked ?? 0),
      unresolvedCueRefs: cueIndex.unresolved.length + libraryFindings
        .filter(finding => finding.code === 'md.cue_duplicate_name' || finding.code === 'md.cue_library_ref_unresolved').length,
      mdLuaMissingRegisters: missingRegisters.length,
      luaMdMissingListeners: missingListeners.length,
      luaRegistrationUnavailable: parseUnavailable.length,
      luaEmitUnverified: emitCoverage.prefix + emitCoverage.unresolved,
      payloadContractErrors: payload.findings.filter(f => f.severity === 'error').length,
      dependencies: manifest?.deps.length || 0,
    },
    findings,
    cueIndex,
    ...(coverageGaps.length ? { coverageGaps } : {}),
    mdLua: { raised, registered, emitted, listened, missingRegisters, missingListeners, parseUnavailable, emitCoverage, payload: { reads: payload.reads, writes: payload.writes } },
    deps: { manifest, dependencies: manifest?.deps || [] },
  };
}

function fixtureProject(): ExtensionProject {
  let project = createProject('ai_influence', 'AI Influence');
  project = addFile(project, {
    path: 'content.xml',
    kind: 'content',
    content: buildContentXml({
      id: 'ai_influence',
      name: 'AI Influence',
      deps: [{ id: 'djfhe_http', optional: true }],
    }),
  });
  project = addFile(project, {
    path: 'md/main.xml',
    kind: 'md',
    content: `<mdscript name="Main"><cues><cue name="Start"><actions><run_actions ref="md.Contract.Call_chat" /></actions></cue></cues></mdscript>`,
  });
  project = addFile(project, {
    path: 'md/contract.xml',
    kind: 'md',
    content: `<mdscript name="Contract"><cues>
      <library name="Call_chat" purpose="run_actions"><actions><raise_lua_event name="'ai_influence.chat'" param="table[prompt=$prompt]" /></actions></library>
      <cue name="On_chat_response"><conditions><event_ui_triggered screen="'ai_influence'" control="'chat.response'" /></conditions></cue>
    </cues></mdscript>`,
  });
  project = addFile(project, {
    path: 'ui/chat.lua',
    kind: 'lua',
    content: `local NS = "ai_influence"
RegisterEvent("ai_influence.chat", function(_, payload) end)
AddUITriggeredEvent(NS, "chat.response", { reply = "ok" })`,
  });
  return project;
}

export function runProjectCrossFileSelftest() {
  const checks: { name: string; pass: boolean; detail?: unknown }[] = [];
  const ok = (name: string, pass: boolean, detail?: unknown) => checks.push({ name, pass, detail });

  const good = validateProjectCrossFile(fixtureProject());
  ok('valid_project_has_no_errors', good.ok, good.findings);
  const bomProject: ExtensionProject = {
    ...fixtureProject(),
    files: fixtureProject().files.map(file => file.path.endsWith('.lua')
      ? { ...file, content: `\uFEFF${file.content}` } : file),
  };
  const bomSnapshot = JSON.stringify(bomProject);
  const bomResult = validateProjectCrossFile(bomProject);
  ok('leading_bom_preserves_complete_cross_file_result',
    JSON.stringify(bomResult) === JSON.stringify(good), bomResult);
  ok('leading_bom_analysis_preserves_input', JSON.stringify(bomProject) === bomSnapshot);
  const bomLuaCase = (content: string) => validateProjectCrossFile({
    ...fixtureProject(),
    files: fixtureProject().files.map(file => file.path === 'ui/chat.lua' ? { ...file, content } : file),
  });
  const bomProse = bomLuaCase('\uFEFFlocal prose = "unrelated — 😀"\r\n'
    + 'RegisterEvent("ai_influence.chat", handler)\r\nAddUITriggeredEvent("ai_influence", "chat.response", {})');
  ok('leading_bom_with_unicode_prose_preserves_both_event_directions',
    bomProse.ok && bomProse.mdLua.parseUnavailable.length === 0
      && bomProse.mdLua.registered.some(event => event.event === 'ai_influence.chat')
      && bomProse.mdLua.emitted.some(event => event.event === 'ai_influence.chat.response'), bomProse);
  const bomEvent = bomLuaCase('\uFEFFRegisterEvent("ai_influence.chat\uFEFF", handler)');
  ok('bom_inside_event_literal_remains_tainted',
    bomEvent.mdLua.parseUnavailable.length === 1
      && bomEvent.findings.some(finding => finding.code === 'md_lua.registration_verification_gap')
      && bomEvent.mdLua.registered.length === 0, bomEvent);
  for (const [name, content] of [
    ['malformed', '\uFEFFfunction broken('],
    ['repeated', '\uFEFF\uFEFFRegisterEvent("ai_influence.chat", handler)'],
    ['noninitial', ' \uFEFFRegisterEvent("ai_influence.chat", handler)'],
  ]) {
    const invalid = bomLuaCase(content);
    ok(`bom_${name}_still_refuses_parse_and_event_credit`,
      !invalid.ok && invalid.mdLua.parseUnavailable.length === 1
        && invalid.findings.some(finding => finding.code === 'validation.lua_ast_unavailable')
        && invalid.mdLua.registered.length === 0 && invalid.mdLua.emitted.length === 0, invalid);
  }
  const conditionalRaises = validateProjectCrossFile(addFile(fixtureProject(), {
    path: 'md/conditional_events.xml', kind: 'md',
    content: [
      '',
      '<mdscript name="ConditionalEvents"><cues><cue name="Start"><actions>',
      `<raise_lua_event name="if $flag then 'ai_influence.chat' else 'ai_influence.chat'"/>`,
      `<raise_lua_event name="if ($flag == 'if then else') then if $next then 'ai_influence.chat' else 'missing.nested' else 'ai_influence.chat'"/>`,
      `<raise_lua_event name="if $flag then $event else 'missing.mixed'"/>`,
      `<raise_lua_event name="if $object.then then 'missing.no_else'"/>`,
      `<raise_lua_event name="$event"/>`,
      '</actions></cue></cues></mdscript>',
    ].join('\n'),
  })).findings.filter(f => f.file === 'md/conditional_events.xml');
  ok('conditional_md_events_preserve_literal_blockers_gaps_and_source_positions',
    conditionalRaises.filter(f => f.code === 'md_lua.missing_register').map(f => `${f.line}:${f.event}`).join(',')
      === '4:missing.nested,5:missing.mixed,6:missing.no_else'
    && conditionalRaises.filter(f => f.code === 'md_lua.registration_verification_gap').map(f => f.line).join(',') === '5,6,7'
    && conditionalRaises.every(f => (f.column ?? 0) > 0), conditionalRaises);
  ok('indexes_md_to_lua_raise_and_register', good.mdLua.raised.some(e => e.event === 'ai_influence.chat') && good.mdLua.registered.some(e => e.event === 'ai_influence.chat'), good.mdLua);
  ok('indexes_lua_to_md_emit_and_listener', good.mdLua.emitted.some(e => e.event === 'ai_influence.chat.response') && good.mdLua.listened.some(e => e.event === 'ai_influence.chat.response'), good.mdLua);
  ok('reports_content_dependencies', good.deps.dependencies.some(d => d.id === 'djfhe_http' && d.optional), good.deps);

  for (const path of ['ui.xml', 'ui/addons/menu.xml', 'UI/MENU.XML', 'ui/readme.txt']) {
    const withUiAsset = addFile(fixtureProject(), {
      path, kind: 'ui', content: '<?xml version="1.0"?><addon/>',
    });
    const result = validateProjectCrossFile(withUiAsset);
    ok(`non_lua_ui_asset_excluded:${path}`, result.ok && result.mdLua.parseUnavailable.length === 0, result.findings);
  }
  const xmlCannotRegister = fixtureProject();
  xmlCannotRegister.files = xmlCannotRegister.files.filter(f => !f.path.endsWith('.lua'));
  xmlCannotRegister.files.push({ path: 'ui.xml', kind: 'ui', content: 'RegisterEvent("ai_influence.chat", function() end)' });
  const xmlRegistration = validateProjectCrossFile(xmlCannotRegister);
  ok('xml_cannot_satisfy_lua_registration', xmlRegistration.summary.mdLuaMissingRegisters === 1 && xmlRegistration.mdLua.registered.length === 0, xmlRegistration.findings);
  for (const kind of ['ui', 'other', 'lua'] as const) {
    const broken = addFile(fixtureProject(), { path: 'UI/BROKEN.LUA', kind, content: 'local =' });
    const result = validateProjectCrossFile(broken);
    ok(`malformed_lua_still_blocks:${kind}`, !result.ok && result.findings.some(f => f.code === 'validation.lua_ast_unavailable' && f.file === 'UI/BROKEN.LUA'), result.findings);
  }

  const noLuaRegister: ExtensionProject = {
    ...fixtureProject(),
    files: fixtureProject().files.map(f => f.path === 'ui/chat.lua' ? { ...f, content: 'local NS = "ai_influence"\nAddUITriggeredEvent(NS, "chat.response", {})' } : f),
  };
  const missingRegister = validateProjectCrossFile(noLuaRegister);
  ok('flags_md_raise_without_lua_register', !missingRegister.ok && missingRegister.findings.some(f => f.code === 'md_lua.missing_register' && f.event === 'ai_influence.chat'), missingRegister.findings);

  const noMdListener: ExtensionProject = {
    ...fixtureProject(),
    files: fixtureProject().files.map(f => f.path === 'md/contract.xml' ? { ...f, content: f.content!.replace(/<cue name="On_chat_response">[\s\S]*?<\/cue>/, '') } : f),
  };
  const missingListener = validateProjectCrossFile(noMdListener);
  ok('flags_lua_emit_without_md_listener', !missingListener.ok && missingListener.findings.some(f => f.code === 'lua_md.missing_listener' && f.event === 'ai_influence.chat.response'), missingListener.findings);

  // Dynamic (concat) Lua event names are PREFIXES, not exact names (AAR #2 fix).
  const dynamicEmit: ExtensionProject = addFile(addFile(fixtureProject(), {
    path: 'ui/uix.lua',
    kind: 'lua',
    content: `local NS = "ai_influence"\nAddUITriggeredEvent(NS, "log_" .. category, payload)`,
  }), {
    path: 'md/news.xml',
    kind: 'md',
    content: `<mdscript name="News"><cues><cue name="OnNews"><conditions><event_ui_triggered screen="'ai_influence'" control="'log_galaxynews'" /></conditions></cue></cues></mdscript>`,
  });
  const dyn = validateProjectCrossFile(dynamicEmit);
  ok('dynamic_concat_emit_matches_listener_by_prefix',
    !dyn.findings.some(f => f.code === 'lua_md.missing_listener' && String(f.event).startsWith('ai_influence.log_')),
    dyn.findings);
  const dynamicNoListener: ExtensionProject = addFile(fixtureProject(), {
    path: 'ui/uix.lua',
    kind: 'lua',
    content: `local NS = "ai_influence"\nAddUITriggeredEvent(NS, "log_" .. category, payload)`,
  });
  const dynMiss = validateProjectCrossFile(dynamicNoListener);
  ok('dynamic_emit_with_no_prefix_listener_is_warning_not_error',
    dynMiss.findings.some(f => f.code === 'lua_md.missing_listener' && f.severity === 'warning' && f.event === 'ai_influence.log_')
    && !dynMiss.findings.some(f => f.code === 'lua_md.missing_listener' && f.severity === 'error'),
    dynMiss.findings);
  // Dynamic RegisterEvent prefix satisfies raised events under it.
  const dynamicRegister: ExtensionProject = {
    ...fixtureProject(),
    files: fixtureProject().files.map(f => f.path === 'ui/chat.lua' ? {
      ...f,
      content: `local NS = "ai_influence"\nRegisterEvent("ai_influence." .. channel, handler)\nAddUITriggeredEvent(NS, "chat.response", { reply = "ok" })`,
    } : f),
  };
  const dynReg = validateProjectCrossFile(dynamicRegister);
  ok('dynamic_concat_register_satisfies_raised_event_by_prefix',
    !dynReg.findings.some(f => f.code === 'md_lua.missing_register'),
    dynReg.findings);

  const commentedRegister: ExtensionProject = {
    ...fixtureProject(),
    files: fixtureProject().files.map(f => f.path === 'ui/chat.lua' ? {
      ...f,
      content: `-- RegisterEvent("ai_influence.chat", handler)\nlocal NS = "ai_influence"\nAddUITriggeredEvent(NS, "chat.response", {})`,
    } : f),
  };
  const commentResult = validateProjectCrossFile(commentedRegister);
  ok('register_event_text_in_a_comment_is_not_a_registration',
    commentResult.findings.some(f => f.code === 'md_lua.missing_register' && f.event === 'ai_influence.chat'),
    commentResult.mdLua.registered);

  const aliasedRegister: ExtensionProject = {
    ...fixtureProject(),
    files: fixtureProject().files.map(f => f.path === 'ui/chat.lua' ? {
      ...f,
      content: `local NS = "ai_influence"\nlocal reg = RegisterEvent\nreg("ai_influence.chat", handler)\nAddUITriggeredEvent(NS, "chat.response", {})`,
    } : f),
  };
  const aliasResult = validateProjectCrossFile(aliasedRegister);
  ok('simple_register_event_alias_is_resolved_from_the_ast',
    !aliasResult.findings.some(f => f.code === 'md_lua.missing_register'), aliasResult.mdLua.registered);

  const wrappedRegister: ExtensionProject = {
    ...fixtureProject(),
    files: fixtureProject().files.map(f => f.path === 'ui/chat.lua' ? {
      ...f,
      content: `local NS = "ai_influence"\nlocal function reg(event, handler) RegisterEvent(event, handler) end\nreg("ai_influence.chat", handler)\nAddUITriggeredEvent(NS, "chat.response", {})`,
    } : f),
  };
  const wrapperResult = validateProjectCrossFile(wrappedRegister);
  ok('simple_register_event_wrapper_is_resolved_from_the_ast',
    !wrapperResult.findings.some(f => f.code === 'md_lua.missing_register'), wrapperResult.mdLua.registered);

  const unicodeDirect: ExtensionProject = {
    ...fixtureProject(),
    files: fixtureProject().files.map(f => f.path === 'ui/chat.lua' ? {
      ...f,
      content: `local prose = "unrelated — prose"
RegisterEvent("ai_influence.chat", handler)
AddUITriggeredEvent("ai_influence", "chat.response", {})`,
    } : f),
  };
  const unicodeDirectResult = validateProjectCrossFile(unicodeDirect);
  ok('unicode_prose_preserves_direct_register',
    unicodeDirectResult.mdLua.parseUnavailable.length === 0
      && unicodeDirectResult.mdLua.registered.some(e => e.event === 'ai_influence.chat')
      && !unicodeDirectResult.findings.some(f => f.code === 'md_lua.missing_register'),
    unicodeDirectResult);

  const unicodeAliasAndWrapper: ExtensionProject = addFile(fixtureProject(), {
    path: 'md/unicode.xml',
    kind: 'md',
    content: `<mdscript name="Unicode"><cues>
      <cue name="Alias"><actions><raise_lua_event name="'ai_influence.alias'" /></actions></cue>
      <cue name="Wrapper"><actions><raise_lua_event name="'ai_influence.wrapper'" /></actions></cue>
    </cues></mdscript>`,
  });
  unicodeAliasAndWrapper.files = unicodeAliasAndWrapper.files.map(f => f.path === 'ui/chat.lua' ? {
    ...f,
    content: `local prose = "unrelated — prose"
local reg = RegisterEvent
reg("ai_influence.alias", handler)
local function wrap(event, handler) reg(event, handler) end
wrap("ai_influence.wrapper", handler)
RegisterEvent("ai_influence.chat", handler)
AddUITriggeredEvent("ai_influence", "chat.response", {})`,
  } : f);
  const unicodeAliasAndWrapperResult = validateProjectCrossFile(unicodeAliasAndWrapper);
  ok('unicode_prose_preserves_alias_and_wrapper_registers',
    unicodeAliasAndWrapperResult.mdLua.parseUnavailable.length === 0
      && unicodeAliasAndWrapperResult.mdLua.registered.some(e => e.event === 'ai_influence.alias')
      && unicodeAliasAndWrapperResult.mdLua.registered.some(e => e.event === 'ai_influence.wrapper')
      && !unicodeAliasAndWrapperResult.findings.some(f => f.code === 'md_lua.missing_register'),
    unicodeAliasAndWrapperResult);

  const taintedEventLiteral: ExtensionProject = {
    ...fixtureProject(),
    files: fixtureProject().files.map(f => f.path === 'ui/chat.lua' ? {
      ...f,
      content: `RegisterEvent("ai_influence.chat—", handler)
AddUITriggeredEvent("ai_influence", "chat.response", {})`,
    } : f),
  };
  const taintedEventResult = validateProjectCrossFile(taintedEventLiteral);
  ok('unicode_event_literal_is_unavailable_not_sanitized',
    taintedEventResult.summary.luaRegistrationUnavailable === 1
      && taintedEventResult.mdLua.parseUnavailable.some(entry => entry.file === 'ui/chat.lua')
      && taintedEventResult.findings.some(f => f.code === 'md_lua.registration_verification_gap' && f.file === 'ui/chat.lua')
      && taintedEventResult.mdLua.missingRegisters.length === 0
      && taintedEventResult.summary.mdLuaMissingRegisters === 0
      && !taintedEventResult.mdLua.registered.some(e => e.event.includes('?')),
    taintedEventResult);

  const malformedLua: ExtensionProject = {
    ...fixtureProject(),
    files: fixtureProject().files.map(f => f.path === 'ui/chat.lua' ? {
      ...f,
      content: 'RegisterEvent("ai_influence.chat", handler',
    } : f),
  };
  const malformedLuaResult = validateProjectCrossFile(malformedLua);
  ok('malformed_lua_is_unavailable_not_missing_register',
    malformedLuaResult.summary.luaRegistrationUnavailable === 1
      && malformedLuaResult.mdLua.parseUnavailable.some(entry => entry.file === 'ui/chat.lua')
      && malformedLuaResult.findings.some(f => f.code === 'validation.lua_ast_unavailable' && f.file === 'ui/chat.lua')
      && malformedLuaResult.mdLua.missingRegisters.length === 0
      && malformedLuaResult.summary.mdLuaMissingRegisters === 0,
    malformedLuaResult);

  const payloadCollision = addFile(addFile(fixtureProject(), {
    path: 'ui/orders.lua', kind: 'lua',
    content: `payload["g" .. payload.n] = station\npayload["w" .. payload.n] = ware`,
  }), {
    path: 'md/orders.xml', kind: 'md',
    content: `<mdscript name="Orders"><cues><cue name="Resolve"><actions>
      <set_value name="$station" exact="event.param3.{'$g' + $si}"/>
      <do_if value="$sv == 'wing'"><set_value name="$group" exact="event.param3.{'$g' + $si}"/></do_if>
      <set_value name="$ware" exact="event.param3.{'$w' + $si}"/>
    </actions></cue></cues></mdscript>`,
  });
  const collisionResult = validateProjectCrossFile(payloadCollision);
  ok('indexed_payload_global_and_verb_collision_is_an_error',
    collisionResult.findings.some(f => f.code === 'md_lua.payload_collision' && f.severity === 'error'),
    collisionResult.findings);
  ok('indexed_payload_evidence_preserves_reader_scope',
    collisionResult.mdLua.payload.reads.some(read => read.key === 'g' && read.scope === 'global')
      && collisionResult.mdLua.payload.reads.some(read => read.key === 'g' && read.scope === 'verb'),
    collisionResult.mdLua.payload.reads);

  const payloadGap = addFile(addFile(fixtureProject(), {
    path: 'ui/orders.lua', kind: 'lua', content: `payload["q_key" .. payload.n] = value`,
  }), {
    path: 'md/orders.xml', kind: 'md',
    content: `<mdscript name="Orders"><cues><cue name="Resolve"><actions><set_value name="$station" exact="event.param3.{'$g_key' + $si}"/></actions></cue></cues></mdscript>`,
  });
  const gapResult = validateProjectCrossFile(payloadGap);
  ok('indexed_payload_read_without_writer_is_an_error', gapResult.findings.some(f => f.code === 'md_lua.payload_missing_writer'), gapResult.findings);
  ok('indexed_payload_write_without_reader_is_an_error', gapResult.findings.some(f => f.code === 'md_lua.payload_unused_writer'), gapResult.findings);
  ok('indexed_payload_evidence_accepts_identifier_keys',
    gapResult.mdLua.payload.reads.some(read => read.key === 'g_key') && gapResult.mdLua.payload.writes.some(write => write.key === 'q_key'),
    gapResult.mdLua.payload);

  const indexedEventProject = (lua: string, screen = 'forge_qa', control = 'player_orders', keys = ['po']) => addFile(addFile(fixtureProject(), {
    path: 'ui/orders.lua', kind: 'lua', content: lua,
  }), {
    path: 'md/orders.xml', kind: 'md',
    content: `<mdscript name="Orders"><cues><cue name="Resolve" instantiate="true" namespace="this">
      <conditions><event_ui_triggered screen="'${screen}'" control="'${control}'"/></conditions>
      <actions>${keys.map(key => `<set_value name="$${key}" exact="event.param3.{'$${key}' + $si}"/>`).join('\n')}</actions>
    </cue></cues></mdscript>`,
  });
  const localTable = 'local p = { n = 1 }';
  const indexedWrite = `p["po" .. p.n] = "order"`;
  const emit = `AddUITriggeredEvent("forge_qa", "player_orders", p)`;
  const loop = `for _, order in ipairs(orders or {}) do p.n = p.n + 1; p["po" .. p.n] = order end`;
  const localIndexTable = `${localTable}; local i = p.n`;
  const localIndexWrite = 'p["po" .. i] = "order"';
  const writerCases = [
    { name: 'direct_renamed_table', lua: `${localTable}; ${indexedWrite}; ${emit}`, expected: [] },
    { name: 'direct_after_loop', lua: `${localTable}; ${loop}; ${emit}`, expected: [] },
    { name: 'writer_and_emit_in_same_branch', lua: `${localTable}; if enabled then ${indexedWrite}; ${emit} end`, expected: [] },
    { name: 'read_only', lua: 'local payload = { n = 1 }; local order = payload["po" .. payload.n]; AddUITriggeredEvent("forge_qa", "player_orders", payload)', expected: ['payload_missing_writer'], noWrite: true },
    { name: 'string_and_comment', lua: `${localTable}; local code = [[${indexedWrite}]]; ${emit} -- ${indexedWrite}`, expected: ['payload_missing_writer'], noWrite: true },
    { name: 'explicit_nil_only', lua: `${localTable}; p["po" .. p.n] = nil; ${emit}`, expected: ['payload_missing_writer'], noWrite: true },
    { name: 'shadowed_table', lua: `${localTable}; do ${localTable}; ${indexedWrite} end; ${emit}`, expected: ['payload_writer_unverified'] },
    { name: 'builder_return', lua: `local function build() ${localTable}; ${loop}; return p end; AddUITriggeredEvent("forge_qa", "player_orders", build())`, expected: ['payload_writer_unverified'] },
    { name: 'same_name_but_unbound', lua: 'local payload = { n = 1 }; payload["po" .. payload.n] = "order"; AddUITriggeredEvent("forge_qa", "player_orders", {})', expected: ['payload_writer_unverified'] },
    { name: 'sibling_branches', lua: `${localTable}; if enabled then ${indexedWrite} else ${emit} end`, expected: ['payload_writer_unverified'] },
    { name: 'emit_before_assignment', lua: `${localTable}; p["po" .. p.n] = ${emit}`, expected: ['payload_writer_unverified'] },
    { name: 'writer_cleared', lua: `${localTable}; ${indexedWrite}; p["po" .. p.n] = nil; ${emit}`, expected: ['payload_writer_unverified'] },
    { name: 'write_after_clear', lua: `${localTable}; p["po" .. p.n] = nil; ${indexedWrite}; ${emit}`, expected: [] },
    { name: 'different_event', lua: `${localTable}; ${indexedWrite}; AddUITriggeredEvent("forge_qa", "other", p); AddUITriggeredEvent("forge_qa", "player_orders", {})`, expected: ['payload_missing_writer'] },
    { name: 'different_dotted_event', lua: `${localTable}; ${indexedWrite}; AddUITriggeredEvent("a.b", "c", p)`, screen: 'a', control: 'b.c', expected: ['payload_missing_writer'] },
    { name: 'possible_dynamic_event', lua: `${localTable}; ${indexedWrite}; AddUITriggeredEvent("forge_qa", "other", p); AddUITriggeredEvent("forge_qa", selectedControl, p)`, expected: ['payload_writer_unverified'] },
    { name: 'captured_table_event', lua: `${localTable}; ${indexedWrite}; AddUITriggeredEvent("forge_qa", "other", p); local function send() ${emit} end; send()`, expected: ['payload_writer_unverified'] },
    { name: 'global_emitter_rebound', lua: `function _G.AddUITriggeredEvent() end; ${localTable}; ${indexedWrite}; ${emit}`, expected: ['payload_writer_unverified'] },
    { name: 'global_emitter_rawset', lua: `rawset(_G, "AddUITriggeredEvent", function() end); ${localTable}; ${indexedWrite}; ${emit}`, expected: ['payload_writer_unverified'] },
    { name: 'local_environment_shadows_emitter', lua: `local _ENV = {}; ${localTable}; ${indexedWrite}; ${emit}`, expected: ['payload_writer_unverified'] },
    { name: 'unrelated_local_global_table', lua: `local _G = {}; _G["AddUITriggeredEvent"] = false; ${localTable}; ${indexedWrite}; ${emit}`, expected: [] },
    { name: 'local_index_direct_same_event', lua: `${localIndexTable}; ${localIndexWrite}; ${emit}`, expected: ['payload_writer_unverified'] },
    { name: 'local_index_same_branch', lua: `${localIndexTable}; if enabled then ${localIndexWrite}; ${emit} end`, expected: ['payload_writer_unverified'] },
    { name: 'local_index_unknown_value', lua: `${localTable}; local i = getIndex(); ${localIndexWrite}; ${emit}`, expected: ['payload_writer_unverified'] },
    { name: 'local_index_non_numeric_value', lua: `${localTable}; local i = "unknown"; ${localIndexWrite}; ${emit}`, expected: ['payload_writer_unverified'] },
    { name: 'local_index_alias', lua: `${localIndexTable}; local alias = p; alias["po" .. i] = "order"; ${emit}`, expected: ['payload_writer_unverified'] },
    { name: 'local_index_sibling_branches', lua: `${localIndexTable}; if enabled then ${localIndexWrite} else ${emit} end`, expected: ['payload_writer_unverified'] },
    { name: 'local_index_cleared_by_counter', lua: `${localIndexTable}; ${localIndexWrite}; p["po" .. p.n] = nil; ${emit}`, expected: ['payload_writer_unverified'] },
    { name: 'counter_writer_cleared_by_local_index', lua: `${localIndexTable}; ${indexedWrite}; p["po" .. i] = nil; ${emit}`, expected: ['payload_writer_unverified'] },
    { name: 'counter_writer_local_clear_different_event', lua: `${localIndexTable}; ${indexedWrite}; p["po" .. i] = nil; AddUITriggeredEvent("forge_qa", "other", p); AddUITriggeredEvent("forge_qa", "player_orders", {})`, expected: ['payload_missing_writer'] },
    { name: 'counter_writer_counter_clear_different_event', lua: `${localIndexTable}; ${indexedWrite}; p["po" .. p.n] = nil; AddUITriggeredEvent("forge_qa", "other", p); AddUITriggeredEvent("forge_qa", "player_orders", {})`, expected: ['payload_missing_writer'] },
    { name: 'local_index_local_clear_different_event', lua: `${localIndexTable}; ${localIndexWrite}; p["po" .. i] = nil; AddUITriggeredEvent("forge_qa", "other", p); AddUITriggeredEvent("forge_qa", "player_orders", {})`, expected: ['payload_missing_writer'] },
    { name: 'local_index_counter_clear_different_event', lua: `${localIndexTable}; ${localIndexWrite}; p["po" .. p.n] = nil; AddUITriggeredEvent("forge_qa", "other", p); AddUITriggeredEvent("forge_qa", "player_orders", {})`, expected: ['payload_missing_writer'] },
    { name: 'cleared_counter_writer_unknown_recipient', lua: `${localIndexTable}; ${indexedWrite}; p["po" .. i] = nil; AddUITriggeredEvent("forge_qa", "other", p); AddUITriggeredEvent("forge_qa", selectedControl, p)`, expected: ['payload_writer_unverified'] },
    { name: 'cleared_counter_writer_mixed_recipients', lua: `${localIndexTable}; ${indexedWrite}; p["po" .. i] = nil; AddUITriggeredEvent("forge_qa", "other", p); ${emit}`, expected: ['payload_writer_unverified'] },
    { name: 'local_index_different_event', lua: `${localIndexTable}; ${localIndexWrite}; AddUITriggeredEvent("forge_qa", "other", p); AddUITriggeredEvent("forge_qa", "player_orders", {})`, expected: ['payload_missing_writer'] },
    { name: 'local_index_different_dotted_event', lua: `${localIndexTable}; ${localIndexWrite}; AddUITriggeredEvent("a.b", "c", p)`, screen: 'a', control: 'b.c', expected: ['payload_missing_writer'] },
    { name: 'local_index_possible_dynamic_event', lua: `${localIndexTable}; ${localIndexWrite}; AddUITriggeredEvent("forge_qa", "other", p); AddUITriggeredEvent("forge_qa", selectedControl, p)`, expected: ['payload_writer_unverified'] },
    { name: 'local_index_explicit_nil_only', lua: `${localIndexTable}; p["po" .. i] = nil; ${emit}`, expected: ['payload_missing_writer'], noWrite: true },
    { name: 'local_index_read_only', lua: `${localIndexTable}; local order = p["po" .. i]; ${emit}`, expected: ['payload_missing_writer'], noWrite: true },
    { name: 'local_index_string_and_comment', lua: `${localIndexTable}; local code = [[${localIndexWrite}]]; ${emit} -- ${localIndexWrite}`, expected: ['payload_missing_writer'], noWrite: true },
    { name: 'local_index_absent_writer', lua: `${localIndexTable}; ${emit}`, expected: ['payload_missing_writer'], noWrite: true },
    { name: 'local_index_global_suffix', lua: `${localTable}; ${localIndexWrite}; ${emit}`, expected: ['payload_missing_writer'], noWrite: true },
    { name: 'local_index_assigned_global_suffix', lua: `${localTable}; i = p.n; ${localIndexWrite}; ${emit}`, expected: ['payload_missing_writer'], noWrite: true },
    { name: 'local_index_declared_after_write', lua: `${localTable}; ${localIndexWrite}; local i = p.n; ${emit}`, expected: ['payload_missing_writer'], noWrite: true },
    { name: 'local_index_arithmetic_suffix', lua: `${localIndexTable}; p["po" .. (i + 1)] = "order"; ${emit}`, expected: ['payload_missing_writer'], noWrite: true },
    { name: 'local_index_call_suffix', lua: `${localIndexTable}; p["po" .. getIndex(i)] = "order"; ${emit}`, expected: ['payload_missing_writer'], noWrite: true },
    { name: 'local_index_foreign_member_suffix', lua: `${localIndexTable}; local other = { n = i }; p["po" .. other.n] = "order"; ${emit}`, expected: ['payload_missing_writer'], noWrite: true },
  ];
  for (const test of writerCases) {
    const result = validateProjectCrossFile(indexedEventProject(test.lua, test.screen, test.control));
    const actual = result.findings.filter(finding => finding.code.startsWith('md_lua.payload_'));
    ok(`indexed_payload_${test.name}`,
      actual.length === test.expected.length && actual.every((finding, index) =>
        finding.code === `md_lua.${test.expected[index]}`
        && finding.severity === (finding.code === 'md_lua.payload_writer_unverified' ? 'info' : 'error'))
        && result.mdLua.payload.writes.some(write => write.key === 'po') === !test.noWrite,
      { findings: actual, payload: result.mdLua.payload });
  }

  for (const [name, suffix] of [['same_table_counter', 'p.n'], ['local_index', 'i']]) {
    const lua = `local function build()
${localTable}
local i = p.n
p["ri" .. ${suffix}] = "order"
return p
end
AddUITriggeredEvent("forge_qa", "player_orders", build())`;
    const result = validateProjectCrossFile(indexedEventProject(lua, undefined, undefined, ['ri']));
    const actual = result.findings.filter(finding => finding.code.startsWith('md_lua.payload_'));
    ok(`indexed_payload_helper_${name}_keeps_coverage_gap`, actual.length === 1
      && actual[0].code === 'md_lua.payload_writer_unverified' && actual[0].severity === 'info'
      && (name !== 'local_index' || (actual[0].detail.includes('Only local-index assignments were found for this key')))
      && actual[0].file === 'md/orders.xml' && actual[0].line === 3 && (actual[0].column ?? 0) > 0
      && actual[0].target === undefined
      && actual[0].sourceRef === 'event_ui_triggered:["forge_qa","player_orders"]'
      && result.summary.payloadContractErrors === 0
      && result.mdLua.payload.reads.length === 1 && result.mdLua.payload.reads[0].key === 'ri'
      && result.mdLua.payload.writes.length === 1 && result.mdLua.payload.writes[0].key === 'ri',
    { findings: actual, payload: result.mdLua.payload });
  }

  for (const [name, suffix, expected] of [
    ['same_table_counter', 'payload.n', ''],
    ['local_index', 'i', 'md_lua.payload_writer_unverified'],
  ]) {
    const lua = `local payload = { n = 1 }
local i = payload.n
payload["po" .. ${suffix}] = "order"`;
    const project = addFile(indexedEventProject(lua), {
      path: 'md/orders.xml', kind: 'md',
      content: `<mdscript name="Orders"><cues><cue name="Resolve"><actions>
        <set_value name="$po" exact="event.param3.{'$po' + $si}"/>
      </actions></cue></cues></mdscript>`,
    });
    const result = validateProjectCrossFile(project);
    const actual = result.findings.filter(finding => finding.code.startsWith('md_lua.payload_'));
    ok(`indexed_payload_unbound_reader_${name}_legacy_boundary`, actual.length === (expected ? 1 : 0)
      && (!expected || (actual[0].code === expected && actual[0].severity === 'info'
        && actual[0].file === 'md/orders.xml' && (actual[0].line ?? 0) > 0
        && actual[0].target?.file === 'ui/orders.lua' && actual[0].target.line === 3))
      && result.mdLua.payload.writes.length === 1 && result.mdLua.payload.writes[0].key === 'po',
    { findings: actual, payload: result.mdLua.payload });
  }

  for (const [name, suffix, expected] of [
    ['same_table_counter', 'payload.n', 'md_lua.payload_unused_writer'],
    ['local_index', 'i', ''],
  ]) {
    const result = validateProjectCrossFile(addFile(fixtureProject(), {
      path: 'ui/orders.lua', kind: 'lua',
      content: `local payload = { n = 1 }; local i = payload.n; payload["orphan" .. ${suffix}] = "order"`,
    }));
    const actual = result.findings.filter(finding => finding.code.startsWith('md_lua.payload_'));
    ok(`indexed_payload_unused_${name}_legacy_boundary`, actual.length === (expected ? 1 : 0)
      && (!expected || (actual[0].code === expected && actual[0].severity === 'error'))
      && result.mdLua.payload.writes.length === 1 && result.mdLua.payload.writes[0].key === 'orphan',
    { findings: actual, payload: result.mdLua.payload });
  }

  const conditionalEmit = 'AddUITriggeredEvent("forge_qa", enabled and "player_orders" or "other", p)';
  const conditionalCounterWriter = `${localTable}; local i = 1; local enabled = unknown(); ${indexedWrite}`;
  for (const [name, extra, expected, count] of [
    ['counter_no_alias', '', '', 1],
    ['local_index_write_alias', 'local q = p; Mutate(q); p["other" .. i] = "x";', 'md_lua.payload_writer_unverified', 2],
    ['local_index_clear_alias', 'local q = p; Mutate(q); p["other" .. i] = nil;', 'md_lua.payload_writer_unverified', 1],
    ['same_name_suffix_no_alias', 'p["other" .. p] = "x";', '', 2],
  ] as const) {
    const result = validateProjectCrossFile(indexedEventProject(`${conditionalCounterWriter}; ${extra} ${conditionalEmit}`));
    const actual = result.findings.filter(finding => finding.code.startsWith('md_lua.payload_'));
    ok(`indexed_payload_conditional_${name}_counts_table_uses`, actual.length === (expected ? 1 : 0)
      && (!expected || (actual[0].code === expected && actual[0].severity === 'info'))
      && result.mdLua.payload.writes.length === count
      && result.mdLua.payload.writes.some(write => write.key === 'po')
      && (count !== 2 || result.mdLua.payload.writes.some(write => write.key === 'other')),
    { findings: actual, payload: result.mdLua.payload });
  }

  const manyKeys = Array.from({ length: 40 }, (_, index) => `key${index + 1}`);
  const builder = `local function build()\n${localTable}\n${manyKeys.map(key => `p["${key}" .. p.n] = "order"`).join('\n')}\nreturn p\nend`;
  const repeated = `${builder}\n${Array<string>(11).fill('AddUITriggeredEvent("forge_qa", "player_orders", build())').join('\n')}`;
  const manyResult = validateProjectCrossFile(indexedEventProject(repeated, undefined, undefined, manyKeys));
  const manyFindings = manyResult.findings.filter(finding => finding.code === 'md_lua.payload_writer_unverified');
  ok('indexed_payload_groups_unverified_keys_and_keeps_source_locations', manyFindings.length === 1
    && manyFindings[0].severity === 'info' && manyFindings[0].line === 3 && (manyFindings[0].column ?? 0) > 0
    && manyFindings[0].target === undefined
    && manyFindings[0].detail.includes('Indexed keys (40)') && manyFindings[0].detail.includes('and 32 more')
    && manyResult.mdLua.payload.reads.length === 40 && manyResult.mdLua.payload.writes.length === 40, manyFindings);

  const localIndexBuilder = `local function build()
${localTable}
local i = p.n
${manyKeys.map(key => `p["${key}" .. i] = "order"`).join('\n')}
return p
end`;
  const repeatedLocalIndex = `${localIndexBuilder}\n${Array<string>(11).fill('AddUITriggeredEvent("forge_qa", "player_orders", build())').join('\n')}`;
  const manyLocalIndexResult = validateProjectCrossFile(indexedEventProject(repeatedLocalIndex, undefined, undefined, manyKeys));
  const manyLocalIndexFindings = manyLocalIndexResult.findings.filter(finding => finding.code.startsWith('md_lua.payload_'));
  ok('indexed_payload_local_index_groups_keys_and_keeps_source_locations', manyLocalIndexFindings.length === 1
    && manyLocalIndexFindings[0].code === 'md_lua.payload_writer_unverified' && manyLocalIndexFindings[0].severity === 'info'
    && manyLocalIndexFindings[0].file === 'md/orders.xml' && manyLocalIndexFindings[0].line === 3 && (manyLocalIndexFindings[0].column ?? 0) > 0
    && manyLocalIndexFindings[0].target === undefined
    && manyLocalIndexFindings[0].sourceRef === 'event_ui_triggered:["forge_qa","player_orders"]'
    && manyLocalIndexFindings[0].detail.includes('Only local-index assignments were found for 40 of these 40 keys')
    && manyLocalIndexFindings[0].detail.includes('Indexed keys (40)') && manyLocalIndexFindings[0].detail.includes('and 32 more')
    && manyLocalIndexResult.summary.payloadContractErrors === 0
    && manyLocalIndexResult.mdLua.emitCoverage.files.find(file => file.file === 'ui/orders.lua')?.exact === 11
    && manyLocalIndexResult.mdLua.payload.reads.length === 40 && manyLocalIndexResult.mdLua.payload.writes.length === 40,
  { findings: manyLocalIndexFindings, payload: manyLocalIndexResult.mdLua.payload, coverage: manyLocalIndexResult.mdLua.emitCoverage });

  const mixedIndexHelper = `local function build()
${localTable}
local i = p.n
p["legacy" .. p.n] = "order"
p["candidate" .. i] = "order"
return p
end
AddUITriggeredEvent("forge_qa", "player_orders", build())`;
  const mixedIndexResult = validateProjectCrossFile(indexedEventProject(mixedIndexHelper, undefined, undefined, ['legacy', 'candidate']));
  const mixedIndexFindings = mixedIndexResult.findings.filter(finding => finding.code.startsWith('md_lua.payload_'));
  ok('indexed_payload_mixed_helper_group_keeps_index_uncertainty', mixedIndexFindings.length === 1
    && mixedIndexFindings[0].code === 'md_lua.payload_writer_unverified' && mixedIndexFindings[0].severity === 'info'
    && mixedIndexFindings[0].sourceRef === 'event_ui_triggered:["forge_qa","player_orders"]'
    && mixedIndexFindings[0].target === undefined
    && mixedIndexFindings[0].detail.includes('Only local-index assignments were found for 1 of these 2 keys')
    && mixedIndexFindings[0].detail.includes('Indexed keys (2)')
    && mixedIndexResult.summary.payloadContractErrors === 0 && mixedIndexResult.mdLua.payload.reads.length === 2
    && mixedIndexResult.mdLua.payload.writes.length === 2
    && mixedIndexResult.mdLua.payload.writes[0].key === 'legacy' && mixedIndexResult.mdLua.payload.writes[1].key === 'candidate',
  { findings: mixedIndexFindings, payload: mixedIndexResult.mdLua.payload });

  const dottedLua = `${builder}\nAddUITriggeredEvent("a.b", "c", build())\nAddUITriggeredEvent("a", "b.c", build())`;
  const dotted = indexedEventProject(dottedLua, 'a.b', 'c', ['key1']);
  const orders = dotted.files.find(file => file.path === 'md/orders.xml')!;
  const secondCue = `<cue name="ResolveOther"><conditions><event_ui_triggered screen="'a'" control="'b.c'"/></conditions>
    <actions><set_value name="$key1" exact="event.param3.{'$key1' + $si}"/></actions></cue>`;
  const dottedResult = validateProjectCrossFile(addFile(dotted, { ...orders, content: orders.content!.replace('</cues>', secondCue + '</cues>') }));
  const dottedFindings = dottedResult.findings.filter(finding => finding.code === 'md_lua.payload_writer_unverified');
  ok('indexed_payload_distinguishes_equal_dotted_labels', dottedFindings.length === 2
    && dottedFindings.every(finding => finding.event === 'a.b.c')
    && new Set(dottedFindings.map(finding => finding.sourceRef)).size === 2
    && new Set(dottedFindings.map(finding => finding.detail)).size === 2, dottedFindings);

  const brokenCue = addFile(fixtureProject(), {
    path: 'md/broken.xml',
    kind: 'md',
    content: '<mdscript name="Broken"><cues><cue name="Start"><actions><signal_cue cue="md.Contract.Nope" /></actions></cue></cues></mdscript>',
  });
  const unresolved = validateProjectCrossFile(brokenCue);
  ok('keeps_unresolved_cross_file_cue_diagnostic', !unresolved.ok && unresolved.findings.some(f => f.code === 'cue.unresolved'), unresolved.findings);

  // signal_cue aimed at a <library> is the in-game "no corresponding library" error.
  const signalLibrary = addFile(fixtureProject(), {
    path: 'md/bad_signal.xml',
    kind: 'md',
    content: '<mdscript name="Bad"><cues><cue name="Go"><actions><signal_cue cue="md.Contract.Call_chat" /></actions></cue></cues></mdscript>',
  });
  const sigLib = validateProjectCrossFile(signalLibrary);
  ok('flags_signal_cue_targeting_library', !sigLib.ok && sigLib.findings.some(f => f.code === 'md.signal_library'), sigLib.findings);

  // run_actions aimed at a plain <cue> (not a library) is the inverse mistake.
  const runActionsCue = addFile(fixtureProject(), {
    path: 'md/bad_run.xml',
    kind: 'md',
    content: '<mdscript name="BadRun"><cues><cue name="Go"><actions><run_actions ref="md.Contract.On_chat_response" /></actions></cue></cues></mdscript>',
  });
  const raCue = validateProjectCrossFile(runActionsCue);
  ok('flags_run_actions_targeting_nonlibrary', raCue.findings.some(f => f.code === 'md.run_actions_nonlibrary' && f.severity === 'warning'), raCue.findings);

  const includeCode = 'md.include_actions_run_library';
  const includeFile = 'md/includes.xml';
  const includeCalls = `    <include_actions ref='LocalRun'/><include_actions ref='md.Contract.Call_chat'/>`;
  const includeProject = addFile(fixtureProject(), {
    path: includeFile, kind: 'md',
    content: [
      '\uFEFF<mdscript name="Includes"><cues>',
      '  <cue name="Container"><cues>',
      '    <library name="LocalRun" purpose="run_actions"><actions/></library>',
      '  </cues></cue>',
      '  <cue name="Caller"><actions>',
      includeCalls,
      '  </actions></cue>',
      '</cues></mdscript>',
    ].join('\n'),
  });
  const includes = validateProjectCrossFile(includeProject);
  const includeErrors = includes.findings.filter(f => f.code === includeCode);
  ok('resolved_run_only_includes_report_call_and_declaration_coordinates', !includes.ok
    && includeErrors.length === 2 && includeErrors.every(f => f.file === includeFile && f.line === 6 && f.severity === 'error')
    && includeErrors[0].column === includeCalls.indexOf('<include_actions') + 1
    && includeErrors[0].target?.file === includeFile && includeErrors[0].target.line === 3
    && includeErrors[0].target.column === 5
    && includeErrors[1].column === includeCalls.lastIndexOf('<include_actions') + 1
    && includeErrors[1].target?.file === 'md/contract.xml' && includeErrors[1].target.line === 2
    && includeErrors[1].target.column === 7
    && includes.summary.unresolvedCueRefs === good.summary.unresolvedCueRefs
    && includes.summary.cueReferences === good.summary.cueReferences + 2, includeErrors);

  const uncertainIncludes = addFile(fixtureProject(), {
    path: includeFile, kind: 'md',
    content: [
      '<mdscript name="Includes"><cues>',
      '<library name="LocalRun" purpose="run_actions"/>',
      '<library name="LocalInclude" purpose="include_actions"/><library name="Default"/>',
      '<library name="Collision" purpose="run_actions"/><cue name="collision"/>',
      '<library name="Duplicate" purpose="run_actions"/><cue name="Duplicate"/>',
      '<cue name="Caller"><actions>',
      '<run_actions ref="LocalRun"/><include_actions ref="LocalInclude"/><include_actions ref="Default"/>',
      '<include_actions ref="Collision"/><include_actions ref="Duplicate"/><include_actions ref="localrun"/>',
      '<include_actions ref="md.contract.Call_chat"/><include_actions ref="md.Contract.call_chat"/>',
      '<include_actions ref="md.Contract.Call_chat.member"/><include_actions ref="this.LocalRun"/>',
      '<include_actions ref="$target"/><include_actions ref="Missing"/><include_actions ref="md.External.Library"/>',
      '<include_actions ref="md.BadSource.LocalRun"/><include_actions ref="md.DiffSource.LocalRun"/>',
      '<!-- <include_actions ref="LocalRun"/> -->',
      '</actions></cue></cues></mdscript>',
    ].join('\n'),
  });
  const includeControls = addFile(addFile(uncertainIncludes, {
    path: 'md/bad_source.xml', kind: 'md',
    content: '<mdscript name="BadSource"><library name="LocalRun" purpose="run_actions"/></invalid>',
  }), {
    path: 'md/diff_source.xml', kind: 'md',
    content: '<diff><add sel="/mdscript[@name=\'DiffSource\']/cues"><library name="LocalRun" purpose="run_actions"/></add></diff>',
  });
  ok('only_exact_unambiguous_project_library_purpose_blocks_an_include',
    validateProjectCrossFile(includeControls).findings.every(f => f.code !== includeCode));
  const ambiguousIncludes = validateProjectCrossFile(addFile(includeProject, {
    path: 'md/other_contract.xml', kind: 'md',
    content: '<mdscript name="contract"><cues/></mdscript>',
  })).findings.filter(f => f.code === includeCode);
  ok('case_fold_collision_on_script_keeps_qualified_include_unresolved',
    ambiguousIncludes.length === 1 && ambiguousIncludes[0].target?.file === includeFile, ambiguousIncludes);

  const parameterFile = 'md/library_arguments.xml';
  const parameterProject = addFile(fixtureProject(), {
    path: parameterFile, kind: 'md',
    content: [
      '<mdscript name="Arguments"><cues>',
      '  <library name="Provider" purpose="cue_ref">',
      '    <params><param name="required"/><param name="optional" default="null"/></params>',
      '    <cues><library name="Nested"><params><param name="nested"/></params></library></cues>',
      '  </library>',
      '  <cue name="Good" ref="Provider"><param name="required" value="7"/></cue>',
      '  <cue name="Missing" ref="Provider"/>',
      '  <cue name="Case" ref="md.Arguments.Provider"><param name="Required" value="7"/><param name="Optional" value="11"/></cue>',
      '  <cue name="ChildIsSeparate" ref="Provider"><cues><cue name="Child"><param name="required" value="7"/></cue></cues></cue>',
      '  <cue name="Empty" ref="md.Contract.Call_chat"><param name="extra" value="7"/></cue>',
      '</cues></mdscript>',
    ].join('\n'),
  });
  const isParamFinding = (finding: ProjectCrossFileFinding) =>
    finding.code === 'md.cue_library_param_required' || finding.code === 'md.cue_library_param_undeclared';
  const argumentsResult = validateProjectCrossFile(parameterProject);
  const parameterFindings = argumentsResult.findings.filter(isParamFinding);
  ok('cue arguments use exact case and defaults and preserve target coordinates', !argumentsResult.ok
    && parameterFindings.map(f => `${f.line}:${f.code}`).join(',') === [
      '7:md.cue_library_param_required', '8:md.cue_library_param_undeclared', '8:md.cue_library_param_undeclared',
      '8:md.cue_library_param_required', '9:md.cue_library_param_required',
    ].join(',')
    && parameterFindings.every(f => f.file === parameterFile && f.target?.file === parameterFile
      && f.target.line === (f.code === 'md.cue_library_param_required' ? 3 : 2) && f.detail.includes(parameterFile))
    && (parameterFindings[1].column ?? 0) < (parameterFindings[2].column ?? 0)
    && argumentsResult.summary.unresolvedCueRefs === 0, parameterFindings);
  const unsupportedArguments = addFile(fixtureProject(), {
    path: parameterFile, kind: 'md',
    content: [
      '<mdscript name="Arguments"><cues>',
      '<library name="Empty"/>',
      '<library name="Duplicate"><params><param name="required"/><param name="required"/></params></library>',
      '<library name="Missing"><params><param/></params></library>',
      '<library name="Multiple"><params><param name="required"/></params><params/></library>',
      '<library name="Ambiguous"><params><param name="required"/></params></library><cue name="ambiguous"/>',
      '<cue name="EmptyGood" ref="Empty"/><cue name="EmptyExtra" ref="Empty"><param name="extra" value="7"/></cue>',
      '<cue name="DuplicateRef" ref="Duplicate"/><cue name="MissingRef" ref="Missing"/><cue name="MultipleRef" ref="Multiple"/>',
      '<cue name="AmbiguousRef" ref="Ambiguous"/><cue name="Contextual" ref="this.Empty"><param name="extra" value="7"/></cue>',
      '<cue name="External" ref="md.External.Library"><param name="extra" value="7"/></cue>',
      '<cue name="Dynamic" ref="$provider"><param name="extra" value="7"/></cue>',
      '<cue name="NonExact" ref="empty"><param name="extra" value="7"/></cue>',
      '</cues></mdscript>',
    ].join('\n'),
  });
  const unsupportedFindings = validateProjectCrossFile(unsupportedArguments).findings.filter(isParamFinding);
  ok('empty signatures reject extras while unknown signatures stay quiet',
    unsupportedFindings.length === 1 && unsupportedFindings[0].code === 'md.cue_library_param_undeclared'
      && unsupportedFindings[0].line === 7 && unsupportedFindings[0].target?.line === 2, unsupportedFindings);

  const actionFile = 'md/action_arguments.xml';
  const actionCall = '<run_actions ref="Run"><param name="Optional" value="1"/></run_actions>';
  const actionCalls = actionCall.repeat(2);
  const actionProvider = '<mdscript name="ActionProvider"><cues><library name="Run" purpose="run_actions"/></cues></mdscript>';
  const actionProject = addFile(addFile(fixtureProject(), {
    path: actionFile, kind: 'md',
    content: [
      '<mdscript name="ActionArguments"><cues>',
      '<library name="Run" purpose="run_actions"><params><param name="required"/><param name="optional" default="0"/></params></library>',
      '<library name="CueOnly"/><library name="IncludeOnly" purpose="include_actions"/>',
      '<library name="Duplicate" purpose="run_actions"><params><param name="value"/><param name="value"/></params></library>',
      '<library name="Collision" purpose="run_actions"/><cue name="collision"/>',
      '<cue name="Caller"><actions>',
      actionCalls,
      '<run_actions ref="md.ActionProvider.Run"><param name="typo" value="1"/></run_actions>',
      '<run_actions ref="Run"><param name="required" value="1"/></run_actions><run_actions ref="Run"/>',
      '<run_actions ref="Run"><ignored><param name="nested" value="1"/></ignored></run_actions>',
      ...['CueOnly', 'IncludeOnly', 'Duplicate', 'Collision', 'run', 'this.Run', '$target', 'Missing', 'md.External.Run']
        .map(ref => `<run_actions ref="${ref}"><param name="extra" value="1"/></run_actions>`),
      '</actions></cue></cues></mdscript>',
    ].join('\n'),
  }), {
    path: 'md/action_provider.xml', kind: 'md',
    content: actionProvider,
  });
  const actionCode = 'md.run_actions_param_undeclared';
  const actionResult = validateProjectCrossFile(actionProject);
  const actionFindings = actionResult.findings.filter(f => f.code === actionCode);
  ok('run_actions advises on exact direct names with caller and provider positions',
    actionFindings.length === 3 && actionFindings.every(f => f.severity === 'warning' && f.file === actionFile)
    && actionFindings[0]?.line === 7 && actionFindings[0]?.column === actionCalls.indexOf('"Optional') + 1
    && actionFindings[1]?.line === 7 && actionFindings[1]?.column === actionCalls.lastIndexOf('"Optional') + 1
    && actionFindings.slice(0, 2).every(f => f.target?.file === actionFile && f.target.line === 2 && f.target.column === 1)
    && actionFindings[2]?.line === 8 && actionFindings[2]?.target?.file === 'md/action_provider.xml'
    && actionFindings[2]?.target?.line === 1 && actionFindings[2]?.target?.column === actionProvider.indexOf('<library') + 1
    && actionResult.summary.errors === 2
    && actionResult.cueIndex.unresolved.map(r => r.ref).join(',') === 'run,Missing', actionResult.findings);
  const missingActionCode: string = 'md.run_actions_param_required';
  const requiredActionFindings = actionResult.findings.filter(f => f.code === missingActionCode);
  ok('run_actions reports required omissions with separate same-line positions',
    requiredActionFindings.map(f => f.line).join(',') === '7,7,9,10'
    && requiredActionFindings[0]?.column === actionCalls.indexOf('"Run') + 1
    && requiredActionFindings[1]?.column === actionCalls.lastIndexOf('"Run') + 1
    && requiredActionFindings.every(f => f.severity === 'warning' && f.file === actionFile
      && f.target?.file === actionFile && f.target.line === 2 && f.detail.includes('"required"')),
    requiredActionFindings);
  const foreignActionProject = addFile(fixtureProject(), {
    path: 'md/foreign_action_argument.xml', kind: 'md',
    content: '<mdscript name="ForeignActionArgument"><cues><library name="Run" purpose="run_actions"><params><param name="Required"/></params></library>'
      + '<cue name="Caller"><actions><run_actions ref="Run"><x:param xmlns:x="urn:fixture" name="Required" value="1"/></run_actions></actions></cue></cues></mdscript>',
  });
  ok('run_actions does not infer required absence from foreign supplied parameters',
    validateProjectCrossFile(foreignActionProject).findings.every(f => f.code !== missingActionCode));
  const scopedLibrary = '<library name="Run" purpose="run_actions"><params><param name="Required"/></params></library>';
  const scopedCall = '<run_actions ref="Run"/>';
  const wrapForeign = (element: string) => `<foreign xmlns="urn:fixture">${element.replace(' ', ' xmlns="" ')}</foreign>`;
  for (const [name, library, invocation] of [
    ['caller', scopedLibrary, wrapForeign(scopedCall)],
    ['provider', wrapForeign(scopedLibrary), scopedCall],
  ]) {
    const actionInForeignContext = addFile(fixtureProject(), {
      path: 'md/foreign_action_context.xml', kind: 'md',
      content: `<mdscript name="ForeignActionContext"><cues>${library}<cue name="Caller"><actions>${invocation}</actions></cue></cues></mdscript>`,
    });
    const missing = validateProjectCrossFile(actionInForeignContext).findings.filter(f => f.code === missingActionCode);
    ok(`run_actions does not infer required absence under foreign ${name} ancestry`, missing.length === 0, missing);
  }
  const ambiguousActions = validateProjectCrossFile(addFile(actionProject, {
    path: 'md/ambiguous_action_provider.xml', kind: 'md',
    content: '<mdscript name="actionprovider"><cues/></mdscript>',
  })).findings.filter(f => f.code === actionCode);
  ok('run_actions keeps ambiguous qualified providers quiet',
    ambiguousActions.length === 2 && ambiguousActions.every(f => f.target?.file === actionFile), ambiguousActions);

  let instanceProject = addFile(fixtureProject(), {
    path: 'md/instances.xml',
    kind: 'md',
    content: [
      '<mdscript name="Instances"><cues>',
      '  <library name="Here"><cues><library name="Nested"/></cues></library>',
      '  <cue name="Cross" ref="md.Contract.RenamedLibrary"/>',
      "  <cue name='Local' ref='RenamedHere'/>",
      '  <cue name="GoodCross" ref="md.Contract.Call_chat"/>',
      '  <cue name="GoodLocal" ref="Here"/>',
      '  <cue name="GoodNested" ref="Nested"/>',
      '  <cue name="CaseVariant" ref="here"/>',
      '  <cue name="External" ref="md.External.Missing"/>',
      '  <cue name="Dynamic" ref="$library"/>',
      '  <cue name="Compound" ref="md.Contract.Call_chat.member"/>',
      '  <cue name="MalformedTarget" ref="md.Broken.Missing"/>',
      '  <!-- <cue name="Comment" ref="Missing"/> -->',
      '</cues></mdscript>',
    ].join('\n'),
  });
  instanceProject = addFile(instanceProject, {
    path: 'md/broken.xml', kind: 'md', content: '<mdscript name="Broken"><cues></mdscript>',
  });
  const instanceFindings = (project: ExtensionProject) => validateProjectCrossFile(project).findings
    .filter(f => f.code === 'md.cue_library_ref_unresolved');
  const instanceResult = validateProjectCrossFile(instanceProject);
  const missingInstances = instanceResult.findings.filter(f => f.code === 'md.cue_library_ref_unresolved');
  ok('cue_instances_report_only_missing_direct_project_refs_at_source',
    missingInstances.length === 2 && missingInstances.every(f => f.severity === 'error'
      && f.file === 'md/instances.xml' && (f.column ?? 0) > 3)
      && missingInstances[0]?.line === 3 && missingInstances[1]?.line === 4
      && instanceResult.summary.unresolvedCueRefs === 2
      && instanceResult.summary.cueReferences === instanceResult.cueIndex.references.length + 6, missingInstances);
  const ambiguousInstances = instanceFindings(addFile(instanceProject, {
    path: 'md/other_contract.xml', kind: 'md', content: '<mdscript name="contract"><cues/></mdscript>',
  }));
  ok('cue_instances_do_not_claim_a_missing_name_in_ambiguous_scripts',
    ambiguousInstances.length === 1 && ambiguousInstances[0]?.line === 4, ambiguousInstances);

  const duplicateFile = 'md/duplicate_names.xml';
  const duplicateProject = addFile(addFile(fixtureProject(), {
    path: duplicateFile, kind: 'md',
    content: '<mdscript name="Duplicated"><cues><cue name="First"><cues><cue name="Listen"/></cues></cue>\n'
      + '<cue name="Second"><cues><cue name="LIsten"/><cue name="Listen"/></cues></cue><library name="Listen"/></cues></mdscript>',
  }), {
    path: 'md/other_names.xml', kind: 'md',
    content: '<mdscript name="Duplicated"><cues><cue name="Listen"/></cues></mdscript>',
  });
  const duplicates = validateProjectCrossFile(duplicateProject).findings.filter(f => f.code === 'md.cue_duplicate_name');
  ok('duplicate_cue_and_library_names_are_exact_and_scoped_to_each_file',
    duplicates.length === 2 && duplicates.every(f => f.file === duplicateFile && f.line === 2
      && f.target?.file === duplicateFile && f.target?.line === 1)
      && (duplicates[0]?.column ?? 0) < (duplicates[1]?.column ?? 0), duplicates);

  const duplicateDeps = addFile(fixtureProject(), {
    path: 'content.xml',
    kind: 'content',
    content: buildContentXml({ id: 'ai_influence', name: 'AI Influence', deps: [
      { id: 'djfhe_http', optional: true },
      { id: 'djfhe_http', optional: false },
    ] }),
  });
  const dup = validateProjectCrossFile(duplicateDeps);
  ok('flags_duplicate_dependency', dup.findings.some(f => f.code === 'dep.duplicate' && f.severity === 'warning'), dup.findings);

  // #62 (FF-23): Conversation-triggered UI menu without deferred redraw.
  const convDirectNoRedraw = addFile(addFile(fixtureProject(), {
    path: 'md/conv_direct.xml', kind: 'md',
    content: `<mdscript name="ConvDirect"><cues><cue name="OnTalk" instantiate="true">
      <conditions><event_conversation_started conversation="default"/></conditions>
      <actions><raise_lua_event name="'qa.open_conv_menu'"/></actions>
    </cue></cues></mdscript>`,
  }), {
    path: 'ui/conv_menu.lua', kind: 'lua',
    content: `local menu = { name = "QA_Conv_Menu", active = false }
function menu.onShowMenu()
  menu.active = true
  menu.display()
end
function menu.display() end
RegisterEvent("qa.open_conv_menu", function() OpenMenu(menu.name, nil, nil, true) end)`,
  });
  const convDirectFindings = validateProjectCrossFile(convDirectNoRedraw).findings
    .filter(f => f.code === 'md_lua.conversation_menu_without_deferred_redraw');
  ok('conversation_menu_without_onupdate_redraw_is_flagged',
    convDirectFindings.length === 1
      && convDirectFindings[0].severity === 'warning'
      && convDirectFindings[0].file === 'ui/conv_menu.lua'
      && convDirectFindings[0].line === 2
      && convDirectFindings[0].event === 'qa.open_conv_menu'
      && convDirectFindings[0].sourceRef === 'qa.open_conv_menu->QA_Conv_Menu'
      && convDirectFindings[0].target?.file === 'md/conv_direct.xml'
      && convDirectFindings[0].detail.includes('drawn under the conversation menu - add a deferred redraw'),
    convDirectFindings);

  // Transitive <run_actions> + cross-file rawget(_G, ...) + unrelated _cardDirty redraw + reset _openRequested = false:
  // mirrors pre-fix #110 in x4_ai_influence (must flag) vs post-fix _liftAt + liftDue (must pass).
  const buildCrossFileConvMenuProject = (withLift: boolean) => addFile(addFile(addFile(addFile(fixtureProject(), {
    path: 'md/conv_entry.xml', kind: 'md',
    content: `<mdscript name="ConvEntry"><cues><cue name="StartTalk" instantiate="true">
      <conditions><check_any><event_conversation_started conversation="default"/></check_any></conditions>
      <actions><run_actions ref="md.ConvLib.Open_overlay"/></actions>
    </cue></cues></mdscript>`,
  }), {
    path: 'md/conv_lib.xml', kind: 'md',
    content: `<mdscript name="ConvLib"><cues>
      <library name="Open_overlay" purpose="run_actions"><actions>
        <raise_lua_event name="'qa.open_terminal'"/>
      </actions></library>
    </cues></mdscript>`,
  }), {
    path: 'ui/transport.lua', kind: 'lua',
    content: `local onOpen
onOpen = function()
  local m = rawget(_G, "QA_Terminal_Menu")
  if m then
    m._openRequested = true
    pcall(OpenMenu, m.name, nil, nil, true)
  end
end
local _reg = RegisterEvent
local function RegisterEvent(ev, fn) _reg(ev, fn) end
RegisterEvent("qa.open_terminal", onOpen)`,
  }), {
    path: 'ui/terminal_menu.lua', kind: 'lua',
    content: `QA_Terminal_Menu = { name = "QA_Terminal", active = false }
local menu = QA_Terminal_Menu
menu.LIFT_S = 0.3
function menu.liftDue(now)
  return menu._liftAt ~= nil and menu.active == true and (tonumber(now) or 0) >= menu._liftAt
end
function menu.onShowMenu()
  if not menu._openRequested then return end
  menu._openRequested = false
  menu.active = true
  menu.display()
  ${withLift ? 'menu._liftAt = ((GetCurRealTime and GetCurRealTime()) or 0) + menu.LIFT_S' : ''}
end
function menu.display() end
function menu.onUpdate()
  if menu._cardDirty and menu.active then
    menu._cardDirty = nil
    menu.display()
  end
  if menu.liftDue((GetCurRealTime and GetCurRealTime()) or 0) then
    menu._liftAt = nil
    menu.display()
  end
end`,
  });

  const preLiftFindings = validateProjectCrossFile(buildCrossFileConvMenuProject(false)).findings
    .filter(f => f.code === 'md_lua.conversation_menu_without_deferred_redraw');
  ok('conversation_menu_with_only_unarmed_or_reset_flags_in_onupdate_is_flagged',
    preLiftFindings.length === 1
      && preLiftFindings[0].file === 'ui/terminal_menu.lua'
      && preLiftFindings[0].target?.file === 'md/conv_lib.xml',
    preLiftFindings);

  const postLiftFindings = validateProjectCrossFile(buildCrossFileConvMenuProject(true)).findings
    .filter(f => f.code === 'md_lua.conversation_menu_without_deferred_redraw');
  ok('conversation_menu_with_open_armed_lift_deadline_is_clean',
    postLiftFindings.length === 0,
    postLiftFindings);

  const nonConvAndChildCueProject = addFile(addFile(fixtureProject(), {
    path: 'md/non_conv.xml', kind: 'md',
    content: `<mdscript name="NonConv"><cues>
      <cue name="UiOpen"><conditions><event_ui_triggered screen="'s'" control="'c'"/></conditions>
        <actions><raise_lua_event name="'qa.ui_only_open'"/></actions>
      </cue>
      <cue name="DisabledConv"><conditions><event_conversation_started check="false"/></conditions>
        <actions><raise_lua_event name="'qa.disabled_conv_open'"/></actions>
      </cue>
      <cue name="ParentConv"><conditions><event_conversation_started/></conditions>
        <cues><cue name="NestedChild"><conditions><event_cue_signalled/></conditions>
          <actions><raise_lua_event name="'qa.nested_child_open'"/></actions>
        </cue></cues>
      </cue>
    </cues></mdscript>`,
  }), {
    path: 'ui/non_conv_menu.lua', kind: 'lua',
    content: `local menu = { name = "QA_NonConv_Menu" }
function menu.onShowMenu() menu.display() end
function menu.display() end
RegisterEvent("qa.ui_only_open", function() OpenMenu(menu.name) end)
RegisterEvent("qa.disabled_conv_open", function() OpenMenu(menu.name) end)
RegisterEvent("qa.nested_child_open", function() OpenMenu(menu.name) end)`,
  });
  const nonConvFindings = validateProjectCrossFile(nonConvAndChildCueProject).findings
    .filter(f => f.code === 'md_lua.conversation_menu_without_deferred_redraw');
  ok('menus_not_opened_from_active_conversation_started_are_not_flagged',
    nonConvFindings.length === 0,
    nonConvFindings);

  const passed = checks.filter(c => c.pass).length;
  return { allPassed: passed === checks.length, pass: passed === checks.length, passed, total: checks.length, checks };
}
