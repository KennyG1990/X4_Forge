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
import {
  buildMdLibraryIndex, classifyCueRef, duplicateMdCueMessage, findDuplicateMdCueDeclarations,
  mdReferencePoint, parseMdScriptRoot, readMdLibrarySignature, readMdReferenceArguments, resolveMdLibraryReference,
  type MdLibraryDeclaration, type MdLibraryScript, type MdLibrarySignature, type MdReferenceFact,
} from './cueLineage';
import { EFFECTIVE_MD_ARGUMENT_CHECK, EFFECTIVE_MD_REFERENCE_CHECK,
  type EffectiveMdReferenceContext, type MdReferenceCoverageGap, type MdReferenceSourcePoint } from './mdEffectiveLibraryPurpose';
import { collectMdStringResults } from './expressionAst';
import type { ValidationSourceLocation } from './validationEvidence';
import { normPath, parseXmlLenient, walkElements } from './xmlLite';
import { parse } from 'luaparse';
import { DOMParser, type Attr as XmlAttr, type Element as XmlElement } from '@xmldom/xmldom';
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
  /** Stable authored rule identity when several calls share one cause position. */
  sourceRef?: string;
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
  index?: LuaAstNode;
  indexer?: string;
  arguments?: LuaAstNode[];
  [key: string]: unknown;
}

function walkLuaAst(
  node: unknown,
  visit: (node: LuaAstNode, scope: LuaAstNode | undefined, branches: readonly LuaAstNode[]) => void,
  scope?: LuaAstNode,
  branches: readonly LuaAstNode[] = [],
): void {
  if (!node || typeof node !== 'object') return;
  const ast = node as LuaAstNode;
  visit(ast, scope, branches);
  if (ast.type === 'FunctionDeclaration') {
    scope = ast;
    branches = [];
  } else if (ast.type === 'IfClause' || ast.type === 'ElseifClause' || ast.type === 'ElseClause') {
    branches = [...branches, ast];
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'range' || key === 'comments' || key === 'tokens' || key === 'globals') continue;
    if (Array.isArray(value)) value.forEach(item => walkLuaAst(item, visit, scope, branches));
    else if (value && typeof value === 'object') walkLuaAst(value, visit, scope, branches);
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

interface PayloadReadSite { file: string; destination: string; branch?: string; event?: [string, string] }
interface PayloadWriteSite { key: string; file: string; table: string; events: string[]; unverified: boolean }

function payloadReadEvent(element: Element): [string, string] | undefined {
  for (let owner = element.parentElement; owner; owner = owner.parentElement) {
    if (owner.tagName !== 'cue' && owner.tagName !== 'library') continue;
    const conditions = Array.from(owner.childNodes).find(node => node.nodeType === 1 && node.nodeName === 'conditions') as Element | undefined;
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
    let doc: Document;
    try { doc = new DOMParser().parseFromString(file.content || '', 'text/xml') as unknown as Document; }
    catch { continue; }
    const elements = Array.from(doc.getElementsByTagName('*')) as Element[];
    for (const element of elements) {
      const attrs = Array.from(element.attributes || []);
      let event: PayloadReadSite['event'];
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
          event ??= payloadReadEvent(element);
          bucket[branch ? 'verb' : 'global'].push({ file: file.path, destination: element.getAttribute('name') || `<${element.tagName}>`,
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
    const seenEvents = new Set<string>();
    for (const site of sites) {
      const identity = JSON.stringify(site.event ?? null);
      if (seenEvents.has(identity)) continue;
      seenEvents.add(identity);
      if (write.some(candidate => site.event ? candidate.events.includes(identity) : candidate.table === 'payload')) continue;
      const possible = write.some(candidate => candidate.unverified || !site.event);
      const event = site.event?.join('.');
      const subject = `MD reads indexed payload key "${key}<n>"${event ? ` for "${event}"` : ''}`;
      findings.push(possible ? {
        code: 'md_lua.payload_writer_unverified', severity: 'warning', file: site.file, event,
        detail: `${subject}. Lua assigns that key, but Forge could not link the assignment to the table this reader receives.`,
      } : {
        code: 'md_lua.payload_missing_writer', severity: 'error', file: site.file, event,
        detail: `${subject}, but no matching Lua payload assignment was found.`,
      });
    }
    const legacyWriter = write.find(candidate => candidate.table === 'payload');
    if (legacyWriter && sites.length === 0) {
      findings.push({
        code: 'md_lua.payload_unused_writer', severity: 'error', file: legacyWriter.file,
        detail: `Lua writes indexed payload key "${key}<n>", but no project MD file reads param3.{'$${key}' + $si}.`,
      });
    }
  }
  return {
    findings,
    reads: [...reads.entries()].flatMap(([key, sites]) => [
      ...sites.global.map(({ event: _event, ...site }) => ({ key, scope: 'global' as const, ...site })),
      ...sites.verb.map(({ event: _event, ...site }) => ({ key, scope: 'verb' as const, ...site })),
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

function indexedPayloadTarget(variable: LuaAstNode, source: LuaAnalysisSource): { table: string; key: string } | undefined {
  const table = luaIdentifier(variable.base);
  const index = variable.index;
  const counter = index?.right;
  if (!table || variable.type !== 'IndexExpression' || index?.type !== 'BinaryExpression' || index.operator !== '..'
    || counter?.type !== 'MemberExpression' || counter.indexer !== '.' || luaIdentifier(counter.identifier) !== 'n'
    || luaIdentifier(counter.base) !== table || counter.base?.isLocal !== variable.base?.isLocal) return undefined;
  const literal = index.left;
  if (literal?.type !== 'StringLiteral' || typeof literal.value !== 'string'
    || luaStringLiteralTainted(literal, source.substituted) || !/^[A-Za-z][A-Za-z0-9_]*$/.test(literal.value)) return undefined;
  return { table, key: literal.value };
}

interface LuaPayloadPosition { scope?: LuaAstNode; branches: readonly LuaAstNode[]; at: number }
interface LuaPayloadAssignment extends LuaPayloadPosition { table: string; key: string; local: boolean }
interface LuaPayloadEmit extends LuaPayloadPosition { identity?: string }

function parseLuaUiEmits(content: string, file: string): {
  events: ProjectUiEventRef[]; coverage: LuaEmitCoverage; payloadWrites: PayloadWriteSite[];
} {
  const out: ProjectUiEventRef[] = [];
  const coverage: LuaEmitCoverage = { file, parsed: false, exact: 0, prefix: 0, unresolved: 0, reasons: [] };
  const gap = (reason: LuaEmitCoverage['reasons'][number]) => {
    if (!coverage.reasons.includes(reason)) coverage.reasons.push(reason);
  };
  const source = buildLuaAnalysisSource(content || '');
  let emitterRebound = false;
  let ast: LuaAstNode;
  try {
    ast = parse(source.content, {
      comments: false, ranges: true, scope: true, luaVersion: '5.2', encodingMode: 'pseudo-latin1',
      onLocalDeclaration(name: string) { if (name === '_ENV') emitterRebound = true; },
    });
  } catch {
    return { events: out, coverage, payloadWrites: [] }; // Registration analysis reports the parse failure for this file.
  }
  coverage.parsed = true;
  // Only immutable, unambiguous local constants may supply event arguments.
  // Shadowing or another assignment makes the name unknown, not a guessed value.
  const assignments = new Map<string, { count: number; init: LuaAstNode; local: boolean }>();
  const shadowed = new Set<string>();
  const trackEmitterWrite = (target: LuaAstNode | undefined) => {
    if (luaIdentifier(target) === '_ENV') emitterRebound = true;
    if (!isLuaGlobalEnvironment(target?.base)) return;
    const member = target.type === 'MemberExpression' ? luaIdentifier(target.identifier) : target.index?.value;
    if (member === 'AddUITriggeredEvent') emitterRebound = true;
  };
  walkLuaAst(ast, node => {
    if (node.type === 'FunctionDeclaration') {
      trackEmitterWrite(node.identifier);
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
    if (node.type === 'CallExpression' && luaIdentifier(node.base) === 'rawset' && node.base.isLocal === false
      && isLuaGlobalEnvironment(node.arguments?.[0]) && node.arguments?.[1]?.value === 'AddUITriggeredEvent') emitterRebound = true;
    if (node.type !== 'LocalStatement' && node.type !== 'AssignmentStatement') return;
    (node.variables || []).forEach((variable, index) => {
      trackEmitterWrite(variable);
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
  const indexedWrites: LuaPayloadAssignment[] = [];
  const indexedClears: LuaPayloadAssignment[] = [];
  const payloadEmits = new Map<string, LuaPayloadEmit[]>();
  walkLuaAst(ast, (node, scope, branches) => {
    if (node.type === 'AssignmentStatement') {
      (node.variables || []).forEach((variable, index) => {
        const target = indexedPayloadTarget(variable, source);
        if (!target) return;
        const value = node.init?.[index];
        const sites = value && value.type !== 'NilLiteral' ? indexedWrites : indexedClears;
        // Lua evaluates the entire RHS before any of the assignments take effect.
        sites.push({ ...target, local: variable.base?.isLocal === true, scope, branches, at: node.range![1] });
      });
    }
    if (node.type !== 'CallExpression' || luaIdentifier(node.base) !== 'AddUITriggeredEvent') return;
    const argument = node.arguments?.[2];
    const table = luaIdentifier(argument);
    const binding = table ? assignments.get(table) : undefined;
    let payloadEmit: LuaPayloadEmit | undefined;
    if (table && argument?.isLocal && binding?.count === 1 && binding.local
      && binding.init?.type === 'TableConstructorExpression' && !shadowed.has(table)) {
      payloadEmit = { scope, branches, at: node.range![0] };
      const sites = payloadEmits.get(table) || [];
      sites.push(payloadEmit);
      payloadEmits.set(table, sites);
    }
    if (node.base.isLocal) return;
    if (emitterRebound || assignments.has('AddUITriggeredEvent') || shadowed.has('AddUITriggeredEvent')) {
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
    else {
      coverage.exact++;
      if (payloadEmit) payloadEmit.identity = JSON.stringify([namespace.value, control.value]);
    }
    // A literal trailing underscore is still an exact name; only an actual
    // unresolved concatenation justifies prefix matching.
    out.push({ namespace: namespace.value, control: control.value, event: `${namespace.value}.${control.value}`, file, ...(control.prefix ? { prefix: true } : {}) });
  });
  const payloadWrites = indexedWrites.map((write): PayloadWriteSite => {
    const { key, table } = write;
    const emits = write.local ? payloadEmits.get(table) || [] : [];
    const events = new Set<string>();
    let unverified = false;
    for (const emit of emits) {
      if (emit.scope !== write.scope) {
        unverified = true;
        continue;
      }
      const compatible = write.branches.every((branch, index) => branch === emit.branches[index]);
      const cleared = indexedClears.some(clear => clear.local && clear.scope === write.scope && clear.table === table
        && clear.key === key && clear.at >= write.at && clear.at < emit.at);
      if (emit.identity && write.at <= emit.at && compatible && !cleared) events.add(emit.identity);
      else unverified = true;
    }
    return { key, file, table, events: [...events], unverified: unverified || events.size === 0 };
  });
  return { events: out, coverage, payloadWrites };
}

function findContentManifest(project: ExtensionProject): ModManifest | null {
  const content = (project.files || []).find(f => normPath(f.path).toLowerCase() === 'content.xml');
  return content ? parseModManifest(project.id || 'project', content.content || '') : null;
}

function libraryArgumentFacts<S>(call: MdReferenceFact<S>, signature: MdLibrarySignature<S>, library: S | undefined,
  parameterIndex?: ReadonlyMap<string, { name: string; hasDefault: boolean; point?: S }>,
  requiredIndex?: ReadonlyMap<string, { name: string; hasDefault: boolean; point?: S }>) {
  const findings: Array<{ code: 'md.cue_library_param_undeclared' | 'md.cue_library_param_required' | 'md.run_actions_param_undeclared';
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
  // Omitted action arguments need a separate X4 witness.
  if (action) return findings;
  const required = requiredIndex ?? new Map([...declared].filter(([, declaration]) => !declaration.hasDefault));
  for (const [parameter, declaration] of required) {
    if (!supplied.has(parameter)) {
      findings.push({ code: 'md.cue_library_param_required', severity: 'error',
        point: call.missingArgumentPoints?.get(parameter) ?? (call.missingArgumentsUnavailable ? undefined : call.refPoint ?? call.point), target: declaration.point,
        detail: `${caller} calls library "${ref}" without required parameter "${parameter}".` });
    }
  }
  return findings;
}

function libraryArgumentFindings(
  call: XmlElement, reference: XmlAttr, library: XmlElement, file: string, targetFile: string,
): ProjectCrossFileFinding[] {
  type DomPoint = { node: XmlElement; attribute?: XmlAttr };
  const point = (node: XmlElement | XmlAttr): DomPoint => node.nodeType === 2
    ? { node: (node as XmlAttr).ownerElement!, attribute: node as XmlAttr } : { node: node as XmlElement };
  const facts = libraryArgumentFacts<DomPoint>({ id: '', role: call.nodeName === 'run_actions' ? 'run_actions' : 'cue',
    ref: reference.value, name: call.getAttribute('name') ?? undefined, point: point(call), refPoint: point(reference),
    arguments: readMdReferenceArguments(call, node => point(node as XmlElement | XmlAttr)) },
  readMdLibrarySignature(library, node => point(node as XmlElement)), point(library));
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
      gap(EFFECTIVE_MD_REFERENCE_CHECK, file, `Authored ${call.role} reference ${call.id} has no reliable original diagnostic cause position.`);
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
        gap(EFFECTIVE_MD_ARGUMENT_CHECK, document.file, `Authored ${call.role} reference ${call.id} has unavailable supplied arguments. ${call.argumentsUnavailable}`);
      }
      if (call.role === 'reset_cue' || call.role === 'cancel_cue') continue; // Name resolution is their existing contract.
      const primary = mdReferencePoint(call);
      const signal = call.role === 'signal_cue' || call.role === 'signal_cue_instantly';
      const classification = classifyCueRef(call.ref.trim());
      if (signal && classification.kind === 'keyword') continue;
      const resolved = resolveMdLibraryReference(context.index, document.name, call.ref, { cueReference: signal });
      if (!resolved || (resolved.declaration && resolved.declaration.name !== resolved.targetName) || (resolved.declared && !resolved.declaration)) {
        gap(EFFECTIVE_MD_REFERENCE_CHECK, document.file, `Authored ${call.role} reference ${call.id} has an external, unsupported, case-mismatched or ambiguous final target.`);
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
        gap(EFFECTIVE_MD_REFERENCE_CHECK, document.file, `Authored ${call.role} reference ${call.id} has no exact final library contract.`);
        continue;
      }
      if (call.role === 'include_actions') {
        // The existing effective include-purpose pass owns run-library errors and
        // inherited provider changes, using this same final declaration index.
        if (library.purpose !== null && library.purpose !== 'include_actions' && library.purpose !== 'run_actions') {
          gap(EFFECTIVE_MD_REFERENCE_CHECK, document.file, `Authored include_actions reference ${call.id} has an unsupported library-purpose contract.`);
        }
        continue;
      }
      if ((call.role === 'run_actions' && library.purpose !== 'run_actions')
        || (call.role === 'cue' && library.purpose !== null && library.purpose !== 'cue_ref')) {
        gap(EFFECTIVE_MD_REFERENCE_CHECK, document.file, `Authored ${call.role} reference ${call.id} has an unsupported library-purpose contract.`);
        continue;
      }
      const signature = library.source.signature;
      if (call.argumentsUnavailable) continue;
      if (!signature || signature.status !== 'known') {
        gap(EFFECTIVE_MD_ARGUMENT_CHECK, document.file, `Authored ${call.role} reference ${call.id} has an unavailable parameter signature. ${signature?.status === 'unavailable' ? signature.reason : ''}`);
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
          gap(EFFECTIVE_MD_ARGUMENT_CHECK, document.file, `Authored argument contract ${call.id}:${index} has no reliable original argument/call position.`);
          continue;
        }
        const target = related(provider, finding.target);
        const coordinate = [target.file, target.line, target.column].filter(part => part !== undefined).join(':');
        report(finding.code, finding.severity, document.file, call, finding.point, `${finding.detail} See ${coordinate}.`, target, String(index));
      }
      if (call.role === 'run_actions') {
        const supplied = new Set(call.arguments.map(argument => argument.name));
        let suppliedRequired = 0;
        for (const name of supplied) if (compiled.required.has(name)) suppliedRequired++;
        if (suppliedRequired < compiled.required.size) {
          gap(EFFECTIVE_MD_ARGUMENT_CHECK, document.file, `Authored run_actions reference ${call.id} omits required library arguments; required action-argument policy remains a separate check.`);
        }
      }
    }
  }
  return { checked, findings, coverageGaps };
}

export function validateProjectCrossFile(project: ExtensionProject, options: {
  cueIndex?: CueReferenceIndex; effectiveContext?: EffectiveMdReferenceContext;
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
  const payload = validateIndexedPayloadContract(mdFiles, emitAnalyses.flatMap(analysis => analysis.payloadWrites));
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
    ...(effectiveReferences?.coverageGaps.length ? { coverageGaps: effectiveReferences.coverageGaps } : {}),
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

  const indexedEventProject = (lua: string, screen = 'forge_qa', control = 'player_orders') => addFile(addFile(fixtureProject(), {
    path: 'ui/orders.lua', kind: 'lua', content: lua,
  }), {
    path: 'md/orders.xml', kind: 'md',
    content: `<mdscript name="Orders"><cues><cue name="Resolve" instantiate="true" namespace="this">
      <conditions><event_ui_triggered screen="'${screen}'" control="'${control}'"/></conditions>
      <actions><set_value name="$order" exact="event.param3.{'$po' + $si}"/></actions>
    </cue></cues></mdscript>`,
  });
  const localTable = 'local p = { n = 1 }';
  const indexedWrite = `p["po" .. p.n] = "order"`;
  const emit = `AddUITriggeredEvent("forge_qa", "player_orders", p)`;
  const loop = `for _, order in ipairs(orders or {}) do p.n = p.n + 1; p["po" .. p.n] = order end`;
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
  ];
  for (const test of writerCases) {
    const result = validateProjectCrossFile(indexedEventProject(test.lua, test.screen, test.control));
    const actual = result.findings.filter(finding => finding.code.startsWith('md_lua.payload_'));
    ok(`indexed_payload_${test.name}`,
      actual.length === test.expected.length && actual.every((finding, index) =>
        finding.code === `md_lua.${test.expected[index]}`
        && finding.severity === (finding.code === 'md_lua.payload_writer_unverified' ? 'warning' : 'error'))
        && result.mdLua.payload.writes.some(write => write.key === 'po') === !test.noWrite,
      { findings: actual, payload: result.mdLua.payload });
  }

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

  const passed = checks.filter(c => c.pass).length;
  return { allPassed: passed === checks.length, pass: passed === checks.length, passed, total: checks.length, checks };
}
