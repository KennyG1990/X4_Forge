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
} from './extensionProject';
import { parseModManifest, type ModDependency, type ModManifest } from './modDependencyGraph';
import { classifyCueRef, duplicateMdCueMessage, findDuplicateMdCueDeclarations, parseMdScriptRoot } from './cueLineage';
import { collectMdStringResults } from './expressionAst';
import type { ValidationSourceLocation } from './validationEvidence';
import { normPath, parseXmlLenient, walkElements } from './xmlLite';
import { parse } from 'luaparse';
import { DOMParser, type Element as XmlElement } from '@xmldom/xmldom';
import { stripLuaComments } from './luaStaticAnalysis';
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
  | 'md_lua.payload_unused_writer'
  | 'dep.missing_content_xml'
  | 'dep.duplicate'
  | 'dep.self'
  | 'md.signal_library'
  | 'md.run_actions_nonlibrary'
  | 'md.include_actions_run_library'
  | 'md.cue_library_ref_unresolved'
  | 'md.cue_duplicate_name'
  | 'validation.lua_ast_unavailable'
  | 'ui.invalid_registration';

export interface ProjectCrossFileFinding {
  code: ProjectCrossFileFindingCode;
  severity: 'error' | 'warning' | 'info';
  file?: string;
  line?: number;
  column?: number;
  target?: ValidationSourceLocation;
  event?: string;
  dependencyId?: string;
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
  mdLua: {
    raised: ProjectEventRef[];
    registered: ProjectEventRef[];
    emitted: ProjectUiEventRef[];
    listened: ProjectUiEventRef[];
    missingRegisters: ProjectEventRef[];
    missingListeners: ProjectUiEventRef[];
    parseUnavailable: Array<{ file: string; detail: string }>;
    emitCoverage: {
      scope: 'direct-global-AddUITriggeredEvent-calls';
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
  left?: LuaAstNode;
  right?: LuaAstNode;
  identifier?: LuaAstNode;
  variable?: LuaAstNode;
  variables?: LuaAstNode[];
  init?: LuaAstNode[];
  parameters?: LuaAstNode[];
  body?: LuaAstNode[];
  expression?: LuaAstNode;
  base?: LuaAstNode;
  arguments?: LuaAstNode[];
  [key: string]: unknown;
}

function walkLuaAst(node: unknown, visit: (node: LuaAstNode) => void): void {
  if (!node || typeof node !== 'object') return;
  visit(node as LuaAstNode);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'range' || key === 'comments' || key === 'tokens' || key === 'globals') continue;
    if (Array.isArray(value)) value.forEach(item => walkLuaAst(item, visit));
    else if (value && typeof value === 'object') walkLuaAst(value, visit);
  }
}

function luaIdentifier(node: LuaAstNode): string | null {
  return node?.type === 'Identifier' && typeof node.name === 'string' ? node.name : null;
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
    if (content.charCodeAt(index) > 0xff) {
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

function parseLuaRegisteredEvents(content: string, file: string): LuaRegistrationParseResult {
  const source = buildLuaAnalysisSource(content || '');
  let ast: LuaAstNode;
  try {
    ast = parse(source.content, { comments: false, locations: true, ranges: true, scope: true, luaVersion: '5.2', encodingMode: 'pseudo-latin1' });
  } catch (error) {
    return { events: [], available: false, detail: boundedLuaParseDetail(error) };
  }

  const assignments = new Map<string, { count: number; init: LuaAstNode; local: boolean }>();
  const parameters = new Set<string>();
  const functions = new Map<string, LuaAstNode>();
  walkLuaAst(ast, node => {
    if (node.type === 'FunctionDeclaration') {
      const name = luaIdentifier(node.identifier);
      if (name) {
        functions.set(name, node);
        assignments.set(name, { count: (assignments.get(name)?.count || 0) + 1, init: node, local: !!node.isLocal });
      }
      for (const parameter of node.parameters || []) {
        const name = luaIdentifier(parameter); if (name) parameters.add(name);
      }
    }
    if (node.type === 'ForGenericStatement' || node.type === 'ForNumericStatement') {
      for (const variable of node.variables || [node.variable]) {
        const name = luaIdentifier(variable); if (name) parameters.add(name);
      }
    }
    if (node.type !== 'LocalStatement' && node.type !== 'AssignmentStatement') return;
    (node.variables || []).forEach((variable, index) => {
      const name = luaIdentifier(variable);
      if (name) assignments.set(name, { count: (assignments.get(name)?.count || 0) + 1,
        init: (node.init || [])[index], local: node.type === 'LocalStatement' });
    });
  });
  const strings = new Map<string, LuaStringValue>();
  const resolve = (expression: LuaAstNode) => {
    let foreign = false;
    walkLuaAst(expression, node => { if (node.type === 'Identifier' && strings.has(node.name) && !node.isLocal) foreign = true; });
    return foreign ? null : luaStringPrefix(expression, strings, source.substituted);
  };
  const immutable = (name: string) => assignments.get(name)?.count === 1 && assignments.get(name)?.local && !parameters.has(name);
  for (const [name, assignment] of assignments) {
    if (!immutable(name)) continue;
    const value = resolve(assignment.init); if (value) strings.set(name, value);
  }
  const registrars = new Set<string>();
  const possibleRegistrars = new Set<string>(['RegisterEvent']);
  // Retain possible aliases even after reassignment so they produce a gap, not invented certainty.
  walkLuaAst(ast, node => {
    if (node.type !== 'LocalStatement' && node.type !== 'AssignmentStatement') return;
    (node.variables || []).forEach((variable, i) => {
      const name = luaIdentifier(variable), sourceName = luaIdentifier(node.init?.[i]);
      if (name && sourceName && possibleRegistrars.has(sourceName)) possibleRegistrars.add(name);
    });
  });
  const engineRegistrar = (node: LuaAstNode): boolean => {
    const name = luaIdentifier(node);
    if (name === 'RegisterEvent') return !node.isLocal && !assignments.has(name) && !parameters.has(name);
    return !!name && node.isLocal && registrars.has(name);
  };
  for (const [name, assignment] of assignments) {
    if (immutable(name) && engineRegistrar(assignment.init)) registrars.add(name);
  }
  // Support only a single unconditional forwarding call. More complex wrappers remain unverified.
  const wrappers = new Map<string, number>();
  const forwardingCalls = new Set<LuaAstNode>();
  for (const [wrapperName, node] of functions) {
    if (!immutable(wrapperName) || node.body?.length !== 1) continue;
    const call = node.body[0]?.type === 'CallStatement' ? node.body[0].expression : null;
    if (!call || !engineRegistrar(call.base)) continue;
    const params = (node.parameters || []).map(luaIdentifier);
    if (new Set(params).size !== params.length) continue;
    const index = params.indexOf(luaIdentifier(call.arguments?.[0]));
    if (index >= 0) { wrappers.set(wrapperName, index); forwardingCalls.add(call); }
  }

  const out: ProjectEventRef[] = [];
  const seen = new Set<string>();
  let taintedEventArgument = false;
  let unverified = false;
  walkLuaAst(ast, node => {
    if (node.type !== 'CallExpression' || forwardingCalls.has(node)) return;
    const callee = luaIdentifier(node.base);
    if (!callee) return;
    // A locally defined function named RegisterEvent is not the engine API.
    if (callee === 'RegisterEvent' && node.base.isLocal) return;
    const argIndex = engineRegistrar(node.base) ? 0 : node.base.isLocal ? wrappers.get(callee) : undefined;
    if (argIndex === undefined) { if (possibleRegistrars.has(callee)) unverified = true; return; }
    const value = resolve((node.arguments || [])[argIndex]);
    if (value?.tainted) {
      taintedEventArgument = true;
      return;
    }
    if (!value?.value) { unverified = true; return; }
    if (value.prefix) unverified = true;
    const key = `${value.value}\0${value.prefix}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ event: value.value, file, ...(value.prefix ? { prefix: true } : {}) });
  });
  return taintedEventArgument
    ? {
      events: out,
      available: false,
      gap: true,
      detail: 'Lua registration event argument contains non-Latin-1 source text; registration analysis unavailable.',
    }
    : unverified ? { events: out, available: false, gap: true,
      detail: 'MD-to-Lua registration wiring is unverified: dynamic arguments, prefix-only matches, reassigned aliases or ambiguous callees cannot prove runtime registrations. Only immutable aliases and simple unconditional forwarding wrappers are supported.' }
    : { events: out, available: true };
}

interface PayloadReadSite { file: string; destination: string; branch?: string }
interface PayloadWriteSite { file: string }

/** Port of the observed x4_ai_influence wiregate invariant, scoped to its exact protocol shapes. */
function validateIndexedPayloadContract(mdFiles: ExtensionProject['files'], luaFiles: ExtensionProject['files']): {
  findings: ProjectCrossFileFinding[];
  reads: Array<{ key: string; scope: 'global' | 'verb'; file: string; destination: string; branch?: string }>;
  writes: Array<{ key: string; file: string }>;
} {
  const reads = new Map<string, { global: PayloadReadSite[]; verb: PayloadReadSite[] }>();
  const writes = new Map<string, PayloadWriteSite[]>();
  const readPattern = /param3\.\{'\$([A-Za-z][A-Za-z0-9_]*)'\s*\+\s*\$si\}/g;
  const writePattern = /payload\[\s*["']([A-Za-z][A-Za-z0-9_]*)["']\s*\.\.\s*payload\.n\s*\]/g;

  for (const file of luaFiles) {
    const code = stripLuaComments(file.content || '');
    let match: RegExpExecArray | null;
    while ((match = writePattern.exec(code)) !== null) {
      const sites = writes.get(match[1]) || [];
      sites.push({ file: file.path });
      writes.set(match[1], sites);
    }
  }
  for (const file of mdFiles) {
    if (!(file.content || '').includes('param3')) continue;
    let doc: Document;
    try { doc = new DOMParser().parseFromString(file.content || '', 'text/xml') as unknown as Document; }
    catch { continue; }
    const elements = Array.from(doc.getElementsByTagName('*')) as Element[];
    for (const element of elements) {
      const attrs = Array.from(element.attributes || []);
      for (const attr of attrs) {
        let match: RegExpExecArray | null;
        readPattern.lastIndex = 0;
        while ((match = readPattern.exec(attr.value || '')) !== null) {
          let branch: string | undefined;
          let parent = element.parentNode as Element | null;
          while (parent) {
            if (parent.nodeType === 1 && (parent.tagName === 'do_if' || parent.tagName === 'do_elseif') && /\$sv\s*==/.test(parent.getAttribute('value') || '')) {
              branch = parent.getAttribute('value') || undefined;
              break;
            }
            parent = parent.parentNode as Element | null;
          }
          const bucket = reads.get(match[1]) || { global: [], verb: [] };
          bucket[branch ? 'verb' : 'global'].push({ file: file.path, destination: element.getAttribute('name') || `<${element.tagName}>`, ...(branch ? { branch } : {}) });
          reads.set(match[1], bucket);
        }
      }
    }
  }

  // Do not infer a protocol from a generic use of `payload` or `param3`; at least one exact
  // indexed key shape must exist somewhere in the project.
  if (reads.size === 0 && writes.size === 0) return { findings: [], reads: [], writes: [] };
  const findings: ProjectCrossFileFinding[] = [];
  for (const key of new Set([...reads.keys(), ...writes.keys()])) {
    const read = reads.get(key) || { global: [], verb: [] };
    const write = writes.get(key) || [];
    if (read.global.length && read.verb.length) {
      findings.push({
        code: 'md_lua.payload_collision', severity: 'error', file: read.verb[0].file,
        detail: `Indexed payload key "${key}<n>" is read globally (${read.global.map(site => site.destination).join(', ')}) and inside a verb branch (${read.verb.map(site => site.destination).join(', ')}). A global slot belongs to every step and cannot be reused by one verb.`,
      });
    }
    if ((read.global.length || read.verb.length) && !write.length) {
      findings.push({
        code: 'md_lua.payload_missing_writer', severity: 'error', file: [...read.global, ...read.verb][0].file,
        detail: `MD reads indexed payload key "${key}<n>", but no project Lua file writes payload["${key}" .. payload.n].`,
      });
    }
    if (write.length && !(read.global.length || read.verb.length)) {
      findings.push({
        code: 'md_lua.payload_unused_writer', severity: 'error', file: write[0].file,
        detail: `Lua writes indexed payload key "${key}<n>", but no project MD file reads param3.{'$${key}' + $si}.`,
      });
    }
  }
  return {
    findings,
    reads: [...reads.entries()].flatMap(([key, sites]) => [
      ...sites.global.map(site => ({ key, scope: 'global' as const, ...site })),
      ...sites.verb.map(site => ({ key, scope: 'verb' as const, ...site })),
    ]),
    writes: [...writes.entries()].flatMap(([key, sites]) => sites.map(site => ({ key, ...site }))),
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

function parseLuaUiEmits(content: string, file: string): { events: ProjectUiEventRef[]; coverage: LuaEmitCoverage } {
  const out: ProjectUiEventRef[] = [];
  const coverage: LuaEmitCoverage = { file, parsed: false, exact: 0, prefix: 0, unresolved: 0, reasons: [] };
  const gap = (reason: LuaEmitCoverage['reasons'][number]) => {
    if (!coverage.reasons.includes(reason)) coverage.reasons.push(reason);
  };
  const source = buildLuaAnalysisSource(content || '');
  let ast: LuaAstNode;
  try {
    ast = parse(source.content, { comments: false, ranges: true, scope: true, luaVersion: '5.2', encodingMode: 'pseudo-latin1' });
  } catch {
    return { events: out, coverage }; // Registration analysis reports the parse failure for this file.
  }
  coverage.parsed = true;
  // Only immutable, unambiguous local constants may supply event arguments.
  // Shadowing or another assignment makes the name unknown, not a guessed value.
  const assignments = new Map<string, { count: number; init: LuaAstNode; local: boolean }>();
  const shadowed = new Set<string>();
  walkLuaAst(ast, node => {
    if (node.type === 'FunctionDeclaration') {
      const functionName = luaIdentifier(node.identifier);
      if (functionName) shadowed.add(functionName);
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
    if (node.type !== 'LocalStatement' && node.type !== 'AssignmentStatement') return;
    (node.variables || []).forEach((variable, index) => {
      const name = luaIdentifier(variable);
      if (!name) return;
      assignments.set(name, { count: (assignments.get(name)?.count || 0) + 1, init: (node.init || [])[index], local: node.type === 'LocalStatement' });
    });
  });
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
  for (const [name, assignment] of assignments) {
    if (assignment.count !== 1 || !assignment.local || shadowed.has(name)) continue;
    const value = resolve(assignment.init);
    if (value) strings.set(name, value);
  }
  walkLuaAst(ast, node => {
    if (node.type !== 'CallExpression' || luaIdentifier(node.base) !== 'AddUITriggeredEvent' || node.base.isLocal) return;
    if (assignments.has('AddUITriggeredEvent') || shadowed.has('AddUITriggeredEvent')) {
      coverage.unresolved++; gap('ambiguous-callee'); return;
    }
    const namespace = resolve(node.arguments?.[0]);
    const control = resolve(node.arguments?.[1]);
    if (namespace?.tainted || control?.tainted) {
      coverage.unresolved++; gap('source-encoding'); return;
    }
    if (!namespace?.value || namespace.prefix || !control?.value) {
      coverage.unresolved++; gap('dynamic-arguments'); return;
    }
    if (control.prefix) { coverage.prefix++; gap('prefix-only'); }
    else coverage.exact++;
    // A literal trailing underscore is still an exact name; only an actual
    // unresolved concatenation justifies prefix matching.
    out.push({ namespace: namespace.value, control: control.value, event: `${namespace.value}.${control.value}`, file, ...(control.prefix ? { prefix: true } : {}) });
  });
  return { events: out, coverage };
}

function findContentManifest(project: ExtensionProject): ModManifest | null {
  const content = (project.files || []).find(f => normPath(f.path).toLowerCase() === 'content.xml');
  return content ? parseModManifest(project.id || 'project', content.content || '') : null;
}

function validateCueLibraryReferences(mdFiles: ExtensionProject['files']) {
  const scripts = new Map<string, {
    name: string;
    file: string;
    references: XmlElement[];
    declarations: Map<string, XmlElement | null>;
  } | null>();
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
    const key = name.toLowerCase();
    if (scripts.has(key)) {
      scripts.set(key, null);
      continue;
    }
    const references: XmlElement[] = [];
    const declarations = new Map<string, XmlElement | null>();
    for (const node of Array.from(elements)) {
      if (node.nodeName === 'cue' || node.nodeName === 'include_actions') references.push(node);
      if (node.nodeName !== 'cue' && node.nodeName !== 'library') continue;
      const declaration = node.getAttribute('name')?.toLowerCase();
      if (declaration) declarations.set(declaration, declarations.has(declaration) ? null : node);
    }
    scripts.set(key, { name, file: file.path, references, declarations });
  }

  for (const script of scripts.values()) {
    if (!script) continue;
    for (const node of script.references) {
      const name = node.getAttribute('name');
      const attribute = node.getAttributeNode('ref');
      if (!attribute || (node.nodeName === 'cue' && !name)) continue;
      const ref = attribute.value.trim();
      const literal = /^(?:md\.([A-Za-z_][\w]*)\.)?([A-Za-z_][\w]*)$/.exec(ref);
      if (!literal || classifyCueRef(ref).kind === 'keyword') continue;
      const [, scriptName = script.name, targetName] = literal;
      const target = scripts.get(scriptName.toLowerCase());
      if (target?.name !== scriptName) continue;
      const targetKey = targetName.toLowerCase();
      if (node.nodeName === 'cue') {
        checked++;
        if (target.declarations.has(targetKey)) continue;
        findings.push({ code: 'md.cue_library_ref_unresolved', severity: 'error', file: script.file,
          line: attribute.lineNumber ?? node.lineNumber, column: attribute.columnNumber ?? node.columnNumber,
          detail: `Cue "${name}" references library "${ref}", which has no declaration in MD script "${scriptName}".` });
        continue;
      }
      const declaration = target.declarations.get(targetKey);
      if (declaration?.nodeName !== 'library' || declaration.getAttribute('name') !== targetName
        || declaration.getAttribute('purpose') !== 'run_actions') continue;
      const location = { file: target.file, line: declaration.lineNumber, column: declaration.columnNumber };
      const coordinate = [location.file, location.line, location.column].filter(part => part !== undefined).join(':');
      findings.push({
        code: 'md.include_actions_run_library', severity: 'error', file: script.file,
        line: node.lineNumber, column: node.columnNumber, target: location,
        detail: `<include_actions ref="${ref}"> targets a library declared with purpose="run_actions" at ${coordinate}. Use <run_actions> to call this library.`,
      });
    }
  }
  return { checked, findings };
}

export function validateProjectCrossFile(project: ExtensionProject): ProjectCrossFileValidationResult {
  const files = Array.isArray(project?.files) ? project.files : [];
  const structure = validateProjectStructure(project);
  const cueIndex = indexCueReferences(project);
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
    scope: 'direct-global-AddUITriggeredEvent-calls' as const,
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
      detail: `Lua-to-MD event wiring is not fully verified for ${unverified} direct AddUITriggeredEvent call(s): ${coverage.prefix} prefix-only, ${coverage.unresolved} unresolved (${coverage.reasons.join(', ')}). A possible prefix match is not proof of every runtime event.`,
    });
  }
  const payload = validateIndexedPayloadContract(mdFiles, luaFiles);
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
  const listenedEvents = new Set(listened.map(r => r.event));
  // Dynamic (concat-built) names match by PREFIX: `RegisterEvent(NS .. x)` with literal
  // prefix "ai_influence." satisfies any raised event starting with it, and a dynamic
  // emit "ai_influence.log_" is satisfied by ANY MD listener with that prefix
  // (ROADMAP AAR #2: aic_uix.lua `log_<category>` false-positived the exact match).
  const registeredPrefixes = registered.filter(r => r.prefix).map(r => r.event);
  const listenedList = [...listenedEvents];
  const missingRegisters = parseUnavailable.length > 0
    ? []
    : raised.filter(r => !registeredEvents.has(r.event)
      && !registeredPrefixes.some(p => r.event.startsWith(p)));
  const missingListeners = emitted.filter(r => r.prefix
    ? !listenedList.some(e => e.startsWith(r.event))
    : !listenedEvents.has(r.event));

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
    findings.push({
      code: 'lua_md.missing_listener',
      // A dynamic (prefix) emit with no matching listener is suspicious but can be
      // legitimately handled by fully-dynamic listeners the static scan can't see —
      // warning, not error (honest per the determinism-scope doctrine).
      severity: event.prefix ? 'warning' : 'error',
      file: event.file,
      event: event.event,
      detail: event.prefix
        ? `Lua emits dynamically-named UI events with prefix "${event.event}…" but no project MD file listens for any event with that prefix.`
        : `Lua emits UI event "${event.event}" but no project MD file listens for it.`,
    });
  }

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
  {
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

  const libraryReferences = validateCueLibraryReferences(mdFiles);
  findings.push(...libraryReferences.findings);
  const errors = findings.filter(f => f.severity === 'error').length;
  return {
    ok: errors === 0,
    summary: {
      files: files.length,
      findings: findings.length,
      errors,
      structuralErrors: structure.filter(i => i.severity === 'error').length,
      cueReferences: cueIndex.references.length + libraryReferences.checked,
      unresolvedCueRefs: cueIndex.unresolved.length + libraryReferences.findings
        .filter(finding => finding.code !== 'md.include_actions_run_library').length,
      mdLuaMissingRegisters: missingRegisters.length,
      luaMdMissingListeners: missingListeners.length,
      luaRegistrationUnavailable: parseUnavailable.length,
      luaEmitUnverified: emitCoverage.prefix + emitCoverage.unresolved,
      payloadContractErrors: payload.findings.filter(f => f.severity === 'error').length,
      dependencies: manifest?.deps.length || 0,
    },
    findings,
    cueIndex,
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

  const passed = checks.filter(c => c.pass).length;
  return { allPassed: passed === checks.length, pass: passed === checks.length, passed, total: checks.length, checks };
}
